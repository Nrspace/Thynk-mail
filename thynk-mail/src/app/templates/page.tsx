import { createServerClient } from '@/lib/supabase';
import Link from 'next/link';
import { FileText, Plus, Edit } from 'lucide-react';

import { DEMO_TEAM } from '@/lib/constants';

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

      {rows.length === 0 ? (
        <div className="card py-20 text-center text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm mt-1">Create reusable email templates</p>
          <Link href="/templates/new" className="btn-primary mt-5 inline-flex">
            <Plus size={14} /> Create Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(t => (
            <div key={t.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <FileText size={18} className="text-purple-600" />
                </div>
                <Link href={`/templates/${t.id}/edit`} className="text-gray-400 hover:text-gray-600">
                  <Edit size={15} />
                </Link>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{t.name}</h3>
              <p className="text-sm text-gray-500 truncate">{t.subject}</p>
              {t.variables?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.variables.slice(0, 3).map((v: string) => (
                    <span key={v} className="badge-blue text-xs">{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">
                {new Date(t.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
