import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { ArrowLeft, Clock, Users, Send, Eye, MousePointer, AlertCircle, AlertTriangle } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';
import { computeSchedule, formatInTz } from '@/lib/sequence-time';
import SequenceActions from '@/components/sequences/SequenceActions';

interface Props { params: { id: string } }

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const seqColors: Record<string, string> = {
  active: 'badge-blue', draft: 'badge-gray', paused: 'badge-yellow', completed: 'badge-green', cancelled: 'badge-red',
};
const campColors: Record<string, string> = {
  sent: 'badge-green', sending: 'badge-blue', scheduled: 'badge-yellow', paused: 'badge-yellow', draft: 'badge-gray', failed: 'badge-red',
};

function audienceText(audience: string, n: number): string {
  switch (audience) {
    case 'not_opened':  return `Only people who did not open Email ${n - 1}`;
    case 'opened':      return `Only people who opened Email ${n - 1}`;
    case 'not_clicked': return `Only people who did not click Email ${n - 1}`;
    case 'clicked':     return `Only people who clicked Email ${n - 1}`;
    default:            return 'Everyone who received Email 1';
  }
}

export default async function SequenceDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const db = createServerClient();
  const { data: seq } = await db.from('sequences').select('*').eq('id', params.id).eq('team_id', projectId).maybeSingle();
  if (!seq) notFound();

  const { data: steps } = await db.from('sequence_steps').select('*').eq('sequence_id', seq.id).order('step_number');
  const campIds = (steps ?? []).map((s: any) => s.campaign_id).filter(Boolean);
  const { data: camps } = campIds.length ? await db.from('campaigns').select('*').in('id', campIds) : { data: [] as any[] };
  const campById = new Map<string, any>((camps ?? []).map((c: any) => [c.id, c]));

  // Draft: show the schedule as it would be if launched now / at the chosen start.
  const previewTimes = computeSchedule(seq.start_at ? new Date(seq.start_at) : new Date(), steps ?? [], seq.timezone);
  const isDraft = seq.status === 'draft';

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start gap-3 mb-6">
        <Link href="/sequences" className="text-gray-400 hover:text-gray-600 mt-2"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{seq.name}</h1>
            <span className={seqColors[seq.status] ?? 'badge-gray'}>{seq.status}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {(steps ?? []).length} emails · {seq.list_ids?.length ?? 0} list(s) · times in {seq.timezone}
          </p>
        </div>
        <SequenceActions id={seq.id} name={seq.name} status={seq.status} />
      </div>

      {seq.status_note && ['paused', 'cancelled'].includes(seq.status) && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-800 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{seq.status_note}</span>
        </div>
      )}
      {isDraft && (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 text-blue-700 text-sm">
          This is a draft — nothing is sent until you launch it. Times below show the schedule if launched {seq.start_at ? 'at your chosen start time' : 'right now'}.
        </div>
      )}

      <div className="space-y-0">
        {(steps ?? []).map((s: any, i: number) => {
          const n = s.step_number as number;
          const c = s.campaign_id ? campById.get(s.campaign_id) : null;
          const when = s.scheduled_at ?? previewTimes[i]?.toISOString();
          const sent = c?.sent_count ?? 0;
          const pct = (v: number) => sent > 0 ? ` (${((v / sent) * 100).toFixed(1)}%)` : '';
          return (
            <div key={s.id}>
              {i > 0 && (
                <div className="pl-6 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <span className="w-px h-5 bg-teal-300 inline-block ml-3" />
                  Wait {s.delay_amount} {s.delay_unit === 'days' ? (s.delay_amount === 1 ? 'day' : 'days') : (s.delay_amount === 1 ? 'hour' : 'hours')}
                  {s.delay_unit === 'days' && s.send_time ? `, send at ${s.send_time}` : ''} · {audienceText(s.audience, n)}
                </div>
              )}
              <div className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-teal-600 text-white text-sm font-semibold flex items-center justify-center shrink-0">{n}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{s.subject || '(no subject)'}</p>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Clock size={11} /> {formatInTz(when, seq.timezone)}
                        {c?.status === 'scheduled' && <span className="text-amber-600 ml-1">· waiting</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c ? <span className={campColors[c.status] ?? 'badge-gray'}>{c.status}</span> : <span className="badge-gray">not launched</span>}
                    {c && <Link href={`/campaigns/${c.id}`} className="text-xs text-teal-600 hover:underline">Details →</Link>}
                  </div>
                </div>

                {c && c.status !== 'scheduled' && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
                    <Stat icon={Users} label="Recipients" value={c.total_recipients ?? 0} />
                    <Stat icon={Send} label="Sent" value={sent} />
                    <Stat icon={Eye} label="Opens" value={`${c.open_count ?? 0}${pct(c.open_count ?? 0)}`} />
                    <Stat icon={MousePointer} label="Clicks" value={`${c.click_count ?? 0}${pct(c.click_count ?? 0)}`} />
                    <Stat icon={AlertCircle} label="Bounces" value={c.bounce_count ?? 0} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-gray-500 flex items-center gap-1"><Icon size={11} /> {label}</p>
      <p className="font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
