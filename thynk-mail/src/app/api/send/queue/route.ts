import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/smtp-router';
import { buildFinalHtml } from '@/lib/template-renderer';
import type { EmailAccount, Contact } from '@/types';

const RATE_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json();
  if (!campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });

  const db = createServerClient();
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Load campaign
  const { data: campaign, error: cErr } = await db
    .from('campaigns').select('*').eq('id', campaign_id).single();
  if (cErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (!campaign.account_id) return NextResponse.json({ error: 'No sending account assigned' }, { status: 400 });

  // Load account (fresh read)
  const { data: account, error: aErr } = await db
    .from('email_accounts').select('*').eq('id', campaign.account_id).single();
  if (aErr || !account) return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
  if (!account.is_active) return NextResponse.json({ error: 'Email account is inactive' }, { status: 400 });

  // Mark campaign sending
  await db.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);

  // Load contacts from lists
  const listIds: string[] = campaign.list_ids ?? [];
  if (!listIds.length) {
    await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id);
    return NextResponse.json({ error: 'No recipient lists selected' }, { status: 400 });
  }

  const { data: clRows } = await db
    .from('contact_lists').select('contact_id').in('list_id', listIds);
  const contactIds = Array.from(new Set((clRows ?? []).map(r => r.contact_id)));

  if (!contactIds.length) {
    await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id);
    return NextResponse.json({ error: 'No contacts in selected lists' }, { status: 400 });
  }

  // Load subscribed contacts
  const { data: contacts } = await db
    .from('contacts').select('*').in('id', contactIds).eq('is_subscribed', true);

  // Filter suppressions
  const { data: suppressions } = await db
    .from('suppressions').select('email')
    .eq('team_id', campaign.team_id)
    .in('email', (contacts ?? []).map((c: Contact) => c.email));
  const suppressedSet = new Set((suppressions ?? []).map(s => s.email));
  const eligible = (contacts ?? []).filter((c: Contact) => !suppressedSet.has(c.email));

  if (!eligible.length) {
    await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id);
    return NextResponse.json({ error: 'All contacts are suppressed or unsubscribed' }, { status: 400 });
  }

  // Create send logs
  const logRows = eligible.map((c: Contact) => ({
    campaign_id, contact_id: c.id, account_id: account.id, status: 'queued',
  }));
  const { data: logs } = await db.from('send_logs').insert(logRows).select('id, contact_id');

  // Update total recipients
  await db.from('campaigns').update({ total_recipients: eligible.length }).eq('id', campaign_id);

  // Send with rate limiting
  let sentCount = 0;
  let failCount = 0;
  let currentSentToday = account.sent_today;

  for (const log of logs ?? []) {
    const contact = eligible.find((c: Contact) => c.id === log.contact_id);
    if (!contact) continue;

    // Check daily limit (use fresh count)
    if (currentSentToday >= account.daily_limit) {
      await db.from('send_logs').update({
        status: 'failed', error_message: 'Daily send limit reached',
      }).eq('id', log.id);
      failCount++;
      continue;
    }

    const variables: Record<string, string> = {
      first_name: contact.first_name ?? '',
      last_name:  contact.last_name  ?? '',
      email:      contact.email,
      ...(contact.metadata ?? {}),
    };

    const html         = buildFinalHtml(campaign.html_body, log.id, APP_URL, variables);
    const unsubUrl     = `${APP_URL}/unsubscribe?id=${log.id}`;
    const result       = await sendEmail({
      account:    account as EmailAccount,
      to:         contact.email,
      toName:     `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || undefined,
      subject:    campaign.subject,
      html,
      text:       campaign.text_body ?? '',
      fromName:   campaign.from_name,
      fromEmail:  campaign.from_email,
      replyTo:    campaign.reply_to ?? undefined,
      headers:    { 'List-Unsubscribe': `<${unsubUrl}>` },
    });

    if (result.success) {
      sentCount++;
      currentSentToday++;
      await db.from('send_logs').update({
        status: 'sent', message_id: result.messageId ?? null,
        sent_at: new Date().toISOString(),
      }).eq('id', log.id);

      // Update account sent_today counter
      await db.from('email_accounts')
        .update({ sent_today: currentSentToday })
        .eq('id', account.id);
    } else {
      failCount++;
      await db.from('send_logs').update({
        status: 'failed', error_message: result.error ?? 'Unknown error',
      }).eq('id', log.id);
    }

    await sleep(RATE_DELAY_MS);
  }

  // Mark campaign complete
  const finalStatus = sentCount === 0 ? 'failed' : 'sent';
  await db.from('campaigns').update({
    status:     finalStatus,
    sent_at:    new Date().toISOString(),
    sent_count: sentCount,
  }).eq('id', campaign_id);

  return NextResponse.json({
    success: true,
    sent:    sentCount,
    failed:  failCount,
    total:   eligible.length,
  });
}
