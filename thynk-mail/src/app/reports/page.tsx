'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from 'recharts';
import {
  BarChart3, Send, Eye, MousePointer, AlertCircle, UserMinus,
  TrendingUp, TrendingDown, Mail, Activity, ChevronDown,
} from 'lucide-react';

/* ─── Types ─── */
interface Totals {
  sent: number; opened: number; clicked: number;
  bounced: number; unsubscribed: number;
  openRate: number; clickRate: number; bounceRate: number;
}
interface DailyPoint  { date: string; sent: number; opened: number; clicked: number; bounced: number; failed: number; }
interface MonthPoint  { month: string; sent: number; opened: number; clicked: number; bounced: number; failed: number; }
interface AccountStat { id: string; name: string; email: string; provider: string; sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number; }
interface CampaignRow { id: string; name: string; status: string; sent_count: number; open_count: number; click_count: number; bounce_count: number; created_at: string; }

const RANGE_OPTIONS = [
  { label: 'Last 7 days',  value: '7'    },
  { label: 'Last 30 days', value: '30'   },
  { label: 'Last 90 days', value: '90'   },
  { label: 'Current Year', value: 'year' },
];

const STATUS_COLORS: Record<string, string> = {
  sent: 'badge-green', sending: 'badge-blue', scheduled: 'badge-yellow',
  draft: 'badge-gray', failed: 'badge-red', paused: 'badge-yellow',
};

const PROVIDER_COLORS: Record<string, string> = {
  brevo: '#0B96F5', gmail: '#EA4335', zoho: '#1A73E8',
  outlook: '#0078D4', smtp: '#64748b',
};

const CHART_PALETTE = ['#14b8a6','#6366f1','#a855f7','#f59e0b','#ef4444','#10b981'];

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

function Delta({ val, suffix = '' }: { val: number; suffix?: string }) {
  if (val === 0) return <span className="text-xs text-gray-400">—</span>;
  const up = val > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
      {Math.abs(val)}{suffix}
    </span>
  );
}

/* ─── Radial gauge ─── */
function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const data = [{ value, fill: color }, { value: 100 - value, fill: 'transparent' }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" startAngle={220} endAngle={-40} data={[{ value, fill: color }]}>
            <RadialBar background={{ fill: 'var(--card-border)' }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}%</span>
        </div>
      </div>
      <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

/* ─── Custom tooltip ─── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl shadow-xl border px-3 py-2 text-xs" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [range, setRange]         = useState('year');
  const [tab, setTab]             = useState<'overview'|'monthly'|'accounts'|'campaigns'>('overview');
  const [totals, setTotals]       = useState<Totals | null>(null);
  const [daily, setDaily]         = useState<DailyPoint[]>([]);
  const [monthly, setMonthly]     = useState<MonthPoint[]>([]);
  const [accounts, setAccounts]   = useState<AccountStat[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/reports?range=${range}`).then(r => r.json());
    setTotals(r.totals);
    setDaily(r.daily ?? []);
    setMonthly(r.monthly ?? []);
    setAccounts(r.accountStats ?? []);
    setCampaigns(r.campaigns ?? []);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const selectedLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? 'Current Year';

  /* ── Funnel data ── */
  const funnelData = totals ? [
    { name: 'Sent',    value: totals.sent,    fill: '#14b8a6' },
    { name: 'Opened',  value: totals.opened,  fill: '#6366f1' },
    { name: 'Clicked', value: totals.clicked, fill: '#a855f7' },
  ] : [];

  /* ── Stat cards ── */
  const statCards = totals ? [
    { label: 'Total Sent',    value: totals.sent,              icon: Send,         color: 'text-teal-600',   bg: 'bg-teal-50',   trend: 0 },
    { label: 'Opened',        value: totals.opened,            icon: Eye,          color: 'text-green-600',  bg: 'bg-green-50',  trend: 0 },
    { label: 'Open Rate',     value: `${totals.openRate}%`,    icon: BarChart3,    color: 'text-blue-600',   bg: 'bg-blue-50',   trend: 0 },
    { label: 'Clicked',       value: totals.clicked,           icon: MousePointer, color: 'text-purple-600', bg: 'bg-purple-50', trend: 0 },
    { label: 'Click Rate',    value: `${totals.clickRate}%`,   icon: Activity,     color: 'text-indigo-600', bg: 'bg-indigo-50', trend: 0 },
    { label: 'Bounced',       value: totals.bounced,           icon: AlertCircle,  color: 'text-red-600',    bg: 'bg-red-50',    trend: 0 },
    { label: 'Bounce Rate',   value: `${totals.bounceRate}%`,  icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50', trend: 0 },
    { label: 'Unsubscribed',  value: totals.unsubscribed,      icon: UserMinus,    color: 'text-gray-600',   bg: 'bg-gray-100',  trend: 0 },
  ] : [];

  const tabs = [
    { id: 'overview',   label: 'Overview'          },
    { id: 'monthly',    label: 'Monthly Reports'   },
    { id: 'accounts',   label: 'Account Stats'     },
    { id: 'campaigns',  label: 'Campaigns'         },
  ] as const;

  return (
    <div className="themed-page min-h-screen">
      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold themed-heading">Reports</h1>
            <p className="text-sm mt-1 themed-muted">
              Email analytics &amp; delivery insights ·{' '}
              <span className="themed-brand font-medium">{selectedLabel}</span>
            </p>
          </div>
          <div className="relative">
            <select
              className="input w-44 appearance-none pr-8 cursor-pointer"
              value={range}
              onChange={e => setRange(e.target.value)}
            >
              {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }}/>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--card-border)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2.5 text-sm font-medium transition-colors relative"
              style={{
                color: tab === t.id ? 'var(--brand-primary)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--brand-primary)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--brand-primary)', borderTopColor: 'transparent' }} />
            <p className="text-sm themed-muted">Loading analytics…</p>
          </div>
        ) : (
          <>
            {/* ══════════ OVERVIEW TAB ══════════ */}
            {tab === 'overview' && (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
                  {statCards.map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="card p-3 hover:shadow-md transition-shadow">
                      <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                        <Icon size={14} className={color} />
                      </div>
                      <p className="text-xl font-bold themed-heading">{value}</p>
                      <p className="text-xs mt-0.5 leading-tight themed-muted">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Gauge + Funnel row */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                  {/* Engagement gauges */}
                  <div className="card p-5">
                    <h2 className="font-semibold themed-secondary mb-4">Engagement Rates</h2>
                    <div className="flex justify-around">
                      {totals && <>
                        <Gauge value={totals.openRate}   label="Open Rate"   color="#14b8a6" />
                        <Gauge value={totals.clickRate}  label="Click Rate"  color="#6366f1" />
                        <Gauge value={totals.bounceRate} label="Bounce Rate" color="#ef4444" />
                      </>}
                    </div>
                  </div>

                  {/* Funnel pie */}
                  <div className="card p-5">
                    <h2 className="font-semibold themed-secondary mb-4">Delivery Funnel</h2>
                    {funnelData.every(d => d.value === 0) ? (
                      <div className="h-36 flex items-center justify-center text-sm themed-muted">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie data={funnelData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                            {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Top metric strip */}
                  <div className="card p-5">
                    <h2 className="font-semibold themed-secondary mb-4">Summary</h2>
                    {totals && (
                      <div className="space-y-3">
                        {[
                          { label: 'Emails Sent',   val: totals.sent,         color: '#14b8a6' },
                          { label: 'Opened',         val: totals.opened,       color: '#6366f1' },
                          { label: 'Clicked',        val: totals.clicked,      color: '#a855f7' },
                          { label: 'Bounced',        val: totals.bounced,      color: '#ef4444' },
                          { label: 'Unsubscribed',   val: totals.unsubscribed, color: '#f59e0b' },
                        ].map(row => (
                          <div key={row.label} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                            <span className="text-sm flex-1 themed-muted">{row.label}</span>
                            <span className="text-sm font-semibold themed-heading tabular-nums">{row.val.toLocaleString()}</span>
                            <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${totals.sent > 0 ? Math.min(100, (row.val / totals.sent) * 100) : 0}%`, background: row.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Area chart — daily volume */}
                <div className="card p-5 mb-6">
                  <h2 className="font-semibold themed-secondary mb-4">Daily Send Volume</h2>
                  {daily.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-sm themed-muted">No data for this period</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={daily} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gSent"    x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.3}/><stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/></linearGradient>
                          <linearGradient id="gOpened"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                          <linearGradient id="gClicked" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.slice(5)} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} />
                        <Area type="monotone" dataKey="sent"    stroke="#14b8a6" fill="url(#gSent)"    strokeWidth={2} name="Sent"    dot={false} />
                        <Area type="monotone" dataKey="opened"  stroke="#6366f1" fill="url(#gOpened)"  strokeWidth={2} name="Opened"  dot={false} />
                        <Area type="monotone" dataKey="clicked" stroke="#a855f7" fill="url(#gClicked)" strokeWidth={2} name="Clicked" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Engagement line + bounce bar */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <h2 className="font-semibold themed-secondary mb-4">Engagement Trend</h2>
                    {daily.length === 0 ? (
                      <div className="h-44 flex items-center justify-center text-sm themed-muted">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={daily} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.slice(5)} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} />
                          <Line type="monotone" dataKey="opened"  stroke="#10b981" strokeWidth={2} dot={false} name="Opens"   />
                          <Line type="monotone" dataKey="clicked" stroke="#6366f1" strokeWidth={2} dot={false} name="Clicks"  />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="card p-5">
                    <h2 className="font-semibold themed-secondary mb-4">Bounces &amp; Failures</h2>
                    {daily.length === 0 ? (
                      <div className="h-44 flex items-center justify-center text-sm themed-muted">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={daily} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.slice(5)} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} />
                          <Bar dataKey="bounced" fill="#ef4444" name="Bounced" radius={[3,3,0,0]} />
                          <Bar dataKey="failed"  fill="#f97316" name="Failed"  radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ══════════ MONTHLY TAB ══════════ */}
            {tab === 'monthly' && (
              <>
                {monthly.length === 0 ? (
                  <div className="card py-20 text-center themed-muted text-sm">No monthly data for this period</div>
                ) : (
                  <>
                    {/* Monthly overview bar */}
                    <div className="card p-5 mb-6">
                      <h2 className="font-semibold themed-secondary mb-4">Monthly Email Volume</h2>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={monthly} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={fmtMonth} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <Tooltip content={<ChartTooltip />} labelFormatter={fmtMonth} />
                          <Legend iconType="circle" iconSize={8} />
                          <Bar dataKey="sent"    fill="#14b8a6" name="Sent"    radius={[3,3,0,0]} />
                          <Bar dataKey="opened"  fill="#6366f1" name="Opened"  radius={[3,3,0,0]} />
                          <Bar dataKey="clicked" fill="#a855f7" name="Clicked" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Monthly line trends */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                      <div className="card p-5">
                        <h2 className="font-semibold themed-secondary mb-4">Monthly Engagement Rate</h2>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart
                            data={monthly.map(m => ({
                              ...m,
                              openPct:   m.sent > 0 ? +((m.opened  / m.sent) * 100).toFixed(1) : 0,
                              clickPct:  m.sent > 0 ? +((m.clicked / m.sent) * 100).toFixed(1) : 0,
                              bouncePct: m.sent > 0 ? +((m.bounced / m.sent) * 100).toFixed(1) : 0,
                            }))}
                            margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={fmtMonth} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} unit="%" />
                            <Tooltip content={<ChartTooltip />} labelFormatter={fmtMonth} />
                            <Legend iconType="circle" iconSize={8} />
                            <Line type="monotone" dataKey="openPct"   stroke="#14b8a6" strokeWidth={2} dot={{ r: 4 }} name="Open %"   />
                            <Line type="monotone" dataKey="clickPct"  stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Click %"  />
                            <Line type="monotone" dataKey="bouncePct" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Bounce %" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="card p-5">
                        <h2 className="font-semibold themed-secondary mb-4">Monthly Bounces &amp; Failures</h2>
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={monthly} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gBounce" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                              <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={fmtMonth} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                            <Tooltip content={<ChartTooltip />} labelFormatter={fmtMonth} />
                            <Legend iconType="circle" iconSize={8} />
                            <Area type="monotone" dataKey="bounced" stroke="#ef4444" fill="url(#gBounce)" strokeWidth={2} name="Bounced" dot={{ r: 3 }} />
                            <Area type="monotone" dataKey="failed"  stroke="#f97316" fill="url(#gFailed)" strokeWidth={2} name="Failed"  dot={{ r: 3 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Monthly table */}
                    <div className="card overflow-hidden">
                      <div className="px-5 py-4 themed-border-b">
                        <h2 className="font-semibold themed-secondary">Month-by-Month Breakdown</h2>
                      </div>
                      <table className="w-full text-sm">
                        <thead style={{ background: 'var(--table-head-bg)' }}>
                          <tr>
                            {['Month','Sent','Opened','Open %','Clicked','Click %','Bounced','Bounce %','Failed'].map(h => (
                              <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-left first:pl-5" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map(m => {
                            const or = m.sent > 0 ? ((m.opened  / m.sent) * 100).toFixed(1) : '—';
                            const cr = m.sent > 0 ? ((m.clicked / m.sent) * 100).toFixed(1) : '—';
                            const br = m.sent > 0 ? ((m.bounced / m.sent) * 100).toFixed(1) : '—';
                            return (
                              <tr key={m.month} className="themed-tr" style={{ borderTop: '1px solid var(--table-divider)' }}>
                                <td className="px-5 py-3 font-medium themed-heading">{fmtMonth(m.month)}</td>
                                <td className="px-4 py-3 tabular-nums themed-secondary">{m.sent.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-secondary">{m.opened.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-muted">{or}{or !== '—' ? '%' : ''}</td>
                                <td className="px-4 py-3 tabular-nums themed-secondary">{m.clicked.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-muted">{cr}{cr !== '—' ? '%' : ''}</td>
                                <td className="px-4 py-3 tabular-nums text-red-500">{m.bounced.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-muted">{br}{br !== '—' ? '%' : ''}</td>
                                <td className="px-4 py-3 tabular-nums text-orange-500">{m.failed.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                          {/* Totals row */}
                          {totals && (
                            <tr style={{ borderTop: '2px solid var(--card-border)', background: 'var(--table-head-bg)' }}>
                              <td className="px-5 py-3 font-bold themed-heading">Total</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.sent.toLocaleString()}</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.opened.toLocaleString()}</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.openRate}%</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.clicked.toLocaleString()}</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.clickRate}%</td>
                              <td className="px-4 py-3 font-bold tabular-nums text-red-500">{totals.bounced.toLocaleString()}</td>
                              <td className="px-4 py-3 font-bold tabular-nums themed-heading">{totals.bounceRate}%</td>
                              <td className="px-4 py-3 themed-muted">—</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ══════════ ACCOUNTS TAB ══════════ */}
            {tab === 'accounts' && (
              <>
                {accounts.length === 0 ? (
                  <div className="card py-20 text-center themed-muted text-sm">No email accounts found</div>
                ) : (
                  <>
                    {/* Account cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                      {accounts.map(a => {
                        const deliverPct = a.sent > 0 ? ((a.delivered / a.sent) * 100).toFixed(1) : '0';
                        const openPct    = a.sent > 0 ? ((a.opened   / a.sent) * 100).toFixed(1) : '0';
                        const color = PROVIDER_COLORS[a.provider] ?? '#64748b';
                        return (
                          <div key={a.id} className="card p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                  <p className="font-semibold themed-heading text-sm">{a.name}</p>
                                </div>
                                <p className="text-xs themed-muted mt-0.5 ml-4">{a.email}</p>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: `${color}18`, color }}>
                                {a.provider}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              {[
                                { label: 'Sent',      val: a.sent,      c: '#14b8a6' },
                                { label: 'Delivered', val: a.delivered, c: '#6366f1' },
                                { label: 'Opened',    val: a.opened,    c: '#10b981' },
                                { label: 'Clicked',   val: a.clicked,   c: '#a855f7' },
                                { label: 'Bounced',   val: a.bounced,   c: '#ef4444' },
                                { label: 'Failed',    val: a.failed,    c: '#f97316' },
                              ].map(s => (
                                <div key={s.label} className="rounded-lg p-2" style={{ background: `${s.c}10` }}>
                                  <p className="text-sm font-bold tabular-nums" style={{ color: s.c }}>{s.val.toLocaleString()}</p>
                                  <p className="text-xs mt-0.5 themed-muted">{s.label}</p>
                                </div>
                              ))}
                            </div>
                            {/* mini progress bars */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="w-16 themed-muted">Delivered</span>
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${deliverPct}%`, background: '#6366f1' }} />
                                </div>
                                <span className="w-8 text-right font-medium" style={{ color: '#6366f1' }}>{deliverPct}%</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="w-16 themed-muted">Opened</span>
                                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${openPct}%`, background: '#10b981' }} />
                                </div>
                                <span className="w-8 text-right font-medium" style={{ color: '#10b981' }}>{openPct}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Account comparison bar chart */}
                    <div className="card p-5 mb-6">
                      <h2 className="font-semibold themed-secondary mb-4">Account Comparison — Sent vs Delivered vs Opened</h2>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={accounts.map(a => ({ name: a.name.length > 12 ? a.name.slice(0,12)+'…' : a.name, sent: a.sent, delivered: a.delivered, opened: a.opened, clicked: a.clicked }))}
                          margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconType="circle" iconSize={8} />
                          <Bar dataKey="sent"      fill="#14b8a6" name="Sent"      radius={[3,3,0,0]} />
                          <Bar dataKey="delivered" fill="#6366f1" name="Delivered" radius={[3,3,0,0]} />
                          <Bar dataKey="opened"    fill="#10b981" name="Opened"    radius={[3,3,0,0]} />
                          <Bar dataKey="clicked"   fill="#a855f7" name="Clicked"   radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Account table */}
                    <div className="card overflow-hidden">
                      <div className="px-5 py-4 themed-border-b">
                        <h2 className="font-semibold themed-secondary">Account Details</h2>
                      </div>
                      <table className="w-full text-sm">
                        <thead style={{ background: 'var(--table-head-bg)' }}>
                          <tr>
                            {['Account','Provider','Sent','Delivered','Opened','Open %','Clicked','Click %','Bounced','Failed'].map(h => (
                              <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-left first:pl-5" style={{ color: 'var(--text-muted)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map(a => {
                            const op = a.sent > 0 ? ((a.opened  / a.sent) * 100).toFixed(1) : '—';
                            const cp = a.sent > 0 ? ((a.clicked / a.sent) * 100).toFixed(1) : '—';
                            const color = PROVIDER_COLORS[a.provider] ?? '#64748b';
                            return (
                              <tr key={a.id} className="themed-tr" style={{ borderTop: '1px solid var(--table-divider)' }}>
                                <td className="px-5 py-3">
                                  <p className="font-medium themed-heading text-sm">{a.name}</p>
                                  <p className="text-xs themed-muted">{a.email}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: `${color}18`, color }}>{a.provider}</span>
                                </td>
                                <td className="px-4 py-3 tabular-nums themed-secondary">{a.sent.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: '#6366f1' }}>{a.delivered.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: '#10b981' }}>{a.opened.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-muted">{op}{op !== '—' ? '%' : ''}</td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: '#a855f7' }}>{a.clicked.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums themed-muted">{cp}{cp !== '—' ? '%' : ''}</td>
                                <td className="px-4 py-3 tabular-nums text-red-500">{a.bounced.toLocaleString()}</td>
                                <td className="px-4 py-3 tabular-nums text-orange-500">{a.failed.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ══════════ CAMPAIGNS TAB ══════════ */}
            {tab === 'campaigns' && (
              <div className="card overflow-hidden">
                <div className="px-5 py-4 themed-border-b">
                  <h2 className="font-semibold themed-secondary">Campaign Breakdown · {selectedLabel}</h2>
                </div>
                {campaigns.length === 0 ? (
                  <div className="py-16 text-center text-sm themed-muted">No campaigns in this period</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead style={{ background: 'var(--table-head-bg)' }}>
                      <tr>
                        {['Campaign','Date','Sent','Opens','Open %','Clicks','Click %','Bounces','Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-left first:pl-5" style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map(c => {
                        const or = c.sent_count > 0 ? ((c.open_count  / c.sent_count) * 100).toFixed(1) : '—';
                        const cr = c.sent_count > 0 ? ((c.click_count / c.sent_count) * 100).toFixed(1) : '—';
                        return (
                          <tr key={c.id} className="themed-tr" style={{ borderTop: '1px solid var(--table-divider)' }}>
                            <td className="px-5 py-3 font-medium themed-heading max-w-[180px] truncate">{c.name}</td>
                            <td className="px-4 py-3 text-xs themed-muted">{new Date(c.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 tabular-nums themed-secondary">{c.sent_count ?? 0}</td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: '#10b981' }}>{c.open_count ?? 0}</td>
                            <td className="px-4 py-3 tabular-nums themed-muted">{or}{or !== '—' ? '%' : ''}</td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: '#a855f7' }}>{c.click_count ?? 0}</td>
                            <td className="px-4 py-3 tabular-nums themed-muted">{cr}{cr !== '—' ? '%' : ''}</td>
                            <td className="px-4 py-3 tabular-nums text-red-500">{c.bounce_count ?? 0}</td>
                            <td className="px-4 py-3"><span className={STATUS_COLORS[c.status] ?? 'badge-gray'}>{c.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
