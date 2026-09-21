import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractVariables } from '@/lib/template-renderer';
import { unwrapNestedDocuments } from '@/lib/html-unwrap';
import { revalidatePath } from 'next/cache';
import { requireProjectContext } from '@/lib/api-auth';

export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('templates')
    .select('*')
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Heal any template whose html_body got nested by the pre-fix edit/save
  // bug (see html-unwrap.ts) before handing it to any consumer — including
  // the campaign form's "Load from Template" dropdown, which reads
  // html_body straight from this endpoint and would otherwise copy the
  // padding bug into every new campaign made from an affected template.
  // Persist the healed version so this only has to happen once per template.
  const rows = data ?? [];
  const healed = await Promise.all(rows.map(async (row) => {
    const clean = unwrapNestedDocuments(row.html_body ?? '');
    if (clean !== row.html_body) {
      await db.from('templates').update({ html_body: clean }).eq('id', row.id).eq('team_id', projectId);
      return { ...row, html_body: clean };
    }
    return row;
  }));

  return NextResponse.json({ data: healed });
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const { name, subject, html_body, text_body } = body;

  if (!name || !subject) {
    return NextResponse.json({ error: 'Name and subject required' }, { status: 400 });
  }

  const variables = extractVariables(html_body ?? '');

  const { data, error } = await db
    .from('templates')
    .insert({
      team_id: projectId,
      name,
      subject,
      html_body: html_body ?? '',
      text_body: text_body ?? null,
      variables,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/templates');
  return NextResponse.json(data, { status: 201 });
}
