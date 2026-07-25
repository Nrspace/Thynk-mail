import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, Send, Users, Eye, MousePointer, AlertCircle } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';

interface Props { params: { id: string } }

// Always render fresh — never statically or client-router-cache this page,
// since it shows live open/click counts that can change at any moment.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CampaignDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const db = createServerClient();
  const { data: campaign } = await db
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .eq('team_id', projectId)
    .single();

  if (!campaign) notFound();

  // SINGLE SOURCE OF TRUTH: send_logs — same approach as the Dashboard,
  // Reports, and Campaigns list pages, so all four always agree. This
  // replaces campaign.open_count/click_count/bounce_count, which were kept
  // in sync via a Postgres RPC call (increment_campaign_opens/clicks) that
  // fails silently if it errors — e.g. if that function was never created
  // on this Supabase project — leaving those columns stuck at stale values
  // while send_logs itself was always being updated correctly.
  let sentCount = 0, openCount = 0, clickCount = 0, bounceCount = 0;
  {
    let pg = 0;
    const pgSize = 1000;
    while (true) {
      const { data: batch } = await db
        .from('send_logs')
        .select('status')
        .eq('campaign_id', campaign.id)
        .not('status', 'eq', 'queued')
        .range(pg * pgSize, (pg + 1) * pgSize - 1);
      for (const l of (batch ?? [])) {
        const s = l.status;
        if (['sent', 'delivered', 'opened', 'clicked'].includes(s)) sentCount++;
        if (s === 'opened' || s === 'clicked') openCount++;
        if (s === 'clicked') clickCount++;
        if (s === 'bounced') bounceCount++;
      }
      if ((batch ?? []).length < pgSize) break;
      pg++;
    }
  }

  const openRate = sentCount > 0
    ? ((openCount / sentCount) * 100).toFixed(1)
    : '0.0';
  const clickRate = sentCount > 0
    ? ((clickCount / sentCount) * 100).toFixed(1)
    : '0.0';
  const bounceRate = sentCount > 0
    ? ((bounceCount / sentCount) * 100).toFixed(1)
    : '0.0';

  const stats = [
    { label: 'Recipients',  value: campaign.total_recipients ?? 0, icon: Users,         color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Sent',        value: sentCount,        icon: Send,          color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Opens',       value: `${openCount} (${openRate}%)`,  icon: Eye,     color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Clicks',      value: `${clickCount} (${clickRate}%)`, icon: MousePointer, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Bounces',     value: `${bounceCount} (${bounceRate}%)`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const statusColors: Record<string, string> = {
    sent: 'badge-green', sending: 'badge-blue', scheduled: 'badge-yellow',
    draft: 'badge-gray', failed: 'badge-red', paused: 'badge-yellow',
  };

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            <span className={statusColors[campaign.status] ?? 'badge-gray'}>{campaign.status}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{campaign.subject}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-lg font-semibold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Campaign Details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-gray-500">From</dt><dd className="font-medium">{campaign.from_name} &lt;{campaign.from_email}&gt;</dd></div>
          <div><dt className="text-gray-500">Created</dt><dd className="font-medium">{new Date(campaign.created_at).toLocaleString()}</dd></div>
          {campaign.scheduled_at && <div><dt className="text-gray-500">Scheduled</dt><dd className="font-medium">{new Date(campaign.scheduled_at).toLocaleString()}</dd></div>}
          {campaign.sent_at && <div><dt className="text-gray-500">Sent At</dt><dd className="font-medium">{new Date(campaign.sent_at).toLocaleString()}</dd></div>}
        </dl>
      </div>
    </div>
  );
}
