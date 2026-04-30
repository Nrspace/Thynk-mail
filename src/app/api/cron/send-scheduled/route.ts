/**
 * /api/cron/send-scheduled
 * ─────────────────────────────────────────────────────────────────────────
 * Runs every hour via Vercel Cron (Hobby plan compatible).
 * Upgrade to Vercel Pro to use "*/5 * * * *" for near-real-time firing.
 *
 * Finds all campaigns where status='scheduled' AND scheduled_at <= NOW()
 * and triggers the send queue for each one.
 *
 * Race-condition safe: flips status to 'sending' before firing so a
 * second cron tick cannot double-fire the same campaign.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Optional CRON_SECRET protection — set in Vercel environment variables
  const secret =
    req.headers.get('x-cron-secret') ??
    req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db  = createServerClient();
  const now = new Date().toISOString();

  // Find all due scheduled campaigns
  const { data: dueCampaigns, error } = await db
    .from('campaigns')
    .select('id, name, scheduled_at')
    .eq('team_id', DEMO_TEAM)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('[cron/send-scheduled] DB error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({
      fired: 0,
      message: 'No scheduled campaigns due',
      checkedAt: now,
    });
  }

  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const fired: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const campaign of dueCampaigns) {
    try {
      // Flip status to 'sending' FIRST — prevents double-fire if cron overlaps
      const { error: updateErr } = await db
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id)
        .eq('status', 'scheduled'); // guard: only update if still 'scheduled'

      if (updateErr) {
        console.error(
          `[cron/send-scheduled] Lock failed for ${campaign.id}:`,
          updateErr.message
        );
        errors.push({ id: campaign.id, error: updateErr.message });
        continue;
      }

      // Fire queue — fire-and-forget (don't await the SSE stream)
      fetch(`${APP_URL}/api/send/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      }).catch((e: Error) => {
        console.error(
          `[cron/send-scheduled] Fetch error for ${campaign.id}:`,
          e.message
        );
      });

      console.log(
        `[cron/send-scheduled] Fired "${campaign.name}" (${campaign.id})`,
        `scheduled for ${campaign.scheduled_at}`
      );
      fired.push(campaign.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[cron/send-scheduled] Error for ${campaign.id}:`, msg);
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
