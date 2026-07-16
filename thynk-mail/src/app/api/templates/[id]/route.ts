import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractVariables } from '@/lib/template-renderer';
import { revalidatePath } from 'next/cache';
import { requireProjectContext } from '@/lib/api-auth';

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('templates').select('*').eq('id', params.id).eq('team_id', projectId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  if (body.html_body) body.variables = extractVariables(body.html_body);
  delete body.team_id; // never allow moving a record between projects
  const { data, error } = await db
    .from('templates')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('team_id', projectId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/templates');
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { error } = await db.from('templates').delete().eq('id', params.id).eq('team_id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/templates');
  return NextResponse.json({ success: true });
}
