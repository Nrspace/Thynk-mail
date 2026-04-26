import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const body = await req.json();
  const { data, error } = await db
    .from('campaigns')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { error } = await db.from('campaigns').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
