import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { Workflow, Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';
import { formatInTz } from '@/lib/sequence-time';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusColors: Record<string, string> = {
  active: 'badge-blue', draft: 'badge-gray', paused: 'badge-yellow', completed: 'badge-green', cancelled: 'badge-red',
};

export default async function SequencesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const db = createServerClient();
  const { data: seqs, error } = await db.from('sequences').select('*').eq('team_id', projectId).order('created_at', { ascending: false });
  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          <strong>Database error:</strong> {error.message}
          <p className="mt-1 text-xs">Have you run <code>migration-sequences.sql</code> in Supabase?</p>
        </div>
      </div>
    );
  }

  const rows = seqs ?? [];
  const ids = rows.map((s: any) => s.id);
  const [{ data: steps }, { data: camps }] = ids.length
    ? await Promise.all([
        db.from('sequence_steps').select('sequence_id').in('sequence_id', ids),
        db.from('campaigns').select('sequence_id, status, scheduled_at, sent_count').in('sequence_id', ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Sequences</h1>
          <p className="text-sm text-gray-500 mt-1">Automated multi-email drips that send themselves on a schedule</p>
        </div>
        <Link href="/sequences/new" className="btn-primary"><Plus size={15} /> New Sequence</Link>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Workflow size={36} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No sequences yet</p>
            <p className="text-sm mt-1">Create a 3–4 email follow-up that sends automatically</p>
            <Link href="/sequences/new" className="btn-primary mt-5 inline-flex"><Plus size={14} /> Create Sequence</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">Sequence</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Next email</th>
                <th className="px-4 py-3 font-medium text-right">Emails sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((s: any) => {
                const total = (steps ?? []).filter((x: any) => x.sequence_id === s.id).length;
                const mine = (camps ?? []).filter((c: any) => c.sequence_id === s.id);
                const done = mine.filter((c: any) => c.status === 'sent').length;
                const sentTotal = mine.reduce((sum: number, c: any) => sum + (c.sent_count ?? 0), 0);
                const upcoming = mine.filter((c: any) => c.status === 'scheduled' && c.scheduled_at)
                  .sort((a: any, b: any) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/sequences/${s.id}`} className="font-medium text-gray-900 hover:text-teal-600">{s.name}</Link>
                      <p className="text-xs text-gray-400 mt-0.5">{total} emails · {s.list_ids?.length ?? 0} list(s)</p>
                    </td>
                    <td className="px-4 py-3.5"><span className={statusColors[s.status] ?? 'badge-gray'}>{s.status}</span></td>
                    <td className="px-4 py-3.5 text-xs text-gray-600">
                      {s.status === 'draft' ? '—' : `${done} of ${total} emails done`}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-600">
                      {s.status === 'active' && upcoming ? formatInTz(upcoming.scheduled_at, s.timezone) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{sentTotal.toLocaleString()}</td>
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
