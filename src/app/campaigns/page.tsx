import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { Send, Plus, Calendar } from 'lucide-react';
import { DEMO_TEAM } from '@/lib/constants';
import CampaignActions from '@/components/campaigns/CampaignActions';

const statusColors: Record<string, string> = {
  sent:      'badge-green',
  sending:   'badge-blue',
  scheduled: 'badge-yellow',
  paused:    'badge-yellow',
  draft:     'badge-gray',
  failed:    'badge-red',
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
        </div>
      </div>
    );
  }

  const rows = data ?? [];

  // Build send-log stats map (sent/opened/clicked/bounced per campaign)
  const campaignIds = rows.map((c: any) => c.id);
  const logCountMap: Record<string, { sent: number; opened: number; clicked: number; bounced: number }> = {};

  if (campaignIds.length > 0) {
    const { data: logRows } = await db
      .from('send_logs')
      .select('campaign_id, status')
      .in('campaign_id', campaignIds)
      .not('sent_at', 'is', null);

    for (const l of (logRows ?? [])) {
      if (!logCountMap[l.campaign_id]) {
        logCountMap[l.campaign_id] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      }
      const s = l.status;
      if (['sent', 'delivered', 'opened', 'clicked'].includes(s)) logCountMap[l.campaign_id].sent++;
      if (s === 'opened' || s === 'clicked') logCountMap[l.campaign_id].opened++;
      if (s === 'clicked')  logCountMap[l.campaign_id].clicked++;
      if (s === 'bounced')  logCountMap[l.campaign_id].bounced++;
    }
  }

  // Separate scheduled campaigns so they appear in a dedicated banner
  const scheduledRows = rows.filter((c: any) => c.status === 'scheduled');
  const otherRows     = rows.filter((c: any) => c.status !== 'scheduled');

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} total
            {scheduledRows.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                · <Calendar size={12} /> {scheduledRows.length} scheduled
              </span>
            )}
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <Plus size={15} /> New Campaign
        </Link>
      </div>

      {/* Scheduled campaigns banner */}
      {scheduledRows.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-100">
            <Calendar size={15} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Scheduled Campaigns</span>
            <span className="ml-auto text-xs text-amber-600">
              {scheduledRows.length} pending · fires within the hour
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-amber-100">
              {scheduledRows.map((c: any) => (
                <tr key={c.id} className="hover:bg-amber-100/40 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="font-medium text-gray-900 hover:text-teal-600"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                      {c.subject}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge-yellow">scheduled</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-amber-700">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {c.scheduled_at
                        ? new Date(c.scheduled_at).toLocaleString()
                        : 'Time not set'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignActions campaign={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Main campaigns table */}
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
        ) : otherRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            All campaigns are scheduled — they will appear here once sent
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Sent</th>
                <th className="px-4 py-3 font-medium text-right">Opens</th>
                <th className="px-4 py-3 font-medium text-right">Clicks</th>
                <th className="px-4 py-3 font-medium text-right">Bounces</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {otherRows.map((c: any) => {
                const lc = logCountMap[c.id] ?? { sent: 0, opened: 0, clicked: 0, bounced: 0 };
                const openRate =
                  lc.sent > 0
                    ? ((lc.opened / lc.sent) * 100).toFixed(1)
                    : null;

                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-gray-900 hover:text-teal-600"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {c.subject}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={statusColors[c.status] ?? 'badge-gray'}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{lc.sent}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      {lc.opened}
                      {openRate && (
                        <span className="text-gray-400 text-xs ml-1">({openRate}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{lc.clicked}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{lc.bounced}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <CampaignActions campaign={c} />
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
