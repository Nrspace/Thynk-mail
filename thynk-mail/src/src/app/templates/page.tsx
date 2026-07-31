import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';
import TemplateList from '@/components/templates/TemplateList';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const projectId = await getActiveProjectId(user);
  if (!projectId) redirect('/projects');

  const db = createServerClient();
  const { data: templates } = await db
    .from('templates')
    .select('*')
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });

  const rows = templates ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} templates</p>
        </div>
        <Link href="/templates/new" className="btn-primary">
          <Plus size={14} /> New Template
        </Link>
      </div>

      <TemplateList templates={rows} />
    </div>
  );
}
