import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/smtp-router';
import { buildFinalHtml } from '@/lib/template-renderer';
import type { EmailAccount, Contact } from '@/types';

const RATE_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// WHY STREAMING?
// Vercel's gateway closes any connection that receives no bytes for ~25-30 s.
// A campaign with 50+ contacts at 1.2 s/email = 60+ seconds before response.
// The gateway then returns an HTML 504 page, which JSON.parse() blows up on
// producing: "Unexpected token 'A', 'An error o...' is not valid JSON"
//
// Fix: return a text/event-stream immediately, then emit progress events as
// each email is sent. The stream keeps the gateway alive for the full 5 min
// window granted by maxDuration:300 in vercel.json.
// ─────────────────────────────────────────────────────────────────────────────

function makeStream() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const emit = (event: string, data: Record<string, unknown>) => {
    writer.write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  };
  const done = () => writer.close().catch(() => {});
  return { readable, emit, done };
}

export async function POST(req: NextRequest) {
  let campaign_id: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!campaign_id) {
    return new Response(JSON.stringify({ error: 'campaign_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { readable, emit, done } = makeStream();

  // Run in background — don't await so the SSE Response is returned immediately
  (async () => {
    const db = createServerClient();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const fail = async (msg: string) => {
      try { await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id); } catch {}
      emit('error', { error: msg });
      done();
    };

    try {
      // Load campaign
      const { data: campaign, error: cErr } = await db
        .from('campaigns').select('*').eq('id', campaign_id).single();
      if (cErr || !campaign) return fail(`Campaign not found: ${cErr?.message ?? 'no data'}`);
      if (!campaign.account_id) return fail('No sending account assigned');

      // Load account
      const { data: account, error: aErr } = await db
        .from('email_accounts').select('*').eq('id', campaign.account_id).single();
      if (aErr || !account) return fail(`Email account not found: ${aErr?.message ?? 'no data'}`);
      if (!account.is_active) return fail('Email account is inactive');

      // Mark sending
      await db.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);
      emit('status', { status: 'sending' });

      // Load contacts
      const listIds: string[] = campaign.list_ids ?? [];
      if (!listIds.length) return fail('No recipient lists selected');

      const { data: clRows, error: clErr } = await db
        .from('contact_lists').select('contact_id').in('list_id', listIds);
      if (clErr) return fail(`Failed to load contact lists: ${clErr.message}`);

      const contactIds = Array.from(new Set((clRows ?? []).map((r: any) => r.contact_id)));
      if (!contactIds.length) return fail('No contacts in selected lists');

      const { data: contacts, error: cxErr } = await db
        .from('contacts').select('*').in('id', contactIds).eq('is_subscribed', true);
      if (cxErr) return fail(`Failed to load contacts: ${cxErr.message}`);

      // Filter suppressions
      let suppressed = new Set<string>();
      if ((contacts ?? []).length > 0 && campaign.team_id) {
        const { data: sx } = await db.from('suppressions').select('email')
          .eq('team_id', campaign.team_id)
          .in('email', (contacts ?? []).map((c: Contact) => c.email));
        suppressed = new Set((sx ?? []).map((s: any) => s.email));
      }

      const eligible = (contacts ?? []).filter((c: Contact) => !suppressed.has(c.email));
      if (!eligible.length) return fail('All contacts are suppressed or unsubscribed');

      emit('progress', { sent: 0, failed: 0, total: eligible.length, pct: 0 });

      // Create send logs (bulk)
      const logRows = eligible.map((c: Contact) => ({
        campaign_id, contact_id: c.id, account_id: account.id, status: 'queued',
      }));
      const { data: logs, error: logsErr } = await db
        .from('send_logs').insert(logRows).select('id, contact_id');
      if (logsErr) return fail(`Failed to create send logs: ${logsErr.message}`);

      await db.from('campaigns').update({ total_recipients: eligible.length }).eq('id', campaign_id);

      // ── Auto-reset sent_today if it's a new UTC day ─────────────────────
      // The schema has last_reset_date for exactly this purpose.
      // Without this check, yesterday's count blocks all sends today.
      const todayUTC = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const lastReset = account.last_reset_date ?? '';        // e.g. '2026-04-28'
      if (lastReset < todayUTC) {
        await db.from('email_accounts')
          .update({ sent_today: 0, last_reset_date: todayUTC })
          .eq('id', account.id);
        account.sent_today = 0;
        account.last_reset_date = todayUTC;
        emit('status', { status: 'sending', message: 'Daily counter reset for new day' });
      }

      // ── Send loop ────────────────────────────────────────────────────────
      let sentCount = 0;
      let failCount = 0;
      let sentToday = account.sent_today ?? 0;
      const total = eligible.length;

      for (const log of logs ?? []) {
        const contact = eligible.find((c: Contact) => c.id === log.contact_id);
        if (!contact) continue;

        if (sentToday >= account.daily_limit) {
          await db.from('send_logs').update({ status: 'failed', error_message: 'Daily limit reached' }).eq('id', log.id);
          failCount++;
          emit('progress', { sent: sentCount, failed: failCount, total, pct: Math.round(((sentCount + failCount) / total) * 100) });
          continue;
        }

        const vars: Record<string, string> = {
          first_name: contact.first_name ?? '',
          last_name:  contact.last_name  ?? '',
          email:      contact.email,
          ...(contact.metadata ?? {}),
        };

        const html   = buildFinalHtml(campaign.html_body, log.id, APP_URL, vars);
        const unsub  = `${APP_URL}/unsubscribe?id=${log.id}`;
        const result = await sendEmail({
          account:   account as EmailAccount,
          to:        contact.email,
          toName:    `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || undefined,
          subject:   campaign.subject,
          html,
          text:      campaign.text_body ?? '',
          fromName:  campaign.from_name,
          fromEmail: campaign.from_email,
          replyTo:   campaign.reply_to ?? undefined,
          headers:   { 'List-Unsubscribe': `<${unsub}>` },
        });

        if (result.success) {
          sentCount++;
          sentToday++;
          await db.from('send_logs').update({
            status: 'sent', message_id: result.messageId ?? null, sent_at: new Date().toISOString(),
          }).eq('id', log.id);
          await db.from('email_accounts').update({ sent_today: sentToday }).eq('id', account.id);
        } else {
          failCount++;
          await db.from('send_logs').update({
            status: 'failed', error_message: result.error ?? 'Unknown error',
          }).eq('id', log.id);
        }

        // Emit after EVERY email — this keeps the gateway alive
        emit('progress', {
          sent: sentCount, failed: failCount, total,
          pct: Math.round(((sentCount + failCount) / total) * 100),
        });

        await sleep(RATE_DELAY_MS);
      }

      // Finalize
      const finalStatus = sentCount > 0 ? 'sent' : 'failed';
      await db.from('campaigns').update({
        status: finalStatus, sent_at: new Date().toISOString(), sent_count: sentCount,
      }).eq('id', campaign_id);

      emit('done', { success: true, sent: sentCount, failed: failCount, total });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[send/queue]', msg);
      try { await db.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id); } catch {}
      emit('error', { error: msg });
    } finally {
      done();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
