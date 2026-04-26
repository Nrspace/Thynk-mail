import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';

const DEMO_TEAM = 'demo-team-id';

export async function GET() {
  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select('id,name,email,provider,smtp_host,smtp_port,smtp_user,daily_limit,sent_today,is_active,created_at')
    .eq('team_id', DEMO_TEAM)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { name, email, provider, smtp_host, smtp_port, smtp_user, smtp_pass, daily_limit } = body;

  if (!name || !email || !provider || !['gmail','zoho','outlook','brevo','smtp'].includes(provider)) {
    return NextResponse.json({ error: 'Name, email, and provider required' }, { status: 400 });
  }

  const smtp_pass_encrypted = smtp_pass ? encryptCredential(smtp_pass) : null;

  const { data, error } = await db
    .from('email_accounts')
    .insert({
      team_id: DEMO_TEAM,
      name, email, provider,
      smtp_host: smtp_host || null,
      smtp_port: smtp_port || 587,
      smtp_user: smtp_user || email,
      smtp_pass_encrypted,
      daily_limit: daily_limit || 500,
      is_active: true,
    })
    .select('id,name,email,provider,smtp_host,smtp_port,smtp_user,daily_limit,sent_today,is_active,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
