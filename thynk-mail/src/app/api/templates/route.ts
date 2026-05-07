export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractVariables } from '@/lib/template-renderer';

import { DEMO_TEAM } from '@/lib/constants';

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from('templates')
    .select('*')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
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
      team_id: DEMO_TEAM,
      name,
      subject,
      html_body: html_body ?? '',
      text_body: text_body ?? null,
      variables,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
