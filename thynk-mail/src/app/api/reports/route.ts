import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get('range') ?? 'year';

  let since: Date;
  if (rangeParam === 'year') {
    since = new Date(new Date().getFullYear(), 0, 1);
  } else {
    since = new Date();
    since.setDate(since.getDate() - parseInt(rangeParam, 10));
  }
  const sinceISO = since.toISOString();

  // Campaign-level stats
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id,name,status,sent_count,open_count,click_count,bounce_count,unsubscribe_count,account_id,sent_at,created_at')
    .eq('team_id', DEMO_TEAM)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false });

  const rows = campaigns ?? [];

  const totals = rows.reduce(
    (acc, c) => ({
      sent: acc.sent + (c.sent_count ?? 0),
      opened: acc.opened + (c.open_count ?? 0),
      clicked: acc.clicked + (c.click_count ?? 0),
      bounced: acc.bounced + (c.bounce_count ?? 0),
      unsubscribed: acc.unsubscribed + (c.unsubscribe_count ?? 0),
    }),
    { sent: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 }
  );

  const openRate   = totals.sent > 0 ? +((totals.opened / totals.sent) * 100).toFixed(1) : 0;
  const clickRate  = totals.sent > 0 ? +((totals.clicked / totals.sent) * 100).toFixed(1) : 0;
  const bounceRate = totals.sent > 0 ? +((totals.bounced / totals.sent) * 100).toFixed(1) : 0;

  // Daily logs for charts
  const { data: dailyLogs } = await db
    .from('send_logs')
    .select('sent_at, status')
    .gte('sent_at', sinceISO)
    .not('sent_at', 'is', null);

  // Daily aggregation
  const dailyMap: Record<string, { sent: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
  for (const log of dailyLogs ?? []) {
    const day = (log.sent_at as string).slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { sent: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (['sent','delivered','opened','clicked'].includes(log.status)) dailyMap[day].sent++;
    if (log.status === 'opened' || log.status === 'clicked') dailyMap[day].opened++;
    if (log.status === 'clicked') dailyMap[day].clicked++;
    if (log.status === 'bounced') dailyMap[day].bounced++;
    if (log.status === 'failed') dailyMap[day].failed++;
  }
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  // Monthly aggregation (group daily into YYYY-MM)
  const monthlyMap: Record<string, { month: string; sent: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    if (!monthlyMap[m]) monthlyMap[m] = { month: m, sent: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    monthlyMap[m].sent    += d.sent;
    monthlyMap[m].opened  += d.opened;
    monthlyMap[m].clicked += d.clicked;
    monthlyMap[m].bounced += d.bounced;
    monthlyMap[m].failed  += d.failed;
  }
  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  // Account-wise stats: join send_logs with email_accounts
  const { data: accountLogs } = await db
    .from('send_logs')
    .select('account_id, status')
    .gte('sent_at', sinceISO)
    .not('account_id', 'is', null);

  const { data: accounts } = await db
    .from('email_accounts')
    .select('id, name, email, provider')
    .eq('team_id', DEMO_TEAM);

  const accountMap: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }> = {};
  for (const log of accountLogs ?? []) {
    const aid = log.account_id as string;
    if (!accountMap[aid]) accountMap[aid] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
    if (['sent','delivered','opened','clicked'].includes(log.status)) accountMap[aid].sent++;
    if (log.status === 'delivered' || log.status === 'opened' || log.status === 'clicked') accountMap[aid].delivered++;
    if (log.status === 'opened' || log.status === 'clicked') accountMap[aid].opened++;
    if (log.status === 'clicked') accountMap[aid].clicked++;
    if (log.status === 'bounced') accountMap[aid].bounced++;
    if (log.status === 'failed') accountMap[aid].failed++;
  }

  const accountStats = (accounts ?? []).map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    provider: a.provider,
    ...(accountMap[a.id] ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 }),
  }));

  return NextResponse.json({
    totals: { ...totals, openRate, clickRate, bounceRate },
    campaigns: rows,
    daily,
    monthly,
    accountStats,
  });
}
