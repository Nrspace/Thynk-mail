import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, Send, Users, Eye, MousePointer, AlertCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

interface Props { params: { id: string } }

export default async function CampaignDetailPage({ params }: Props) {
  const db = createServerClient();
  const { data: campaign } = await db
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!campaign) notFound();

  const openRate = campaign.sent_count > 0
    ? ((campaign.open_count / campaign.sent_count) * 100).toFixed(1)
    : '0.0';
  const clickRate = campaign.sent_count > 0
    ? ((campaign.click_count / campaign.sent_count) * 100).toFixed(1)
    : '0.0';
  const bounceRate = campaign.sent_count > 0
    ? ((campaign.bounce_count / campaign.sent_count) * 100).toFixed(1)
    : '0.0';

  const stats = [
    { label: 'Recipients',  value: campaign.total_recipients ?? 0, icon: Users,         color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Sent',        value: campaign.sent_count ?? 0,        icon: Send,          color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Opens',       value: `${campaign.open_count ?? 0} (${openRate}%)`,  icon: Eye,     color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Clicks',      value: `${campaign.click_count ?? 0} (${clickRate}%)`, icon: MousePointer, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Bounces',     value: `${campaign.bounce_count ?? 0} (${bounceRate}%)`, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
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
