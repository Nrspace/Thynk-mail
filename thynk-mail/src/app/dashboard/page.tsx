import { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase';
import { BarChart3, Send, Users, TrendingUp, Mail, CheckCircle, Search, ArrowRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import DashboardRangeSelect from '@/components/dashboard/DashboardRangeSelect';

// Server-side copy of the range labels, kept in sync with RANGE_OPTIONS in
// DashboardRangeSelect.tsx. This can't just import RANGE_OPTIONS from that
// file — it's a 'use client' component, and once a file is marked
// 'use client', every export from it (even a plain array) becomes a
// client-only reference. Calling .find() on it from this server component
// throws at request time: "Attempted to call find() from the server but
// find is on the client." Duplicating this small lookup avoids that
// server/client boundary violation entirely.
const RANGE_LABELS: Record<string, string> = {
  '7': 'Last 7 Days',
  'today': 'Today',
  'week': 'This Week',
  '15': '15 Days',
  '30': '30 Days',
  '90': '90 Days',
  '180': '180 Days',
  'year': 'Current Year',
  'custom': 'Custom Period',
};

// Mirrors the same date-range logic used by /api/reports, plus a "7" (Last
// 7 Days) option, which is the dashboard's default.
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
      since = new Date(now.getFullYear(), 0, 1);
      break;
    case '7':
    default:
      since = new Date(now); since.setDate(since.getDate() - 7);
      break;
  }
  return { since, until };
}

async function getDashboardData(teamId: string, rangeParam: string, from?: string, to?: string) {
  const db = createServerClient();

  const { since, until } = getDateRange(rangeParam, from, to);
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();

  // ── 1. Email accounts ──────────────────────────────────────────────────────
  const { data: accountRows } = await db
    .from('email_accounts')
    .select('id, name, email, provider, sent_today, daily_limit, is_active')
    .eq('team_id', teamId);

  const accounts       = accountRows ?? [];
  const teamAccountIds = accounts.map((a: any) => a.id);

  // ── 2. Counts: campaigns + contacts ───────────────────────────────────────
  const [
    { data: allCampaignsData, count: campaignCount },
    { count: totalContacts },
    { count: subscribedContacts },
  ] = await Promise.all([
    db.from('campaigns').select('id, status', { count: 'exact' }).eq('team_id', teamId),
    db.from('contacts').select('id', { count: 'exact' }).eq('team_id', teamId),
    db.from('contacts').select('id', { count: 'exact' }).eq('team_id', teamId).eq('is_subscribed', true),
  ]);

  // ── 3. Totals for the selected range — account-scoped send_logs ──────────
  // Used for the top stat cards (Sent, Opened, Open Rate, etc.).
  // Paginated to avoid the Supabase 1000-row default cap.
  let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalFailed = 0;
  const accountSentMap: Record<string, number> = {};

  if (teamAccountIds.length > 0) {
    let pg = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch } = await db
        .from('send_logs')
        .select('status, account_id')
        .in('account_id', teamAccountIds)
        .gte('created_at', sinceISO)
        .lte('created_at', untilISO)
        .not('status', 'eq', 'queued')
        .range(pg * pageSize, (pg + 1) * pageSize - 1);

      const rows = batch ?? [];
      for (const log of rows) {
        const isSent   = ['sent', 'delivered', 'opened', 'clicked'].includes(log.status);
        const isOpened = log.status === 'opened' || log.status === 'clicked';
        const isClick  = log.status === 'clicked';
        const isBounce = log.status === 'bounced';
        const isFail   = log.status === 'failed';

        if (isSent)   totalSent++;
        if (isOpened) totalOpened++;
        if (isClick)  totalClicked++;
        if (isBounce) totalBounced++;
        if (isFail)   totalFailed++;

        if (isSent && log.account_id) {
          accountSentMap[log.account_id] = (accountSentMap[log.account_id] ?? 0) + 1;
        }
      }
      if (rows.length < pageSize) break;
      pg++;
    }
  }

  const accountsWithSent = accounts.map((a: any) => ({
    ...a,
    total_sent: accountSentMap[a.id] ?? 0,
  }));

  // ── 4. Recent campaigns — pulls straight from the campaigns table's own
  // sent_count/open_count/click_count/bounce_count columns, same as the
  // Campaigns list and campaign detail page, so all three always agree.
  const { data: recentRows } = await db
    .from('campaigns')
    .select('id, name, status, created_at, sent_at, sent_count, open_count, click_count, bounce_count')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(7);

  const recentCampaigns = (recentRows ?? []).map((c: any) => ({
    ...c,
    sent_count:   c.sent_count   ?? 0,
    open_count:   c.open_count   ?? 0,
    click_count:  c.click_count  ?? 0,
    bounce_count: c.bounce_count ?? 0,
  }));

  return {
    totalCampaigns:   campaignCount    ?? 0,
    activeCampaigns:  (allCampaignsData ?? []).filter((c: any) => ['sending','scheduled'].includes(c.status)).length,
    totalContacts:    totalContacts    ?? 0,
    subscribedContacts: subscribedContacts ?? 0,
    totalSent, totalOpened, totalClicked, totalBounced, totalFailed,
    openRate:    totalSent > 0 ? +((totalOpened  / totalSent) * 100).toFixed(1) : 0,
    clickRate:   totalSent > 0 ? +((totalClicked / totalSent) * 100).toFixed(1) : 0,
    bounceRate:  totalSent > 0 ? +((totalBounced / totalSent) * 100).toFixed(1) : 0,
    accounts: accountsWithSent,
    recentCampaigns,
  };
}

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { range?: string; from?: string; to?: string };
}

export default async function DashboardPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const range = searchParams.range ?? '7'; // default: Last 7 Days
  const d = await getDashboardData(projectId, range, searchParams.from, searchParams.to);
  const selectedLabel = RANGE_LABELS[range] ?? 'Last 7 Days';

  const statusColors: Record<string, string> = {
    sent: 'badge-green', sending: 'badge-blue', scheduled: 'badge-yellow',
    draft: 'badge-gray', failed: 'badge-red', paused: 'badge-yellow',
  };

  return (
    <div className="themed-page min-h-screen p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold themed-heading">Dashboard</h1>
          <p className="text-sm mt-1 themed-muted">
            Overview ·{' '}
            <span className="themed-brand font-medium">{selectedLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={<div className="input w-44 h-9" />}>
            <DashboardRangeSelect currentRange={range} />
          </Suspense>
          <Link href="/email-status" className="btn-secondary"><Search size={15} /> Email Status</Link>
          <Link href="/campaigns/new" className="btn-primary"><Send size={15} /> New Campaign</Link>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
        {[
          { label: 'Campaigns',   value: d.totalCampaigns,  icon: Send,         color: 'text-teal-600',   bg: 'bg-teal-50'   },
          { label: 'Active',      value: d.activeCampaigns, icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Contacts',    value: d.totalContacts,   icon: Users,        color: 'text-purple-600', bg: 'bg-purple-50', title: `${d.subscribedContacts} subscribed` },
          { label: `Sent (${selectedLabel})`, value: d.totalSent, icon: Mail,   color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Opened',      value: d.totalOpened,     icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Open Rate',   value: `${d.openRate}%`,  icon: BarChart3,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Bounced',     value: d.totalBounced,    icon: AlertCircle,  color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Failed',      value: d.totalFailed,     icon: AlertCircle,  color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ label, value, icon: Icon, color, bg, title }: any) => (
          <div key={label} className="card p-3 hover:shadow-md transition-shadow" title={title}>
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={14} className={color} />
            </div>
            <p className="text-xl font-bold themed-heading">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            <p className="text-xs mt-0.5 leading-tight themed-muted">{label}</p>
            {title && <p className="text-xs themed-muted opacity-60">{title}</p>}
          </div>
        ))}
      </div>

      {/* Charts + Accounts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="xl:col-span-2">
          <DashboardCharts
            openRate={d.openRate}
            clickRate={d.clickRate}
            bounceRate={d.bounceRate}
            totalSent={d.totalSent}
            totalOpened={d.totalOpened}
            totalClicked={d.totalClicked}
            totalBounced={d.totalBounced}
          />
        </div>

        {/* Email Accounts widget */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold themed-secondary">Email Accounts</h2>
            <Link href="/accounts" className="text-xs themed-link hover:underline flex items-center gap-1">
              Manage <ArrowRight size={11} />
            </Link>
          </div>
          {d.accounts.length === 0 ? (
            <p className="text-sm themed-muted text-center py-8">No accounts configured</p>
          ) : (
            <div className="space-y-3">
              {d.accounts.map((a: any) => {
                const dailyLimit = a.daily_limit ?? 0;
                const totalSent  = a.total_sent ?? 0;
                const pct = dailyLimit > 0
                  ? Math.min(100, Math.round((totalSent / dailyLimit) * 100))
                  : 0;
                const providerColors: Record<string, string> = {
                  brevo: '#0B96F5', gmail: '#EA4335', zoho: '#1A73E8',
                  outlook: '#0078D4', smtp: '#64748b',
                };
                const pc = providerColors[a.provider] ?? '#64748b';
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: a.is_active ? '#10b981' : '#ef4444' }} />
                        <span className="text-sm font-medium themed-heading truncate">{a.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium capitalize flex-shrink-0"
                          style={{ background: `${pc}18`, color: pc }}>{a.provider}</span>
                      </div>
                      <span className="text-xs themed-muted flex-shrink-0 ml-2">
                        {totalSent.toLocaleString()}/{dailyLimit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981',
                        }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Campaigns — live send_logs counts, matches Campaigns & Reports pages */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 themed-border-b">
          <h2 className="font-semibold themed-heading">
            Recent Campaigns
          </h2>
          <Link href="/campaigns" className="text-sm themed-link hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {d.recentCampaigns.length === 0 ? (
          <div className="py-16 text-center themed-muted">
            <Send size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No campaigns yet</p>
            <Link href="/campaigns/new" className="btn-primary mt-4 inline-flex">Create your first campaign</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--table-head-bg)' }}>
              <tr>
                {['Campaign','Date','Sent','Opens','Open %','Clicks','Bounces','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-left first:pl-6"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.recentCampaigns.map((c: any) => {
                const or = c.sent_count > 0
                  ? ((c.open_count / c.sent_count) * 100).toFixed(1) : '—';
                return (
                  <tr key={c.id} className="themed-tr" style={{ borderTop: '1px solid var(--table-divider)' }}>
                    <td className="px-6 py-3">
                      <Link href={`/campaigns/${c.id}`}
                        className="font-medium themed-heading hover:underline themed-link">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs themed-muted">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums themed-secondary">{c.sent_count.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#10b981' }}>{c.open_count.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums themed-muted">{or}{or !== '—' ? '%' : ''}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#a855f7' }}>{c.click_count.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums text-red-500">{c.bounce_count.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={statusColors[c.status] ?? 'badge-gray'}>{c.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
