import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

import { DEMO_TEAM } from '@/lib/constants';

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const {
    name, subject, from_name, from_email, reply_to,
    html_body, text_body, template_id, account_id,
    list_ids, status, scheduled_at,
  } = body;

  if (!name || !subject || !from_name || !from_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Count total recipients from selected lists
  let total_recipients = 0;
  if (list_ids?.length > 0) {
    const { count } = await db
      .from('contact_lists')
      .select('*', { count: 'exact', head: true })
      .in('list_id', list_ids);
    total_recipients = count ?? 0;
  }

  const { data, error } = await db
    .from('campaigns')
    .insert({
      team_id: DEMO_TEAM,
      name, subject, from_name, from_email,
      reply_to:     reply_to     || null,
      html_body:    html_body    || '',
      text_body:    text_body    || null,
      template_id:  template_id  || null,
      account_id:   account_id   || null,
      list_ids:     list_ids     || [],
      status:       status       || 'draft',
      scheduled_at: scheduled_at || null,
      total_recipients,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If status is 'sending', trigger the queue
  if (status === 'sending' && data?.id) {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: data.id }),
    }).catch(() => null);
  }

  return NextResponse.json(data, { status: 201 });
}
