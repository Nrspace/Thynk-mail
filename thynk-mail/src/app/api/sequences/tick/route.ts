import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { runSequenceTick } from '@/lib/sequence-scheduler';
import { processCampaignChunk } from '@/lib/campaign-sender';

export const maxDuration = 300;

/**
 * Same job as /api/cron/send-tick, but triggered by a logged-in browser tab
 * (see SequenceTicker) and limited to the current project. It lets sequences
 * run without any external cron service while MailFlow is open; the cron,
 * when configured, does the same thing in the background.
 */
export async function POST() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const start = Date.now();
  const BUDGET_MS = 120_000;
  let sequences: unknown = null;
  try { sequences = await runSequenceTick(); }
  catch (e: unknown) { sequences = { error: e instanceof Error ? e.message : String(e) }; }

  const db = createServerClient();
  const { data: sending } = await db.from('campaigns').select('id').eq('team_id', projectId).eq('status', 'sending');

  let sent = 0;
  for (const c of sending ?? []) {
    if (Date.now() - start > BUDGET_MS) break;
    try { const o = await processCampaignChunk(c.id, projectId); sent += o.sent; } catch { /* next tick retries */ }
  }
  return NextResponse.json({ sending: sending?.length ?? 0, sent, sequences });
}
