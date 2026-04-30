import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';
import { DEMO_TEAM } from '@/lib/constants';

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select('id,name,email,provider,smtp_host,smtp_port,smtp_user,daily_limit,sent_today,last_reset_date,is_active,created_at,api_key_encrypted')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const safe = (data ?? []).map(a => {
    const { api_key_encrypted, ...rest } = a as any;
    return { ...rest, has_api_key: !!api_key_encrypted };
  });
  return NextResponse.json({ data: safe });
}

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { name, email, provider, smtp_host, smtp_port, smtp_user, smtp_pass, api_key, daily_limit } = body;

  if (!name || !email || !provider || !['gmail','zoho','outlook','brevo','smtp'].includes(provider)) {
    return NextResponse.json({ error: 'Name, email, and provider required' }, { status: 400 });
  }
  if (!smtp_pass) {
    return NextResponse.json({ error: 'SMTP password is required' }, { status: 400 });
  }

  const smtp_pass_encrypted = encryptCredential(smtp_pass);
  const api_key_encrypted   = api_key ? encryptCredential(api_key) : null;

  const { data, error } = await db
    .from('email_accounts')
    .insert({
      team_id: DEMO_TEAM,
      name, email, provider,
      smtp_host:  smtp_host  || null,
      smtp_port:  smtp_port  || 587,
      smtp_user:  smtp_user  || email,
      smtp_pass_encrypted,
      api_key_encrypted,
      daily_limit: daily_limit || 500,
      is_active: true,
    })
    .select('id,name,email,provider,smtp_host,smtp_port,smtp_user,daily_limit,sent_today,last_reset_date,is_active,created_at,api_key_encrypted')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { api_key_encrypted: _k, ...rest } = data as any;
  return NextResponse.json({ ...rest, has_api_key: !!_k }, { status: 201 });
}
