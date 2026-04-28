import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

/**
 * WHY THIS FILE WAS REWRITTEN
 * ============================
 * The old code mixed TWO different data sources for the same numbers:
 *
 *  1. TOTALS (stat cards, open rate, click rate) came from campaigns.sent_count /
 *     open_count / click_count — small numbers like 8 sent, 2 opened.
 *
 *  2. CHARTS & ACCOUNT STATS came from send_logs — which has ALL individual
 *     recipient rows, so 277 sent, 130 opened, etc.
 *
 * These will NEVER match because:
 *   - campaigns.sent_count is only the emails sent in the LAST campaign run.
 *     If a campaign is re-sent or has multiple runs, only the last count is stored.
 *   - send_logs has every individual recipient row across all runs.
 *
 * FIX: Use send_logs as the SINGLE source of truth for all numbers everywhere.
 * campaigns table is only used for the campaign list/breakdown table.
 *
 * COUNTING RULES (email status is a funnel, not additive):
 *   A send_log row represents ONE recipient. Status progresses:
 *     queued → sent → [delivered] → opened → clicked
 *   So:
 *   - "Sent"    = count of rows where status IN (sent, delivered, opened, clicked)
 *   - "Opened"  = count of rows where status IN (opened, clicked)  [click implies prior open]
 *   - "Clicked" = count of rows where status = clicked
 *   - "Delivered" = count of rows where status = delivered
 *     (Note: most providers go sent→opened directly, so delivered may be 0 —
 *      that is CORRECT and honest. Do NOT count opened/clicked as delivered.)
 */

function getDateRange(rangeParam: string, from?: string, to?: string): { since: Date; until: Date } {
  const now = new Date();
  const until = to ? new Date(to + 'T23:59:59') : new Date();

  if (rangeParam === 'custom' && from) {
    return { since: new Date(from + 'T00:00:00'), until };
  }

  let since: Date;
  switch (rangeParam) {
    case 'today': {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      break;
    }
    case 'week': {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0);
      break;
    }
    case '15':  since = new Date(now); since.setDate(since.getDate() - 15);  break;
    case '30':  since = new Date(now); since.setDate(since.getDate() - 30);  break;
    case '90':  since = new Date(now); since.setDate(since.getDate() - 90);  break;
    case '180': since = new Date(now); since.setDate(since.getDate() - 180); break;
    case 'year':
    default:
      since = new Date(now.getFullYear(), 0, 1);
      break;
  }
  return { since, until };
}

/** Count a status as "sent" (email left the system) */
function isSent(status: string) {
  return ['sent', 'delivered', 'opened', 'clicked'].includes(status);
}
/** Count a status as "opened" (recipient opened or clicked — click implies open) */
function isOpened(status: string) {
  return status === 'opened' || status === 'clicked';
}

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get('range') ?? 'year';
  const fromDate   = searchParams.get('from') ?? undefined;
  const toDate     = searchParams.get('to')   ?? undefined;

  const { since, until } = getDateRange(rangeParam, fromDate, toDate);
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  // ─── Step 1: Get all team account IDs (for scoping send_logs to this team) ───
  const { data: teamAccounts } = await db
    .from('email_accounts')
    .select('id, name, email, provider')
    .eq('team_id', DEMO_TEAM);

  const allAccounts = teamAccounts ?? [];
  const teamAccountIds = allAccounts.map(a => a.id);

  // ─── Step 2: Pull ALL send_logs for this team in the date range ───
  // This is the SINGLE source of truth for every number in every tab.
  // We pull status + sent_at + account_id + campaign_id in one query.
  const { data: allLogs } = teamAccountIds.length > 0
    ? await db
        .from('send_logs')
        .select('status, sent_at, account_id, campaign_id')
        .in('account_id', teamAccountIds)
        .gte('sent_at', sinceISO)
        .lte('sent_at', untilISO)
        .not('sent_at', 'is', null)
    : { data: [] };

  const logs = allLogs ?? [];

  // ─── Step 3: Compute TOTALS from send_logs ───
  // These numbers will now match the charts and account stats exactly.
  let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalUnsubscribed = 0;
  for (const log of logs) {
    if (isSent(log.status))         totalSent++;
    if (isOpened(log.status))       totalOpened++;
    if (log.status === 'clicked')   totalClicked++;
    if (log.status === 'bounced')   totalBounced++;
    if (log.status === 'unsubscribed') totalUnsubscribed++;
  }

  const openRate   = totalSent > 0 ? +((totalOpened  / totalSent) * 100).toFixed(1) : 0;
  const clickRate  = totalSent > 0 ? +((totalClicked / totalSent) * 100).toFixed(1) : 0;
  const bounceRate = totalSent > 0 ? +((totalBounced / totalSent) * 100).toFixed(1) : 0;

  const totals = {
    sent: totalSent,
    opened: totalOpened,
    clicked: totalClicked,
    bounced: totalBounced,
    unsubscribed: totalUnsubscribed,
    openRate,
    clickRate,
    bounceRate,
  };

  // ─── Step 4: Daily aggregation (for charts) ───
  const dailyMap: Record<string, {
    sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number;
  }> = {};

  for (const log of logs) {
    const day = (log.sent_at as string).slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (isSent(log.status))                 dailyMap[day].sent++;
    if (log.status === 'delivered')         dailyMap[day].delivered++;
    if (isOpened(log.status))               dailyMap[day].opened++;
    if (log.status === 'clicked')           dailyMap[day].clicked++;
    if (log.status === 'bounced')           dailyMap[day].bounced++;
    if (log.status === 'failed')            dailyMap[day].failed++;
  }

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  // ─── Step 5: Monthly aggregation ───
  const monthlyMap: Record<string, {
    month: string; sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number;
  }> = {};

  for (const d of daily) {
    const m = d.date.slice(0, 7);
    if (!monthlyMap[m]) monthlyMap[m] = { month: m, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    monthlyMap[m].sent      += d.sent;
    monthlyMap[m].delivered += d.delivered;
    monthlyMap[m].opened    += d.opened;
    monthlyMap[m].clicked   += d.clicked;
    monthlyMap[m].bounced   += d.bounced;
    monthlyMap[m].failed    += d.failed;
  }

  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  // ─── Step 6: Account-wise stats (same logs, grouped by account_id) ───
  const accountMap: Record<string, {
    sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number;
  }> = {};

  for (const log of logs) {
    const aid = log.account_id as string;
    if (!aid) continue;
    if (!accountMap[aid]) accountMap[aid] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (isSent(log.status))                 accountMap[aid].sent++;
    if (log.status === 'delivered')         accountMap[aid].delivered++;
    if (isOpened(log.status))               accountMap[aid].opened++;
    if (log.status === 'clicked')           accountMap[aid].clicked++;
    if (log.status === 'bounced')           accountMap[aid].bounced++;
    if (log.status === 'failed')            accountMap[aid].failed++;
  }

  const accountStats = allAccounts.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    provider: a.provider,
    ...(accountMap[a.id] ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 }),
  }));

  // ─── Step 7: Campaign list (for the Campaigns tab table) ───
  // We use campaigns table here ONLY for the list — names, dates, statuses.
  // But we re-derive the counts from send_logs for consistency.
  const { data: campaignRows } = await db
    .from('campaigns')
    .select('id, name, status, created_at, sent_at')
    .eq('team_id', DEMO_TEAM)
    .gte('created_at', sinceISO)
    .lte('created_at', untilISO)
    .order('created_at', { ascending: false });

  // Build per-campaign counts from send_logs
  const campaignStatsMap: Record<string, {
    sent: number; opened: number; clicked: number; bounced: number;
  }> = {};

  for (const log of logs) {
    const cid = log.campaign_id as string;
    if (!cid) continue;
    if (!campaignStatsMap[cid]) campaignStatsMap[cid] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
    if (isSent(log.status))               campaignStatsMap[cid].sent++;
    if (isOpened(log.status))             campaignStatsMap[cid].opened++;
    if (log.status === 'clicked')         campaignStatsMap[cid].clicked++;
    if (log.status === 'bounced')         campaignStatsMap[cid].bounced++;
  }

  const campaigns = (campaignRows ?? []).map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    created_at: c.created_at,
    sent_at: c.sent_at,
    // Use send_logs counts — NOT campaigns.sent_count which can be stale
    sent_count:   campaignStatsMap[c.id]?.sent    ?? 0,
    open_count:   campaignStatsMap[c.id]?.opened  ?? 0,
    click_count:  campaignStatsMap[c.id]?.clicked ?? 0,
    bounce_count: campaignStatsMap[c.id]?.bounced ?? 0,
  }));

  return NextResponse.json({
    totals,
    campaigns,
    daily,
    monthly,
    accountStats,
  });
}
