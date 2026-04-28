import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

/**
 * SINGLE SOURCE OF TRUTH: send_logs
 * ===================================
 * All numbers (totals, charts, account stats, campaign breakdown) come from
 * send_logs, not from campaigns.sent_count. This guarantees every tab agrees.
 *
 * Status funnel: queued → sent → [delivered] → opened → clicked
 *   Sent     = status IN (sent, delivered, opened, clicked)
 *   Opened   = status IN (opened, clicked)   — click implies prior open
 *   Clicked  = status = clicked
 *   Delivered= status = delivered            — 0 if provider skips this step (Brevo via SMTP)
 */

function getDateRange(rangeParam: string, from?: string, to?: string): { since: Date; until: Date } {
  const now = new Date();
  const until = to ? new Date(to + 'T23:59:59') : new Date();

  if (rangeParam === 'custom' && from) {
    return { since: new Date(from + 'T00:00:00'), until };
  }

  let since: Date;
  switch (rangeParam) {
    case 'today':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      break;
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

function isSent(status: string)    { return ['sent','delivered','opened','clicked'].includes(status); }
function isOpened(status: string)  { return status === 'opened' || status === 'clicked'; }

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get('range') ?? 'year';
  const fromDate   = searchParams.get('from') ?? undefined;
  const toDate     = searchParams.get('to')   ?? undefined;

  const { since, until } = getDateRange(rangeParam, fromDate, toDate);
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  // ── Get all team accounts (for scoping + account stats tab) ──
  const { data: teamAccounts } = await db
    .from('email_accounts')
    .select('id, name, email, provider')
    .eq('team_id', DEMO_TEAM);

  const allAccounts     = teamAccounts ?? [];
  const teamAccountIds  = allAccounts.map(a => a.id);

  // ── ONE send_logs fetch — source of truth for every number ──
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

  // ── Totals ──
  let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalUnsubscribed = 0;
  for (const log of logs) {
    if (isSent(log.status))               totalSent++;
    if (isOpened(log.status))             totalOpened++;
    if (log.status === 'clicked')         totalClicked++;
    if (log.status === 'bounced')         totalBounced++;
    if (log.status === 'unsubscribed')    totalUnsubscribed++;
  }

  const openRate   = totalSent > 0 ? +((totalOpened  / totalSent) * 100).toFixed(1) : 0;
  const clickRate  = totalSent > 0 ? +((totalClicked / totalSent) * 100).toFixed(1) : 0;
  const bounceRate = totalSent > 0 ? +((totalBounced / totalSent) * 100).toFixed(1) : 0;

  // ── Daily aggregation ──
  const dailyMap: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
  for (const log of logs) {
    const day = (log.sent_at as string).slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (isSent(log.status))               dailyMap[day].sent++;
    if (log.status === 'delivered')       dailyMap[day].delivered++;
    if (isOpened(log.status))             dailyMap[day].opened++;
    if (log.status === 'clicked')         dailyMap[day].clicked++;
    if (log.status === 'bounced')         dailyMap[day].bounced++;
    if (log.status === 'failed')          dailyMap[day].failed++;
  }
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  // ── Monthly aggregation ──
  const monthlyMap: Record<string, { month: string; sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
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

  // ── Account stats ──
  const accountMap: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
  for (const log of logs) {
    const aid = log.account_id as string;
    if (!aid) continue;
    if (!accountMap[aid]) accountMap[aid] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (isSent(log.status))               accountMap[aid].sent++;
    if (log.status === 'delivered')       accountMap[aid].delivered++;
    if (isOpened(log.status))             accountMap[aid].opened++;
    if (log.status === 'clicked')         accountMap[aid].clicked++;
    if (log.status === 'bounced')         accountMap[aid].bounced++;
    if (log.status === 'failed')          accountMap[aid].failed++;
  }
  const accountStats = allAccounts.map(a => ({
    id: a.id, name: a.name, email: a.email, provider: a.provider,
    ...(accountMap[a.id] ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 }),
  }));

  // ── Campaign stats from send_logs (keyed by campaign_id) ──
  const campaignLogMap: Record<string, { sent: number; opened: number; clicked: number; bounced: number }> = {};
  for (const log of logs) {
    const cid = log.campaign_id as string;
    if (!cid) continue;
    if (!campaignLogMap[cid]) campaignLogMap[cid] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
    if (isSent(log.status))               campaignLogMap[cid].sent++;
    if (isOpened(log.status))             campaignLogMap[cid].opened++;
    if (log.status === 'clicked')         campaignLogMap[cid].clicked++;
    if (log.status === 'bounced')         campaignLogMap[cid].bounced++;
  }

  // ── Campaign list — NO date filter, show ALL campaigns (same as /campaigns page) ──
  // FIX: old code filtered by created_at within the date range, hiding campaigns
  //      that were created before the range but still relevant.
  const { data: campaignRows } = await db
    .from('campaigns')
    .select('id, name, status, created_at, sent_at')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });

  const campaigns = (campaignRows ?? []).map(c => ({
    id:           c.id,
    name:         c.name,
    status:       c.status,
    created_at:   c.created_at,
    sent_at:      c.sent_at,
    // Use send_logs counts for the selected date range
    sent_count:   campaignLogMap[c.id]?.sent    ?? 0,
    open_count:   campaignLogMap[c.id]?.opened  ?? 0,
    click_count:  campaignLogMap[c.id]?.clicked ?? 0,
    bounce_count: campaignLogMap[c.id]?.bounced ?? 0,
  }));

  return NextResponse.json({
    totals: { sent: totalSent, opened: totalOpened, clicked: totalClicked, bounced: totalBounced, unsubscribed: totalUnsubscribed, openRate, clickRate, bounceRate },
    campaigns,
    daily,
    monthly,
    accountStats,
  });
}
