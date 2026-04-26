import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/smtp-router';
import type { EmailAccount } from '@/types';

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { account_id, to, subject, html, text, from_name, from_email } = body;

  if (!account_id || !to || !subject || !html) {
    return NextResponse.json({ error: 'account_id, to, subject, html required' }, { status: 400 });
  }

  const { data: account, error } = await db
    .from('email_accounts')
    .select('*')
    .eq('id', account_id)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const result = await sendEmail({
    account: account as EmailAccount,
    to,
    subject,
    html,
    text: text ?? '',
    fromName: from_name ?? account.name,
    fromEmail: from_email ?? account.email,
  });

  return NextResponse.json(result);
}
