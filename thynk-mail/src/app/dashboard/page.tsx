import { createServerClient } from '@/lib/supabase';
import { BarChart3, Send, Users, TrendingUp, Mail, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { DEMO_TEAM } from '@/lib/constants';

async function getStats(teamId: string) {
  const db = createServerClient();

  const [campaigns, contacts, sentLogs, openedLogs] = await Promise.all([
    db.from('campaigns').select('id, status', { count: 'exact' }).eq('team_id', teamId),
    db.from('contacts').select('id', { count: 'exact' }).eq('team_id', teamId),
    db.from('send_logs').select('id', { count: 'exact' }).eq('status', 'sent'),
    db.from('send_logs').select('id', { count: 'exact' }).eq('status', 'opened'),
  ]);

  const activeCampaigns = (campaigns.data ?? []).filter(
    (c) => c.status === 'sending' || c.status === 'scheduled'
  ).length;

  return {
    totalCampaigns: campaigns.count ?? 0,
    activeCampaigns,
    totalContacts: contacts.count ?? 0,
    totalSent: sentLogs.count ?? 0,
    totalOpened: openedLogs.count ?? 0,
    openRate:
      sentLogs.count && openedLogs.count
        ? Math.round(((openedLogs.count ?? 0) / (sentLogs.count ?? 1)) * 100)
        : 0,
  };
}

async function getRecentCampaigns(teamId: string) {
  const db = createServerClient();
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { data } = await db
    .from('campaigns')
    .select('id, name, status, sent_count, open_count, created_at')
    .eq('team_id', teamId)
    .gte('created_at', startOfYear)
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, recent] = await Promise.all([
    getStats(DEMO_TEAM),
    getRecentCampaigns(DEMO_TEAM),
  ]);

  const cards = [
    { label: 'Total Campaigns', value: stats.totalCampaigns,  icon: Send,        color: 'text-teal-600',   bg: 'bg-teal-50' },
    { label: 'Active',          value: stats.activeCampaigns, icon: TrendingUp,  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'Total Contacts',  value: stats.totalContacts,   icon: Users,       color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Emails Sent',     value: stats.totalSent,       icon: Mail,        color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Opened',          value: stats.totalOpened,     icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Open Rate',       value: `${stats.openRate}%`,  icon: BarChart3,   color: 'text-pink-600',   bg: 'bg-pink-50' },
  ];

  const statusColors: Record<string, string> = {
    sent:      'badge-green',
    sending:   'badge-blue',
    scheduled: 'badge-yellow',
    draft:     'badge-gray',
    failed:    'badge-red',
    paused:    'badge-yellow',
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 themed-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold themed-heading">Dashboard</h1>
          <p className="text-sm mt-1 themed-muted">
            Welcome back — here&apos;s your overview ·{' '}
            <span className="themed-brand font-medium">Current Year {currentYear}</span>
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <Send size={15} />
          New Campaign
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-semibold themed-heading">{value}</p>
            <p className="text-xs mt-0.5 themed-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent Campaigns */}
      <div className="card">
        <div className="flex items-center justify-between px-6 py-4 themed-border-b">
          <h2 className="font-semibold themed-heading">
            Recent Campaigns
            <span className="ml-2 text-xs font-normal themed-muted">({currentYear})</span>
          </h2>
          <Link href="/campaigns" className="text-sm hover:underline themed-link">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-16 text-center themed-muted">
            <Send size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No campaigns yet this year</p>
            <Link href="/campaigns/new" className="btn-primary mt-4 inline-flex">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div>
            {recent.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="campaign-row flex items-center justify-between px-6 py-3.5 transition-colors themed-border-b"
              >
                <div>
                  <p className="text-sm font-medium themed-heading">{c.name}</p>
                  <p className="text-xs mt-0.5 themed-muted">
                    {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-medium themed-heading">{c.sent_count ?? 0}</p>
                    <p className="text-xs themed-muted">Sent</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-medium themed-heading">{c.open_count ?? 0}</p>
                    <p className="text-xs themed-muted">Opens</p>
                  </div>
                  <span className={statusColors[c.status] ?? 'badge-gray'}>{c.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
