import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { processCampaignChunk } from '@/lib/campaign-sender';

export const maxDuration = 300;

// Overall wall-clock budget for one cron invocation, kept comfortably under
// maxDuration so we always have time to return a clean response even if a
// campaign's own 45s chunk runs a little long.
const TICK_BUDGET_MS = 270_000;

/**
 * Vercel Cron hits this every minute (see vercel.json). It finds every
 * campaign still in 'sending' status across ALL teams/projects and pushes
 * each one forward by one send chunk, exactly like a manual "Send now"
 * click would. This is what keeps a 5,000-10,000+ contact send moving to
 * completion even if the browser tab that started it gets closed, the
 * laptop sleeps, or the connection drops — previously sending only ever
 * advanced while a browser tab was open and actively polling
 * /api/send/queue, which is why large campaigns would stall partway through
 * with no further batches ever firing.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const tickStart = Date.now();

  const { data: campaigns, error } = await db
    .from('campaigns')
    .select('id, team_id')
    .eq('status', 'sending');

  if (error) {
    return NextResponse.json({ error: `Failed to load sending campaigns: ${error.message}` }, { status: 500 });
  }

  const results: Array<{ campaign_id: string; reason?: string; sent: number; failed: number; total: number }> = [];

  for (const c of campaigns ?? []) {
    if (Date.now() - tickStart > TICK_BUDGET_MS) break; // leave remaining campaigns for the next tick
    try {
      const outcome = await processCampaignChunk(c.id, c.team_id);
      results.push({ campaign_id: c.id, reason: outcome.reason, sent: outcome.sent, failed: outcome.failed, total: outcome.total });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[cron/send-tick]', c.id, msg);
      results.push({ campaign_id: c.id, reason: 'error', sent: 0, failed: 0, total: 0 });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
