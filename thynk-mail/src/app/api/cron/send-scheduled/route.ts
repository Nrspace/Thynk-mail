/**
 * /api/cron/send-scheduled
 * ──────────────────────────────────────────────────────────────────────────
 * Runs every 5 minutes via Vercel Cron.
 * Finds all campaigns where:
 *   status = 'scheduled'  AND  scheduled_at <= NOW()
 * and fires them via the existing /api/send/queue SSE endpoint.
 *
 * Why not call /api/send/queue directly?
 *   The queue route streams SSE and can run for up to 5 minutes.
 *   A cron route calling it via fetch() would block the cron slot.
 *   Instead, we trigger it fire-and-forget (no await on body) and
 *   immediately return OK so Vercel marks the cron as successful.
 *
 * Vercel Hobby has 2 cron jobs max; this uses the second slot.
 * On Pro you can run every minute: "* * * * *"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Optional CRON_SECRET protection (set in Vercel env vars)
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db  = createServerClient();
  const now = new Date().toISOString();

  // Find all due scheduled campaigns for this team
  const { data: dueCampaigns, error } = await db
    .from('campaigns')
    .select('id, name, scheduled_at')
    .eq('team_id', DEMO_TEAM)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)   // scheduled_at is in the past or right now
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[cron/send-scheduled] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ fired: 0, message: 'No scheduled campaigns due', checkedAt: now });
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const fired: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const campaign of dueCampaigns) {
    try {
      // Immediately flip status to 'sending' so a second cron tick
      // can't double-fire the same campaign while it's still running
      const { error: updateErr } = await db
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('status', 'scheduled'); // only update if still 'scheduled' (race-condition guard)

      if (updateErr) {
        console.error(`[cron/send-scheduled] Could not lock campaign ${campaign.id}:`, updateErr.message);
        errors.push({ id: campaign.id, error: updateErr.message });
        continue;
      }

      // Fire the send queue — fire-and-forget, don't await the stream
      // We use keepalive:false because we're in a serverless function
      fetch(`${APP_URL}/api/send/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass an internal secret so the queue knows this came from cron
          'x-internal-trigger': process.env.CRON_SECRET ?? 'cron',
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      }).catch(e => {
        console.error(`[cron/send-scheduled] Fire error for ${campaign.id}:`, e.message);
      });

      console.log(`[cron/send-scheduled] Fired campaign "${campaign.name}" (${campaign.id}) scheduled for ${campaign.scheduled_at}`);
      fired.push(campaign.id);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[cron/send-scheduled] Error processing ${campaign.id}:`, msg);
      errors.push({ id: campaign.id, error: msg });
    }
  }

  return NextResponse.json({
    fired: fired.length,
    campaigns: fired,
    errors: errors.length > 0 ? errors : undefined,
    checkedAt: now,
  });
}
