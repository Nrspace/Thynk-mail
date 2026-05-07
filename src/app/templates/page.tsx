import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { DEMO_TEAM } from '@/lib/constants';
import TemplateList from '@/components/templates/TemplateList';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const db = createServerClient();
  const { data: templates } = await db
    .from('templates')
    .select('*')
    .eq('team_id', DEMO_TEAM)
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
