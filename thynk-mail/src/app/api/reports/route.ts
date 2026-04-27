import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const rangeParam = searchParams.get('range') ?? 'year';

  let since: Date;
  if (rangeParam === 'year') {
    // Current calendar year from Jan 1
    since = new Date(new Date().getFullYear(), 0, 1);
  } else {
    since = new Date();
    since.setDate(since.getDate() - parseInt(rangeParam, 10));
  }
  const sinceISO = since.toISOString();

  // Campaign-level stats
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id,name,status,sent_count,open_count,click_count,bounce_count,unsubscribe_count,sent_at,created_at')
    .eq('team_id', DEMO_TEAM)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false });

  const rows = campaigns ?? [];

  // Aggregate totals
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

  const openRate = totals.sent > 0 ? +((totals.opened / totals.sent) * 100).toFixed(1) : 0;
  const clickRate = totals.sent > 0 ? +((totals.clicked / totals.sent) * 100).toFixed(1) : 0;
  const bounceRate = totals.sent > 0 ? +((totals.bounced / totals.sent) * 100).toFixed(1) : 0;

  // Daily send volumes for chart
  const { data: dailyLogs } = await db
    .from('send_logs')
    .select('sent_at, status')
    .gte('sent_at', sinceISO)
    .not('sent_at', 'is', null);

  const dailyMap: Record<string, { sent: number; opened: number; clicked: number }> = {};
  for (const log of dailyLogs ?? []) {
    const day = (log.sent_at as string).slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { sent: 0, opened: 0, clicked: 0 };
    if (log.status === 'sent' || log.status === 'opened' || log.status === 'clicked') dailyMap[day].sent++;
    if (log.status === 'opened' || log.status === 'clicked') dailyMap[day].opened++;
    if (log.status === 'clicked') dailyMap[day].clicked++;
  }

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  return NextResponse.json({
    totals: { ...totals, openRate, clickRate, bounceRate },
    campaigns: rows,
    daily,
  });
}
