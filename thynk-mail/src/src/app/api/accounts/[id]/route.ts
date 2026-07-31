import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { encryptCredential } from '@/lib/crypto';
import { requireProjectContext } from '@/lib/api-auth';

interface Params { params: { id: string } }

const SAFE_COLUMNS =
  'id,name,email,provider,smtp_host,smtp_port,smtp_user,' +
  'ses_region,ses_access_key_id,ses_configuration_set,' +
  'daily_limit,sent_today,last_reset_date,is_active,created_at,has_api_key';

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select(SAFE_COLUMNS)
    .eq('id', params.id)
    .eq('team_id', projectId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  delete body.team_id; // never allow moving a record between projects

  // Encrypt SMTP password if provided
  if (body.smtp_pass) {
    body.smtp_pass_encrypted = encryptCredential(body.smtp_pass);
    delete body.smtp_pass;
  }

  // Handle API key separately — encrypt and set has_api_key flag
  if ('api_key' in body) {
    if (body.api_key && body.api_key.trim()) {
      body.api_key_encrypted = encryptCredential(body.api_key.trim());
      body.has_api_key = true;
    }
    delete body.api_key;
  }

  // Encrypt Amazon SES secret access key if provided (leave stored key
  // untouched when the field is left blank on edit)
  if ('ses_secret_access_key' in body) {
    if (body.ses_secret_access_key && body.ses_secret_access_key.trim()) {
      body.ses_secret_access_key_encrypted = encryptCredential(body.ses_secret_access_key.trim());
    }
    delete body.ses_secret_access_key;
  }

  const { data, error } = await db
    .from('email_accounts')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('team_id', projectId)
    .select(SAFE_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { error } = await db.from('email_accounts').delete().eq('id', params.id).eq('team_id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
