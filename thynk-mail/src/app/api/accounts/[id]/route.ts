import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select('id,name,email,provider,smtp_host,smtp_port,smtp_user,daily_limit,sent_today,is_active,created_at')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const body = await req.json();
  if (body.smtp_pass) {
    body.smtp_pass_encrypted = encryptCredential(body.smtp_pass);
    delete body.smtp_pass;
  }
  const { data, error } = await db
    .from('email_accounts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { error } = await db.from('email_accounts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
