import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractVariables } from '@/lib/template-renderer';
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
  return NextResponse.json({ data });
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
