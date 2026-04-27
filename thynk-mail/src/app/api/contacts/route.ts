import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

import { DEMO_TEAM } from '@/lib/constants';

export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const list_id = searchParams.get('list_id');
  const search = searchParams.get('search');

  let query = db
    .from('contacts')
    .select('*')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (list_id) {
    const { data: cl } = await db
      .from('contact_lists')
      .select('contact_id')
      .eq('list_id', list_id);
    const ids = (cl ?? []).map((r) => r.contact_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { email, first_name, last_name, metadata } = body;

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await db
    .from('contacts')
    .upsert(
      { team_id: DEMO_TEAM, email, first_name, last_name, metadata: metadata ?? {} },
      { onConflict: 'team_id,email' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
