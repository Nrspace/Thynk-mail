import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/smtp-router';
import { buildFinalHtml } from '@/lib/template-renderer';
import type { EmailAccount, Contact } from '@/types';

export const maxDuration = 300;

const RATE_DELAY_MS = 1200;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

// ─── Multi-account round-robin router ────────────────────────────────────────
// Picks the next account with remaining daily capacity, cycling through the
// list. Returns null when ALL accounts are exhausted for the day.
class AccountRotator {
  private accounts: EmailAccount[];
  private sentToday: Map<string, number>;
  private idx: number;
  private todayUTC: string;

  constructor(accounts: EmailAccount[]) {
    this.todayUTC = new Date().toISOString().slice(0, 10);
    this.accounts = accounts;
    this.sentToday = new Map(
      accounts.map(a => [
        a.id,
        (a.last_reset_date ?? '') < this.todayUTC ? 0 : (a.sent_today ?? 0),
      ])
    );
    this.idx = 0;
  }

  /** Get next available account, or null if all exhausted */
  next(): EmailAccount | null {
    const n = this.accounts.length;
    for (let i = 0; i < n; i++) {
      const acc = this.accounts[(this.idx + i) % n];
      const used = this.sentToday.get(acc.id) ?? 0;
      if (used < acc.daily_limit) {
        this.idx = (this.idx + i + 1) % n; // advance pointer past this one
        return acc;
      }
    }
    return null; // all exhausted
  }

  /** Record a sent email against an account */
  recordSent(accountId: string) {
    this.sentToday.set(accountId, (this.sentToday.get(accountId) ?? 0) + 1);
  }

  /** Get current sent count for an account */
  getSentToday(accountId: string) {
    return this.sentToday.get(accountId) ?? 0;
  }
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

      // Resolve account IDs — support both new account_ids[] and legacy account_id
      const rawAccountIds: string[] = Array.isArray(campaign.account_ids) && campaign.account_ids.length
        ? campaign.account_ids
        : campaign.account_id
          ? [campaign.account_id]
          : [];

      if (!rawAccountIds.length) return fail('No sending account(s) assigned to this campaign');

      // Load all selected accounts
      const { data: accountRows, error: aErr } = await db
        .from('email_accounts').select('*').in('id', rawAccountIds);
      if (aErr || !accountRows?.length) return fail(`Email account(s) not found: ${aErr?.message ?? 'no data'}`);

      const activeAccounts = accountRows.filter((a: any) => a.is_active);
      if (!activeAccounts.length) return fail('All selected email accounts are inactive');

      // Auto-reset sent_today for accounts where it's a new UTC day
      const todayUTC = new Date().toISOString().slice(0, 10);
      for (const acc of activeAccounts) {
        const lastReset = acc.last_reset_date ?? '';
        if (lastReset < todayUTC) {
          await db.from('email_accounts')
            .update({ sent_today: 0, last_reset_date: todayUTC })
            .eq('id', acc.id);
          acc.sent_today = 0;
          acc.last_reset_date = todayUTC;
        }
      }

      const rotator = new AccountRotator(activeAccounts as EmailAccount[]);

      // Mark sending
      await db.from('campaigns').update({ status: 'sending' }).eq('id', campaign_id);
      emit('status', { status: 'sending', accounts: activeAccounts.length });

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

      // Create send logs (bulk) — account_id will be set per-email during sending
      const logRows = eligible.map((c: Contact) => ({
        campaign_id, contact_id: c.id,
        account_id: rawAccountIds[0], // placeholder, updated per send
        status: 'queued',
      }));
      const { data: logs, error: logsErr } = await db
        .from('send_logs').insert(logRows).select('id, contact_id');
      if (logsErr) return fail(`Failed to create send logs: ${logsErr.message}`);

      await db.from('campaigns').update({ total_recipients: eligible.length }).eq('id', campaign_id);

      // ── Send loop with multi-account rotation ────────────────────────────
      let sentCount = 0;
      let failCount = 0;
      const total = eligible.length;

      for (const log of logs ?? []) {
        const contact = eligible.find((c: Contact) => c.id === log.contact_id);
        if (!contact) continue;

        // Pick next available account
        const account = rotator.next();
        if (!account) {
          // All accounts exhausted
          await db.from('send_logs').update({
            status: 'failed',
            error_message: 'All sending accounts reached daily limit',
          }).eq('id', log.id);
          failCount++;
          emit('progress', {
            sent: sentCount, failed: failCount, total,
            pct: Math.round(((sentCount + failCount) / total) * 100),
          });
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
          rotator.recordSent(account.id);
          const newSentToday = rotator.getSentToday(account.id);
          await db.from('send_logs').update({
            status: 'sent',
            account_id: account.id,
            message_id: result.messageId ?? null,
            sent_at: new Date().toISOString(),
          }).eq('id', log.id);
          // Update account sent_today counter
          await db.from('email_accounts')
            .update({ sent_today: newSentToday })
            .eq('id', account.id);
        } else {
          failCount++;
          await db.from('send_logs').update({
            status: 'failed',
            account_id: account.id,
            error_message: result.error ?? 'Unknown error',
          }).eq('id', log.id);
        }

        emit('progress', {
          sent: sentCount, failed: failCount, total,
          pct: Math.round(((sentCount + failCount) / total) * 100),
        });

        await sleep(RATE_DELAY_MS);
      }

      // Finalize
      const finalStatus = sentCount > 0 ? 'sent' : 'failed';
      await db.from('campaigns').update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        sent_count: sentCount,
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
