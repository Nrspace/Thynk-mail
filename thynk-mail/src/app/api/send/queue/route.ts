import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/smtp-router';
import { buildFinalHtml } from '@/lib/template-renderer';
import { requireProjectContext } from '@/lib/api-auth';
import type { EmailAccount, Contact } from '@/types';

export const maxDuration = 300;

const RATE_DELAY_MS = 400; // 400ms × 185 contacts = 74s of delays; leaves plenty of room for SMTP time
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Supabase/PostgREST sends .in(column, values) as a query string, e.g.
// ?id=in.(uuid1,uuid2,...). At 10,000+ contacts that URL can exceed the
// server/proxy URL-length limit and the request fails outright before any
// email is sent. Running the same query in chunks avoids that ceiling
// entirely, at the cost of a few extra sequential round trips.
const DB_IN_CHUNK_SIZE = 300;
async function runInChunks<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await fn(chunk)));
  }
  return results;
}

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
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

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
      // Load campaign — scoped to this project so a campaign id from
      // another project can never be triggered here.
      const { data: campaign, error: cErr } = await db
        .from('campaigns').select('*').eq('id', campaign_id).eq('team_id', projectId).single();
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

      const contacts = await runInChunks(contactIds, DB_IN_CHUNK_SIZE, async (chunk) => {
        const { data, error } = await db
          .from('contacts').select('*').in('id', chunk).eq('is_subscribed', true);
        if (error) throw new Error(`Failed to load contacts: ${error.message}`);
        return data ?? [];
      });

      // Filter suppressions
      let suppressed = new Set<string>();
      if (contacts.length > 0 && campaign.team_id) {
        const emails = contacts.map((c: Contact) => c.email);
        const suppressionRows = await runInChunks(emails, DB_IN_CHUNK_SIZE, async (chunk) => {
          const { data, error } = await db.from('suppressions').select('email')
            .eq('team_id', campaign.team_id).in('email', chunk);
          if (error) throw new Error(`Failed to check suppressions: ${error.message}`);
          return data ?? [];
        });
        suppressed = new Set(suppressionRows.map((s: any) => s.email));
      }

      const eligible = contacts.filter((c: Contact) => !suppressed.has(c.email));
      if (!eligible.length) return fail('All contacts are suppressed or unsubscribed');

      await db.from('campaigns').update({ total_recipients: eligible.length }).eq('id', campaign_id);

      // Load existing logs — skip already-sent contacts (safe resume/retry, no duplicates)
      const { data: existingLogs } = await db
        .from('send_logs')
        .select('id, contact_id, status')
        .eq('campaign_id', campaign_id);

      const alreadySentIds = new Set(
        (existingLogs ?? [])
          .filter((l: any) => l.status === 'sent')
          .map((l: any) => l.contact_id)
      );
      const existingLogMap = new Map(
        (existingLogs ?? []).map((l: any) => [l.contact_id, l])
      );

      // Only create logs for contacts that don't have one yet
      const needsLog = eligible.filter((c: Contact) => !existingLogMap.has(c.id));
      let logs: any[] = (existingLogs ?? []).filter((l: any) => l.status !== 'sent');
      if (needsLog.length > 0) {
        const logRows = needsLog.map((c: Contact) => ({
          campaign_id, contact_id: c.id,
          account_id: rawAccountIds[0],
          status: 'queued',
        }));
        // Insert in chunks too — a single 10,000-row insert risks hitting
        // Supabase's request-size/timeout limits.
        const newLogs = await runInChunks(logRows, DB_IN_CHUNK_SIZE, async (chunk) => {
          const { data, error } = await db.from('send_logs').insert(chunk).select('id, contact_id, status');
          if (error) throw new Error(`Failed to create send logs: ${error.message}`);
          return data ?? [];
        });
        logs = [...logs, ...newLogs];
      }

      // Resume support: start sentCount from already-sent emails
      let sentCount = alreadySentIds.size;
      let failCount = 0;
      const total = eligible.length;

      // Large-list batch labeling — purely organizational/reporting, not a
      // change in pacing. For 5,000+ contacts we group the send into 2
      // (5k–9,999) or 3 (10,000+) named batches so progress reads as
      // "Batch 2 of 3" instead of one long undifferentiated number. Batches
      // run automatically back-to-back with no pause between them; the
      // existing 45s time-budget chunk/continue mechanism below (renamed to
      // the 'chunk' event to avoid confusion with these named batches)
      // still keeps each Vercel invocation safely under the execution-time
      // limit regardless of batch size.
      const numBatches = total >= 10000 ? 3 : total >= 5000 ? 2 : 1;
      const batchSize = Math.ceil(total / numBatches);
      const batchNumberFor = (doneCount: number) => Math.min(numBatches, Math.floor(doneCount / batchSize) + 1);
      let lastAnnouncedBatch = 0;
      const announceBatchIfNeeded = (doneCount: number) => {
        if (numBatches <= 1) return;
        const b = batchNumberFor(doneCount);
        if (b !== lastAnnouncedBatch) {
          lastAnnouncedBatch = b;
          emit('batch_start', {
            batch: b, totalBatches: numBatches,
            rangeStart: (b - 1) * batchSize + 1,
            rangeEnd: Math.min(b * batchSize, total),
            total,
          });
        }
      };

      emit('progress', {
        sent: sentCount, failed: 0, total, pct: Math.round((sentCount / total) * 100),
        batch: batchNumberFor(sentCount), totalBatches: numBatches,
      });

      // ── Send loop with multi-account rotation ────────────────────────────
      let consecutiveFails = 0;

      // Vercel serverless functions have a hard execution-time ceiling
      // (this route's maxDuration=300s is itself already the max on most
      // plans, and some plans cap even lower). For 1000+ contacts, the
      // combined per-contact delay + real SMTP/SES send time reliably
      // exceeds that limit, which gets this function killed mid-send —
      // that's what was showing up as a failed/stuck campaign. Instead of
      // trying to send everyone in one invocation, we cap how long a single
      // invocation runs and stop cleanly with time to spare; the client
      // then calls this endpoint again to process the next chunk. Because
      // already-sent contacts are skipped on every call (see "Resume
      // support" above), this is always safe to repeat.
      const BATCH_TIME_BUDGET_MS = 45_000;
      const batchStart = Date.now();
      let batchStoppedEarly = false;

      for (const log of logs ?? []) {
        if (Date.now() - batchStart > BATCH_TIME_BUDGET_MS) {
          batchStoppedEarly = true;
          break;
        }
        const contact = eligible.find((c: Contact) => c.id === log.contact_id);
        if (!contact) continue;

        announceBatchIfNeeded(sentCount + failCount);

        // Pick next available account
        const account = rotator.next();
        if (!account) {
          // Daily limits exhausted — pause campaign, remaining contacts stay queued for tomorrow
          await db.from('campaigns').update({
            status: 'paused',
            sent_count: sentCount,
          }).eq('id', campaign_id);
          emit('done', {
            success: true, sent: sentCount, failed: failCount, total,
            paused: true,
            message: `Daily sending limit reached. ${total - sentCount - failCount} contacts queued for tomorrow.`,
          });
          done();
          return;
        }

        const vars: Record<string, string> = {
          first_name: contact.first_name ?? '',
          last_name:  contact.last_name  ?? '',
          email:      contact.email,
          ...(contact.metadata ?? {}),
        };

        const html   = buildFinalHtml(campaign.html_body, log.id, APP_URL, vars);
        const unsub  = `${APP_URL}/unsubscribe?id=${log.id}`;
        // from_name and from_email come from the sending account itself
        // so multi-account sends always use a valid authenticated sender
        const result = await sendEmail({
          account:   account as EmailAccount,
          to:        contact.email,
          toName:    `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || undefined,
          subject:   campaign.subject,
          html,
          text:      campaign.text_body ?? '',
          fromName:  account.name || account.email,
          fromEmail: account.email,
          replyTo:   campaign.reply_to ?? undefined,
          headers:   { 'List-Unsubscribe': `<${unsub}>` },
        });

        if (result.success) {
          sentCount++;
          consecutiveFails = 0;
          rotator.recordSent(account.id);
          const newSentToday = rotator.getSentToday(account.id);
          await db.from('send_logs').update({
            status: 'sent',
            account_id: account.id,
            message_id: result.messageId ?? null,
            sent_at: new Date().toISOString(),
          }).eq('id', log.id);
          await db.from('email_accounts')
            .update({ sent_today: newSentToday })
            .eq('id', account.id);
        } else {
          failCount++;
          consecutiveFails++;
          const errMsg = result.error ?? 'Unknown error';
          await db.from('send_logs').update({
            status: 'failed',
            account_id: account.id,
            error_message: errMsg,
          }).eq('id', log.id);

          // Emit the actual error so the UI shows it
          emit('warn', { error: errMsg, to: contact.email });

          // If 5+ consecutive failures, something is systemically wrong — pause
          if (consecutiveFails >= 5) {
            await db.from('campaigns').update({
              status: 'paused',
              sent_count: sentCount,
            }).eq('id', campaign_id);
            emit('done', {
              success: false, sent: sentCount, failed: failCount, total,
              paused: true,
              message: `Paused after ${consecutiveFails} consecutive failures. Last error: ${errMsg}`,
            });
            done();
            return;
          }
        }

        emit('progress', {
          sent: sentCount, failed: failCount, total,
          pct: Math.round(((sentCount + failCount) / total) * 100),
          lastError: result.success ? undefined : result.error,
          batch: batchNumberFor(sentCount + failCount), totalBatches: numBatches,
        });

        await sleep(RATE_DELAY_MS);
      }

      // Time budget hit with contacts still remaining — stop here, keep the
      // campaign in 'sending' state, and let the client re-invoke this
      // endpoint to process the next chunk. This is a lower-level execution
      // detail, distinct from the named batches above — a single named
      // batch of 2,500 contacts might span several of these 'chunk' stops.
      if (batchStoppedEarly) {
        await db.from('campaigns').update({
          status: 'sending',
          sent_count: sentCount,
        }).eq('id', campaign_id);
        emit('chunk', {
          sent: sentCount, failed: failCount, total,
          pct: Math.round(((sentCount + failCount) / total) * 100),
          message: `Sent ${sentCount} of ${total} so far — continuing…`,
          batch: batchNumberFor(sentCount + failCount), totalBatches: numBatches,
        });
        done();
        return;
      }

      // Finalize
      const finalStatus = failCount === total ? 'failed' : 'sent';
      await db.from('campaigns').update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        sent_count: sentCount,
      }).eq('id', campaign_id);

      emit('done', { success: true, sent: sentCount, failed: failCount, total, totalBatches: numBatches });
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
