import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data: lists, error } = await db
    .from('lists')
    .select('id, name, description, created_at')
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count contacts per list
  const withCounts = await Promise.all(
    (lists ?? []).map(async (l) => {
      const { count } = await db
        .from('contact_lists')
        .select('contact_id', { count: 'exact' })
        .eq('list_id', l.id);
      return { ...l, contact_count: count ?? 0 };
    })
  );

  return NextResponse.json({ data: withCounts });
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const { data, error } = await db
    .from('lists')
    .insert({ team_id: projectId, name, description })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
