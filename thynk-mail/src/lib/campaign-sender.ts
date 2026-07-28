import { createServerClient } from '@/lib/supabase';
import { sendEmail, getSesMaxSendRate } from '@/lib/smtp-router';
import { buildFinalHtml } from '@/lib/template-renderer';
import type { EmailAccount, Contact } from '@/types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Safety margin below the account's AWS-reported MaxSendRate so normal
// jitter (a slightly slow SES response, GC pause, etc.) never tips us over
// into throttling. 0.7 keeps real throughput comfortably under the ceiling.
const RATE_SAFETY_MARGIN = 0.7;

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

// Supabase/PostgREST silently caps ANY select at 1000 rows by default
// (db.max_rows) unless you explicitly page through with .range(). This is
// the actual root cause of campaigns finishing early at ~1000 contacts on
// large lists — total_recipients was being set from a truncated result, so
// the campaign correctly reported "fully sent" against the wrong, smaller
// number. This helper pages through in batches of 1000 until a page comes
// back shorter than the page size (i.e. we've reached the end).
const PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message ?? String(error));
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

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

  next(): EmailAccount | null {
    const n = this.accounts.length;
    for (let i = 0; i < n; i++) {
      const acc = this.accounts[(this.idx + i) % n];
      const used = this.sentToday.get(acc.id) ?? 0;
      if (used < acc.daily_limit) {
        this.idx = (this.idx + i + 1) % n;
        return acc;
      }
    }
    return null;
  }

  recordSent(accountId: string) {
    this.sentToday.set(accountId, (this.sentToday.get(accountId) ?? 0) + 1);
  }

  getSentToday(accountId: string) {
    return this.sentToday.get(accountId) ?? 0;
  }

  hasCapacity(accountId: string, dailyLimit: number) {
    return (this.sentToday.get(accountId) ?? 0) < dailyLimit;
  }
}

export type ChunkEmitter = (event: string, data: Record<string, unknown>) => void;

export interface ChunkOutcome {
  ok: boolean;
  /** true once the campaign has nothing left to do this invocation (finished, paused, or failed-out) */
  stopped: boolean;
  reason?: 'done' | 'paused' | 'failed' | 'chunk_budget' | 'error';
  message?: string;
  sent: number;
  failed: number;
  total: number;
}

const BATCH_TIME_BUDGET_MS = 45_000;

/**
 * Processes one time-boxed chunk of a campaign's send (resumable — safe to
 * call repeatedly; already-sent contacts are always skipped). Used by:
 *  - /api/send/queue (SSE route, driven by the browser while a tab is open)
 *  - /api/cron/send-tick (Vercel Cron, keeps campaigns moving even if every
 *    browser tab is closed — this is what actually makes large sends (5k,
 *    10k+ contacts) reliable rather than depending on the send page staying
 *    open in a browser for the entire multi-hour send).
 */
export async function processCampaignChunk(
  campaignId: string,
  teamId: string,
  emit: ChunkEmitter = () => {}
): Promise<ChunkOutcome> {
  const db = createServerClient();
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const fail = async (msg: string): Promise<ChunkOutcome> => {
    await db.from('campaigns').update({ status: 'failed' }).eq('id', campaignId);
    emit('error', { error: msg });
    return { ok: false, stopped: true, reason: 'failed', message: msg, sent: 0, failed: 0, total: 0 };
  };

  const { data: campaign, error: cErr } = await db
    .from('campaigns').select('*').eq('id', campaignId).eq('team_id', teamId).single();
  if (cErr || !campaign) return fail(`Campaign not found: ${cErr?.message ?? 'no data'}`);

  // Nothing to do if it isn't actively sending (draft/paused/done/failed/cancelled)
  if (campaign.status !== 'sending') {
    return { ok: true, stopped: true, reason: 'done', sent: campaign.sent_count ?? 0, failed: 0, total: campaign.total_recipients ?? 0 };
  }

  const rawAccountIds: string[] = Array.isArray(campaign.account_ids) && campaign.account_ids.length
    ? campaign.account_ids
    : campaign.account_id
      ? [campaign.account_id]
      : [];
  if (!rawAccountIds.length) return fail('No sending account(s) assigned to this campaign');

  const { data: accountRows, error: aErr } = await db
    .from('email_accounts').select('*').in('id', rawAccountIds);
  if (aErr || !accountRows?.length) return fail(`Email account(s) not found: ${aErr?.message ?? 'no data'}`);

  const activeAccounts = accountRows.filter((a: any) => a.is_active);
  if (!activeAccounts.length) return fail('All selected email accounts are inactive');

  const todayUTC = new Date().toISOString().slice(0, 10);
  for (const acc of activeAccounts) {
    const lastReset = acc.last_reset_date ?? '';
    if (lastReset < todayUTC) {
      await db.from('email_accounts').update({ sent_today: 0, last_reset_date: todayUTC }).eq('id', acc.id);
      acc.sent_today = 0;
      acc.last_reset_date = todayUTC;
    }
  }

  const rotator = new AccountRotator(activeAccounts as EmailAccount[]);
  emit('status', { status: 'sending', accounts: activeAccounts.length });

  const listIds: string[] = campaign.list_ids ?? [];
  if (!listIds.length) return fail('No recipient lists selected');

  let clRows: { contact_id: string }[];
  try {
    clRows = await fetchAllRows<{ contact_id: string }>((from, to) =>
      db.from('contact_lists').select('contact_id').in('list_id', listIds).range(from, to)
    );
  } catch (err: unknown) {
    return fail(`Failed to load contact lists: ${err instanceof Error ? err.message : String(err)}`);
  }

  const contactIds = Array.from(new Set((clRows ?? []).map((r: any) => r.contact_id)));
  if (!contactIds.length) return fail('No contacts in selected lists');

  const contacts = await runInChunks(contactIds, DB_IN_CHUNK_SIZE, async (chunk) => {
    const { data, error } = await db.from('contacts').select('*').in('id', chunk).eq('is_subscribed', true);
    if (error) throw new Error(`Failed to load contacts: ${error.message}`);
    return data ?? [];
  });

  let suppressed = new Set<string>();
  if (contacts.length > 0 && campaign.team_id) {
    const emails = contacts.map((c: Contact) => c.email);
    const suppressionRows = await runInChunks(emails, DB_IN_CHUNK_SIZE, async (chunk) => {
      const { data, error } = await db.from('suppressions').select('email').eq('team_id', campaign.team_id).in('email', chunk);
      if (error) throw new Error(`Failed to check suppressions: ${error.message}`);
      return data ?? [];
    });
    suppressed = new Set(suppressionRows.map((s: any) => s.email));
  }

  const eligible = contacts.filter((c: Contact) => !suppressed.has(c.email));
  if (!eligible.length) return fail('All contacts are suppressed or unsubscribed');

  await db.from('campaigns').update({ total_recipients: eligible.length }).eq('id', campaignId);

  let existingLogs: { id: string; contact_id: string; status: string }[];
  try {
    existingLogs = await fetchAllRows<{ id: string; contact_id: string; status: string }>((from, to) =>
      db.from('send_logs').select('id, contact_id, status').eq('campaign_id', campaignId).range(from, to)
    );
  } catch (err: unknown) {
    return fail(`Failed to load send logs: ${err instanceof Error ? err.message : String(err)}`);
  }

  const alreadySentIds = new Set(
    (existingLogs ?? []).filter((l: any) => l.status === 'sent').map((l: any) => l.contact_id)
  );
  const existingLogMap = new Map((existingLogs ?? []).map((l: any) => [l.contact_id, l]));

  const needsLog = eligible.filter((c: Contact) => !existingLogMap.has(c.id));
  let logs: any[] = (existingLogs ?? []).filter((l: any) => l.status !== 'sent');
  if (needsLog.length > 0) {
    const logRows = needsLog.map((c: Contact) => ({
      campaign_id: campaignId, contact_id: c.id, account_id: rawAccountIds[0], status: 'queued',
    }));
    const newLogs = await runInChunks(logRows, DB_IN_CHUNK_SIZE, async (chunk) => {
      const { data, error } = await db.from('send_logs').insert(chunk).select('id, contact_id, status');
      if (error) throw new Error(`Failed to create send logs: ${error.message}`);
      return data ?? [];
    });
    logs = [...logs, ...newLogs];
  }

  let sentCount = alreadySentIds.size;
  let failCount = 0;
  const total = eligible.length;

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
        rangeStart: (b - 1) * batchSize + 1, rangeEnd: Math.min(b * batchSize, total), total,
      });
    }
  };

  emit('progress', { sent: sentCount, failed: 0, total, pct: Math.round((sentCount / total) * 100), batch: batchNumberFor(sentCount), totalBatches: numBatches });

  // Look up each account's REAL AWS-enforced send rate once per chunk
  // (cheap — one GetSendQuota call per account, not per email) instead of
  // guessing a flat delay. A single account maxing out at, say, 14/sec
  // means 15k contacts can go out in ~18 minutes of actual sending time
  // instead of the ~1.5 hours the old flat 400ms-per-email delay forced on
  // every account regardless of what it could actually handle.
  const accountRates = new Map<string, number>();
  for (const acc of activeAccounts) {
    accountRates.set(acc.id, await getSesMaxSendRate(acc as EmailAccount));
  }

  // O(1) contact lookup — the old .find() per email was O(n) and would
  // meaningfully slow down right as list size grows into the 15-20k range.
  const eligibleById = new Map(eligible.map((c: Contact) => [c.id, c]));

  const currentTotalRate = () => {
    let total = 0;
    for (const acc of activeAccounts) {
      if (rotator.hasCapacity(acc.id, acc.daily_limit)) total += accountRates.get(acc.id) ?? 5;
    }
    return total;
  };

  let consecutiveFails = 0;
  const batchStart = Date.now();
  let batchStoppedEarly = false;
  const logsArr = logs ?? [];
  let idx = 0;

  while (idx < logsArr.length) {
    if (Date.now() - batchStart > BATCH_TIME_BUDGET_MS) { batchStoppedEarly = true; break; }

    const totalRate = currentTotalRate();
    if (totalRate <= 0) {
      await db.from('campaigns').update({ status: 'paused', sent_count: sentCount }).eq('id', campaignId);
      const message = `Daily sending limit reached. ${total - sentCount - failCount} contacts queued for tomorrow.`;
      emit('done', { success: true, sent: sentCount, failed: failCount, total, paused: true, message });
      return { ok: true, stopped: true, reason: 'paused', message, sent: sentCount, failed: failCount, total };
    }

    // One "wave" = roughly one second's worth of capacity across all active
    // accounts combined, sent concurrently, then paced to ~1/sec so we never
    // run ahead of what SES actually allows. Capped at 25 so a very high-
    // quota account still fires in bounded, easy-to-reason-about batches.
    const waveSize = Math.max(1, Math.min(25, Math.floor(totalRate * RATE_SAFETY_MARGIN)));
    const waveStart = Date.now();

    type Assigned = { log: any; contact: Contact; account: EmailAccount };
    const assigned: Assigned[] = [];
    while (assigned.length < waveSize && idx < logsArr.length) {
      const log = logsArr[idx];
      idx++;
      const contact = eligibleById.get(log.contact_id);
      if (!contact) continue;
      const account = rotator.next();
      if (!account) break; // exhausted mid-wave — handle after this wave settles
      assigned.push({ log, contact, account: account as EmailAccount });
    }

    if (!assigned.length) {
      // Nothing assignable this pass (all remaining logs had no matching
      // contact, or accounts ran out) — re-check exhaustion on next loop tick.
      continue;
    }

    assigned.forEach(({ log }) => announceBatchIfNeeded(sentCount + failCount));

    const sendResults = await Promise.all(assigned.map(async ({ log, contact, account }) => {
      const vars: Record<string, string> = {
        first_name: contact.first_name ?? '', last_name: contact.last_name ?? '', email: contact.email,
        ...(contact.metadata ?? {}),
      };
      const html = buildFinalHtml(campaign.html_body, log.id, APP_URL, vars);
      const unsub = `${APP_URL}/unsubscribe?id=${log.id}`;
      const result = await sendEmail({
        account,
        to: contact.email,
        toName: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || undefined,
        subject: campaign.subject,
        html,
        text: campaign.text_body ?? '',
        fromName: account.name || account.email,
        fromEmail: account.email,
        replyTo: campaign.reply_to ?? undefined,
        headers: { 'List-Unsubscribe': `<${unsub}>` },
      });
      return { log, contact, account, result };
    }));

    // Apply results in dispatch order so consecutive-failure detection and
    // progress events behave the same as the old strictly-sequential loop.
    for (const { log, contact, account, result } of sendResults) {
      if (result.success) {
        sentCount++;
        consecutiveFails = 0;
        rotator.recordSent(account.id);
        const newSentToday = rotator.getSentToday(account.id);
        await db.from('send_logs').update({ status: 'sent', account_id: account.id, message_id: result.messageId ?? null, sent_at: new Date().toISOString() }).eq('id', log.id);
        await db.from('email_accounts').update({ sent_today: newSentToday }).eq('id', account.id);
      } else {
        failCount++;
        consecutiveFails++;
        const errMsg = result.error ?? 'Unknown error';
        await db.from('send_logs').update({ status: 'failed', account_id: account.id, error_message: errMsg }).eq('id', log.id);
        emit('warn', { error: errMsg, to: contact.email });

        if (consecutiveFails >= 5) {
          await db.from('campaigns').update({ status: 'paused', sent_count: sentCount }).eq('id', campaignId);
          const message = `Paused after ${consecutiveFails} consecutive failures. Last error: ${errMsg}`;
          emit('done', { success: false, sent: sentCount, failed: failCount, total, paused: true, message });
          return { ok: false, stopped: true, reason: 'paused', message, sent: sentCount, failed: failCount, total };
        }
      }

      emit('progress', {
        sent: sentCount, failed: failCount, total,
        pct: Math.round(((sentCount + failCount) / total) * 100),
        lastError: result.success ? undefined : result.error,
        batch: batchNumberFor(sentCount + failCount), totalBatches: numBatches,
      });
    }

    // Pace to ~1 wave/sec so combined throughput matches the accounts'
    // real rate limit rather than firing every wave back-to-back.
    const elapsed = Date.now() - waveStart;
    if (elapsed < 1000) await sleep(1000 - elapsed);
  }

  if (batchStoppedEarly) {
    await db.from('campaigns').update({ status: 'sending', sent_count: sentCount }).eq('id', campaignId);
    const message = `Sent ${sentCount} of ${total} so far - continuing...`;
    emit('chunk', { sent: sentCount, failed: failCount, total, pct: Math.round(((sentCount + failCount) / total) * 100), message, batch: batchNumberFor(sentCount + failCount), totalBatches: numBatches });
    return { ok: true, stopped: false, reason: 'chunk_budget', message, sent: sentCount, failed: failCount, total };
  }

  const finalStatus = failCount === total ? 'failed' : 'sent';
  await db.from('campaigns').update({ status: finalStatus, sent_at: new Date().toISOString(), sent_count: sentCount }).eq('id', campaignId);
  emit('done', { success: true, sent: sentCount, failed: failCount, total, totalBatches: numBatches });
  return { ok: true, stopped: true, reason: 'done', sent: sentCount, failed: failCount, total };
}
