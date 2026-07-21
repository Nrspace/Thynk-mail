import { NextRequest, NextResponse } from 'next/server';
import { requireProjectContext } from '@/lib/api-auth';
import { testConfig } from '@/lib/smtp-router';
import type { EmailAccount } from '@/types';

/**
 * Tests SMTP/API credentials for an account that hasn't been saved yet —
 * used by the "Test Connection" button on the Add Account form, so people
 * can verify Brevo/Gmail/Zoho/Outlook/SMTP/SES credentials before saving them.
 * (See /api/accounts/test/route.ts for testing an already-saved account.)
 */
export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const provider = body.provider as EmailAccount['provider'];
  const email = body.email as string;

  if (!provider || !email) {
    return NextResponse.json({ ok: false, error: 'Provider and email are required' }, { status: 400 });
  }

  if (provider === 'ses') {
    if (!body.ses_access_key_id || !body.ses_secret_access_key) {
      return NextResponse.json({ ok: false, error: 'SES Access Key ID and Secret Access Key are required' }, { status: 400 });
    }
  } else if (!body.smtp_pass) {
    return NextResponse.json({ ok: false, error: 'SMTP password is required' }, { status: 400 });
  }

  const result = await testConfig({
    provider,
    email,
    smtp_user: body.smtp_user,
    smtp_pass: body.smtp_pass,
    smtp_host: body.smtp_host,
    smtp_port: body.smtp_port,
    ses_region: body.ses_region,
    ses_access_key_id: body.ses_access_key_id,
    ses_secret_access_key: body.ses_secret_access_key,
  });

  return NextResponse.json(result);
}
