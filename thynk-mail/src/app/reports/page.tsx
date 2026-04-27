'use client';
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart3, Send, Eye, MousePointer, AlertCircle, UserMinus } from 'lucide-react';

interface Totals {
  sent: number; opened: number; clicked: number;
  bounced: number; unsubscribed: number;
  openRate: number; clickRate: number; bounceRate: number;
}
interface DailyPoint { date: string; sent: number; opened: number; clicked: number; }
interface CampaignRow {
  id: string; name: string; status: string;
  sent_count: number; open_count: number; click_count: number;
  bounce_count: number; created_at: string;
}

// Compute days from Jan 1 of current year to today
function currentYearDays(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

const RANGE_OPTIONS = [
  { label: 'Last 7 days',    value: '7' },
  { label: 'Last 30 days',   value: '30' },
  { label: 'Last 90 days',   value: '90' },
  { label: 'Current Year',   value: 'year' },
];

export default function ReportsPage() {
  const [range, setRange] = useState('year'); // Default: Current Year
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const days = range === 'year' ? currentYearDays() : range;
    const r = await fetch(`/api/reports?range=${days}`).then(r => r.json());
    setTotals(r.totals);
    setDaily(r.daily ?? []);
    setCampaigns(r.campaigns ?? []);
    setLoading(false);
  }

  const statCards = totals ? [
    { label: 'Total Sent',     value: totals.sent,        icon: Send,        color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Opened',         value: totals.opened,      icon: Eye,         color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Open Rate',      value: `${totals.openRate}%`, icon: BarChart3, color: 'text-blue-600',  bg: 'bg-blue-50' },
    { label: 'Clicked',        value: totals.clicked,     icon: MousePointer, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Click Rate',     value: `${totals.clickRate}%`, icon: MousePointer, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Bounced',        value: totals.bounced,     icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50' },
    { label: 'Bounce Rate',    value: `${totals.bounceRate}%`, icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Unsubscribed',   value: totals.unsubscribed, icon: UserMinus,  color: 'text-gray-600',   bg: 'bg-gray-100' },
  ] : [];

  const statusColors: Record<string, string> = {
    sent: 'badge-green', sending: 'badge-blue', scheduled: 'badge-yellow',
    draft: 'badge-gray', failed: 'badge-red', paused: 'badge-yellow',
  };

  const selectedLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? 'Current Year';

  return (
    <div className="p-8" style={{ background: 'var(--page-bg)', minHeight: '100vh' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Reports</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Track delivery and engagement · <span style={{ color: 'var(--brand-primary)' }}>{selectedLabel}</span>
          </p>
        </div>
        <select
          className="input w-40"
          value={range}
          onChange={e => setRange(e.target.value)}
        >
          {RANGE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card p-3">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                  <Icon size={14} className={color} />
                </div>
                <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="card p-5">
              <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Daily Volume</h2>
              {daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="sent" fill="var(--brand-primary)" name="Sent" radius={[3,3,0,0]} />
                    <Bar dataKey="opened" fill="#6366f1" name="Opened" radius={[3,3,0,0]} />
                    <Bar dataKey="clicked" fill="#a855f7" name="Clicked" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Engagement Trend</h2>
              {daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8 }} />
                    <Legend />
                    <Line type="monotone" dataKey="opened" stroke="#10b981" strokeWidth={2} dot={false} name="Opens" />
                    <Line type="monotone" dataKey="clicked" stroke="#6366f1" strokeWidth={2} dot={false} name="Clicks" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Per-campaign table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Campaign Breakdown</h2>
            </div>
            {campaigns.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No campaigns in this period</div>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--table-head-bg)' }}>
                  <tr>
                    <th className="px-5 py-3 text-left font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Campaign</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Sent</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Opens</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Open %</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Clicks</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Click %</th>
                    <th className="px-4 py-3 font-medium text-right text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bounces</th>
                    <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const or = c.sent_count > 0 ? ((c.open_count / c.sent_count) * 100).toFixed(1) : '—';
                    const cr = c.sent_count > 0 ? ((c.click_count / c.sent_count) * 100).toFixed(1) : '—';
                    return (
                      <tr
                        key={c.id}
                        style={{ borderTop: '1px solid var(--table-divider)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--table-row-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                      >
                        <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.sent_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.open_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{or}{or !== '—' ? '%' : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.click_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{cr}{cr !== '—' ? '%' : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{c.bounce_count ?? 0}</td>
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
        </>
      )}
    </div>
  );
}
