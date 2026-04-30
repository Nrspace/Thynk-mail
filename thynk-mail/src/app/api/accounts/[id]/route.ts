import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';

interface Params { params: { id: string } }

const ACCOUNT_SELECT =
  'id,name,email,provider,smtp_host,smtp_port,smtp_user,' +
  'daily_limit,sent_today,last_reset_date,is_active,created_at,api_key_encrypted';

function safeAccount(data: Record<string, unknown>) {
  return { ...data, has_api_key: !!data.api_key_encrypted, api_key_encrypted: undefined };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select(ACCOUNT_SELECT)
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(safeAccount(data));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const body = await req.json();

  // Convert plain-text secrets to encrypted before persisting
  if (body.smtp_pass) {
    body.smtp_pass_encrypted = encryptCredential(body.smtp_pass);
    delete body.smtp_pass;
  }
  if (body.api_key) {
    body.api_key_encrypted = encryptCredential(body.api_key);
    delete body.api_key;
  }

  // Never let the client set api_key_encrypted directly
  delete body.has_api_key;

  const { data, error } = await db
    .from('email_accounts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(ACCOUNT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(safeAccount(data));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { error } = await db
    .from('email_accounts')
    .delete()
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
