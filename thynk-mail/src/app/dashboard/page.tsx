import { createServerClient } from '@/lib/supabase';
import { BarChart3, Send, Users, TrendingUp, Mail, CheckCircle, Search, ArrowRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { DEMO_TEAM } from '@/lib/constants';
import DashboardCharts from '@/components/dashboard/DashboardCharts';

async function getDashboardData(teamId: string) {
  const db = createServerClient();
  const startOfYear  = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // ── 1. Team account IDs (used to scope send_logs to THIS team only) ──
  const { data: accountRows } = await db
    .from('email_accounts')
    .select('id, name, email, provider, sent_today, daily_limit, is_active')
    .eq('team_id', teamId);

  const accounts = accountRows ?? [];
  const teamAccountIds = accounts.map((a: any) => a.id);

  // ── 2. Campaign + contact counts ──
  const [
    { data: allCampaignsData, count: campaignCount },
    { count: contactCount },
  ] = await Promise.all([
    db.from('campaigns').select('id, status', { count: 'exact' }).eq('team_id', teamId),
    db.from('contacts').select('id', { count: 'exact' }).eq('team_id', teamId),
  ]);

  // ── 3. Single send_logs fetch scoped to team accounts, counted in JS ──
  // FIX: old code had no account_id filter → counted ALL teams' logs
  // FIX: old code counted every row as "sent" regardless of status (queued/failed included)
  // FIX: old code split into 8 separate queries → numbers never agreed with each other
  const { data: yearLogs } = teamAccountIds.length > 0
    ? await db
        .from('send_logs')
        .select('status, sent_at')
        .in('account_id', teamAccountIds)
        .gte('sent_at', startOfYear)
        .not('sent_at', 'is', null)
    : { data: [] };

  let totalSent = 0, totalOpened = 0, totalClicked = 0, totalBounced = 0, totalFailed = 0;
  let monthSent = 0, monthOpened = 0;

  for (const log of (yearLogs ?? [])) {
    const isMonth = (log.sent_at as string) >= startOfMonth;
    const sent    = ['sent', 'delivered', 'opened', 'clicked'].includes(log.status);
    const opened  = log.status === 'opened' || log.status === 'clicked'; // click implies open
    const clicked = log.status === 'clicked';
    const bounced = log.status === 'bounced';
    const failed  = log.status === 'failed';

    if (sent)    { totalSent++;    if (isMonth) monthSent++;   }
    if (opened)  { totalOpened++;  if (isMonth) monthOpened++; }
    if (clicked)   totalClicked++;
    if (bounced)   totalBounced++;
    if (failed)    totalFailed++;
  }

  // ── 4. Recent campaigns — NO date filter so ALL campaigns appear ──
  // FIX: old code had .gte('created_at', startOfYear) which hid older campaigns
  const { data: recentRows } = await db
    .from('campaigns')
    .select('id, name, status, sent_count, open_count, click_count, bounce_count, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(7);

  return {
    totalCampaigns:  campaignCount ?? 0,
    activeCampaigns: (allCampaignsData ?? []).filter((c: any) => ['sending','scheduled'].includes(c.status)).length,
    totalContacts:   contactCount ?? 0,
    totalSent, totalOpened, totalClicked, totalBounced, totalFailed,
    openRate:    totalSent > 0 ? +((totalOpened  / totalSent) * 100).toFixed(1) : 0,
    clickRate:   totalSent > 0 ? +((totalClicked / totalSent) * 100).toFixed(1) : 0,
    bounceRate:  totalSent > 0 ? +((totalBounced / totalSent) * 100).toFixed(1) : 0,
    monthSent,
    monthOpened,
    monthOpenRate: monthSent > 0 ? +((monthOpened / monthSent) * 100).toFixed(1) : 0,
    accounts,
    recentCampaigns: recentRows ?? [],
  };
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const d = await getDashboardData(DEMO_TEAM);
  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });

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
            {currentMonth} {currentYear} overview ·{' '}
            <span className="themed-brand font-medium">Current Year</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/email-status" className="btn-secondary"><Search size={15} /> Email Status</Link>
          <Link href="/campaigns/new" className="btn-primary"><Send size={15} /> New Campaign</Link>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
        {[
          { label: 'Campaigns',   value: d.totalCampaigns,  icon: Send,         color: 'text-teal-600',   bg: 'bg-teal-50'   },
          { label: 'Active',      value: d.activeCampaigns, icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Contacts',    value: d.totalContacts,   icon: Users,        color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Sent (Year)', value: d.totalSent,       icon: Mail,         color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Opened',      value: d.totalOpened,     icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Open Rate',   value: `${d.openRate}%`,  icon: BarChart3,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Bounced',     value: d.totalBounced,    icon: AlertCircle,  color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Failed',      value: d.totalFailed,     icon: AlertCircle,  color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-3 hover:shadow-md transition-shadow">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={14} className={color} />
            </div>
            <p className="text-xl font-bold themed-heading">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            <p className="text-xs mt-0.5 leading-tight themed-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* This Month strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: `${currentMonth} — Sent`,      value: d.monthSent.toLocaleString(),   sub: 'This month',                   color: '#14b8a6' },
          { label: `${currentMonth} — Opened`,    value: d.monthOpened.toLocaleString(), sub: 'This month',                   color: '#6366f1' },
          { label: `${currentMonth} — Open Rate`, value: `${d.monthOpenRate}%`,           sub: `vs. year avg ${d.openRate}%`, color: '#a855f7' },
        ].map(s => (
          <div key={s.label} className="card px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${s.color}18` }}>
              <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5 themed-muted">{s.label}</p>
              <p className="text-xs themed-muted opacity-60">{s.sub}</p>
            </div>
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

        {/* Email Accounts widget — shows daily send usage (sent_today/daily_limit) */}
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
                const pct = a.daily_limit > 0
                  ? Math.min(100, Math.round((a.sent_today / a.daily_limit) * 100))
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
                        {a.sent_today}/{a.daily_limit}
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

      {/* Recent Campaigns — last 7, no date restriction */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 themed-border-b">
          <h2 className="font-semibold themed-heading">
            Recent Campaigns
            <span className="ml-2 text-xs font-normal themed-muted">({currentYear})</span>
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
                    <td className="px-4 py-3 tabular-nums themed-secondary">{c.sent_count ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#10b981' }}>{c.open_count ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums themed-muted">{or}{or !== '—' ? '%' : ''}</td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: '#a855f7' }}>{c.click_count ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums text-red-500">{c.bounce_count ?? 0}</td>
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
