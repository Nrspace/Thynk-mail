import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { Send, Plus } from 'lucide-react';
import { DEMO_TEAM } from '@/lib/constants';

const statusColors: Record<string, string> = {
  sent:      'badge-green',
  sending:   'badge-blue',
  scheduled: 'badge-yellow',
  draft:     'badge-gray',
  failed:    'badge-red',
  paused:    'badge-yellow',
};

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const db = createServerClient();
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Database error:</strong> {error.message}
          <br /><span className="text-xs mt-1 block">Check your Supabase env vars and team ID in Vercel settings.</span>
        </div>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} total</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <Plus size={15} /> New Campaign
        </Link>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Send size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first campaign to get started</p>
            <Link href="/campaigns/new" className="btn-primary mt-5 inline-flex">
              <Plus size={14} /> Create Campaign
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Sent</th>
                <th className="px-4 py-3 font-medium text-right">Opens</th>
                <th className="px-4 py-3 font-medium text-right">Click %</th>
                <th className="px-4 py-3 font-medium text-right">Bounces</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c) => {
                const openRate  = c.sent_count > 0 ? ((c.open_count  / c.sent_count) * 100).toFixed(1) : '—';
                const clickRate = c.sent_count > 0 ? ((c.click_count / c.sent_count) * 100).toFixed(1) : '—';
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-gray-900 hover:text-teal-600">
                        {c.name}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={statusColors[c.status] ?? 'badge-gray'}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{c.sent_count ?? 0}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {c.open_count ?? 0}
                      {openRate !== '—' && <span className="text-gray-400 text-xs ml-1">({openRate}%)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-gray-500">
                      {clickRate !== '—' ? `${clickRate}%` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{c.bounce_count ?? 0}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString()}
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
