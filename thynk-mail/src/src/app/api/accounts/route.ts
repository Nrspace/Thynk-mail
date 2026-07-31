import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';
import { requireProjectContext } from '@/lib/api-auth';

// Never return secret_encrypted columns to the client.
const SAFE_COLUMNS =
  'id,name,email,provider,smtp_host,smtp_port,smtp_user,' +
  'ses_region,ses_access_key_id,ses_configuration_set,' +
  'daily_limit,sent_today,last_reset_date,is_active,created_at';

const PROVIDERS = ['gmail', 'zoho', 'outlook', 'brevo', 'smtp', 'ses'];

export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select(SAFE_COLUMNS)
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const {
    name, email, provider,
    smtp_host, smtp_port, smtp_user, smtp_pass,
    ses_region, ses_access_key_id, ses_secret_access_key, ses_configuration_set,
    daily_limit,
  } = body;

  if (!name || !email || !provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Name, email, and provider required' }, { status: 400 });
  }

  const insertRow: Record<string, unknown> = {
    team_id: projectId,
    name, email, provider,
    daily_limit: daily_limit || 500,
    is_active: true,
  };

  if (provider === 'ses') {
    if (!ses_access_key_id || !ses_secret_access_key) {
      return NextResponse.json(
        { error: 'Amazon SES Access Key ID and Secret Access Key are required' },
        { status: 400 }
      );
    }
    insertRow.ses_region = ses_region || 'us-east-1';
    insertRow.ses_access_key_id = ses_access_key_id;
    insertRow.ses_secret_access_key_encrypted = encryptCredential(ses_secret_access_key);
    insertRow.ses_configuration_set = ses_configuration_set || null;
    // smtp_user kept as the verified "From" address for display/reference
    insertRow.smtp_user = smtp_user || email;
  } else {
    if (!smtp_pass) {
      return NextResponse.json({ error: 'SMTP password is required' }, { status: 400 });
    }
    insertRow.smtp_host = smtp_host || null;
    insertRow.smtp_port = smtp_port || 587;
    insertRow.smtp_user = smtp_user || email;
    insertRow.smtp_pass_encrypted = encryptCredential(smtp_pass);
  }

  const { data, error } = await db
    .from('email_accounts')
    .insert(insertRow)
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
