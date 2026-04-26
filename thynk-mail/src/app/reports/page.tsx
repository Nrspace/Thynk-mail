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

export default function ReportsPage() {
  const [range, setRange] = useState('30');
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/reports?range=${range}`).then(r => r.json());
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Track delivery and engagement</p>
        </div>
        <select
          className="input w-36"
          value={range}
          onChange={e => setRange(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading...</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card p-3">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                  <Icon size={14} className={color} />
                </div>
                <p className="text-xl font-semibold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            {/* Daily sends */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Daily Volume</h2>
              {daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sent" fill="#14b8a6" name="Sent" radius={[3,3,0,0]} />
                    <Bar dataKey="opened" fill="#6366f1" name="Opened" radius={[3,3,0,0]} />
                    <Bar dataKey="clicked" fill="#a855f7" name="Clicked" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Open/click trend */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Engagement Trend</h2>
              {daily.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
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
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Campaign Breakdown</h2>
            </div>
            {campaigns.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No campaigns in this period</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium text-right">Sent</th>
                    <th className="px-4 py-3 font-medium text-right">Opens</th>
                    <th className="px-4 py-3 font-medium text-right">Open %</th>
                    <th className="px-4 py-3 font-medium text-right">Clicks</th>
                    <th className="px-4 py-3 font-medium text-right">Click %</th>
                    <th className="px-4 py-3 font-medium text-right">Bounces</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map(c => {
                    const or = c.sent_count > 0 ? ((c.open_count / c.sent_count) * 100).toFixed(1) : '—';
                    const cr = c.sent_count > 0 ? ((c.click_count / c.sent_count) * 100).toFixed(1) : '—';
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.sent_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.open_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500">{or}{or !== '—' ? '%' : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.click_count ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500">{cr}{cr !== '—' ? '%' : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.bounce_count ?? 0}</td>
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
