import { createServerClient } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';
import SuppressionList from '@/components/suppressions/SuppressionList';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function SuppressionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const db = createServerClient();
  const { data: rows, count } = await db
    .from('suppressions')
    .select('*', { count: 'exact' })
    .eq('team_id', projectId)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Unsubscribe List</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Every email address campaigns will never be sent to — from unsubscribe clicks, bounces, complaints, or manual entries.
        </p>
      </div>

      <SuppressionList initialRows={rows ?? []} initialTotal={count ?? 0} pageSize={PAGE_SIZE} />
    </div>
  );
}
