import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { processCampaignChunk } from '@/lib/campaign-sender';

export const maxDuration = 300;

function makeStream() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (event: string, data: Record<string, unknown>) => {
    writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  };
  const done = () => writer.close().catch(() => {});
  return { readable, emit, done };
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  let campaign_id: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!campaign_id) {
    return new Response(JSON.stringify({ error: 'campaign_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { readable, emit, done } = makeStream();

  (async () => {
    const db = createServerClient();
    try {
      // Mark sending (idempotent — the cron tick and repeated browser
      // reconnects will happily pick this campaign up regardless of who
      // flipped it to 'sending' first).
      await db.from('campaigns').update({ status: 'sending' })
        .eq('id', campaign_id).eq('team_id', projectId).neq('status', 'sending');

      const result = await processCampaignChunk(campaign_id, projectId, emit);

      // This SSE connection only drives ONE chunk per HTTP request — the
      // browser-side loop (CampaignActions.tsx) re-POSTs on 'chunk' events
      // to keep going while the tab is open. Independently of that, the
      // Vercel Cron in /api/cron/send-tick also advances any campaign still
      // in 'sending' status every minute, so the send completes even if the
      // browser tab is closed, the laptop sleeps, or the network drops —
      // this was the root cause of large sends (5k/10k+) stalling partway
      // through with "no further batches": nothing was driving them forward
      // except a live browser tab.
      void result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[send/queue]', msg);
      try { await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id); } catch {}
      emit('error', { error: msg });
    } finally {
      done();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
