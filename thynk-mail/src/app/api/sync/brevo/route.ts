export const dynamic = 'force-dynamic';
/**
 * /api/sync/brevo
 * ─────────────────────────────────────────────────────────────────────────
 * Polls Brevo's Transactional Email API to fetch real delivery/open/bounce
 * events and syncs them back into send_logs + campaign counters.
 *
 * Call via POST from Reports page or Accounts page "Sync Brevo Stats" button.
 * Body: { days_back?: number }  (default 7, max 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

function decryptKey(encrypted: string): string {
  try { return Buffer.from(encrypted, 'base64').toString('utf8'); } catch { return encrypted; }
}

// Brevo event → our send_log status
const EVENT_MAP: Record<string, string> = {
  delivered:    'delivered',
  opened:       'opened',
  open:         'opened',   // Brevo uses both forms
  clicks:       'clicked',
  click:        'clicked',  // Brevo uses both forms
  hardBounces:  'bounced',
  hardBounce:   'bounced',
  softBounces:  'bounced',
  softBounce:   'bounced',
  blocked:      'bounced',
  invalid:      'bounced',
  complaint:    'bounced',
  spam:         'bounced',
  unsubscribed: 'unsubscribed',
  unsubscribe:  'unsubscribed',
};

// Status upgrade priority — only move forward, never back
const PRIORITY: Record<string, number> = {
  queued: 0, sent: 1, delivered: 2,
  opened: 3, clicked: 4,
  bounced: 5, unsubscribed: 5, failed: 0,
};
function isUpgrade(current: string, next: string) {
  return (PRIORITY[next] ?? 0) > (PRIORITY[current] ?? 0);
}

interface BrevoEvent {
  messageId?: string;
  event: string;
  email: string;
  date: string;
}

async function fetchBrevoEvents(
  apiKey: string,
  since: Date,
  until: Date
): Promise<BrevoEvent[]> {
  const events: BrevoEvent[] = [];
  let offset = 0;
  const limit = 500;
  const startDate = since.toISOString().slice(0, 10);
  const endDate   = until.toISOString().slice(0, 10);

  while (true) {
    const url = new URL('https://api.brevo.com/v3/smtp/statistics/events');
    url.searchParams.set('limit',     String(limit));
    url.searchParams.set('offset',    String(offset));
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate',   endDate);

    const res = await fetch(url.toString(), {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Brevo API ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const batch: BrevoEvent[] = json.events ?? [];
    events.push(...batch);

    if (batch.length < limit) break;
    offset += limit;
    if (offset > 10_000) break; // safety cap
  }

  return events;
}

export async function POST(req: NextRequest) {
  const db = createServerClient();

  let daysBack = 7;
  try {
    const body = await req.json();
    if (body.days_back) daysBack = Math.min(Number(body.days_back), 30);
  } catch { /* use default */ }

  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - daysBack);

  // Fetch Brevo accounts that have an API key stored
  const { data: accounts, error: aErr } = await db
    .from('email_accounts')
    .select('id, name, api_key_encrypted, provider')
    .eq('team_id', DEMO_TEAM)
    .eq('provider', 'brevo')
    .not('api_key_encrypted', 'is', null);

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      ok: false,
      message:
        'No Brevo accounts with an API key found. ' +
        'Add your Brevo API key in the Accounts page.',
      synced: 0,
    });
  }

  const results: Array<{
    account: string; events: number; updated: number; error?: string;
  }> = [];

  for (const account of accounts) {
    const apiKey = decryptKey(account.api_key_encrypted);

    try {
      const events = await fetchBrevoEvents(apiKey, since, until);

      // Build a map: email → best status seen
      // Brevo messageId != nodemailer messageId, so match by recipient email instead
      const bestByEmail: Record<string, { status: string; date: string }> = {};

      for (const ev of events) {
        if (!ev.email) continue;
        const ourStatus = EVENT_MAP[ev.event];
        if (!ourStatus) continue;

        const email = ev.email.toLowerCase().trim();
        const existing = bestByEmail[email];
        if (!existing || isUpgrade(existing.status, ourStatus)) {
          bestByEmail[email] = { status: ourStatus, date: ev.date };
        }
      }

      const emailList = Object.keys(bestByEmail);
      if (emailList.length === 0) {
        results.push({ account: account.name, events: events.length, updated: 0 });
        continue;
      }

      // Fetch send_logs for this account joined with contact emails
      const { data: logs } = await db
        .from('send_logs')
        .select('id, status, campaign_id, contacts(email)')
        .eq('account_id', account.id)
        .in('status', ['sent', 'delivered', 'opened', 'clicked']);

      let updatedCount = 0;
      const affectedCampaigns = new Set<string>();

      for (const log of (logs ?? [])) {
        const contactEmail = (log.contacts as any)?.email?.toLowerCase().trim();
        if (!contactEmail) continue;

        const match = bestByEmail[contactEmail];
        if (!match) continue;
        if (!isUpgrade(log.status, match.status)) continue;

        // Build extra timestamp fields
        const extra: Record<string, string> = {};
        if (match.status === 'bounced')  extra.bounced_at = match.date;
        if (match.status === 'opened')   extra.opened_at  = match.date;
        if (match.status === 'clicked')  extra.clicked_at = match.date;

        await db
          .from('send_logs')
          .update({ status: match.status, ...extra })
          .eq('id', log.id);

        updatedCount++;
        if (log.campaign_id) affectedCampaigns.add(log.campaign_id);
      }

      // Re-compute campaign open/click/bounce counters for affected campaigns
      for (const cid of affectedCampaigns) {
        const { data: campLogs } = await db
          .from('send_logs')
          .select('status')
          .eq('campaign_id', cid)
          .not('sent_at', 'is', null);

        if (!campLogs) continue;

        const openCount   = campLogs.filter(l => ['opened', 'clicked'].includes(l.status)).length;
        const clickCount  = campLogs.filter(l => l.status === 'clicked').length;
        const bounceCount = campLogs.filter(l => l.status === 'bounced').length;

        await db
          .from('campaigns')
          .update({ open_count: openCount, click_count: clickCount, bounce_count: bounceCount })
          .eq('id', cid);
      }

      results.push({ account: account.name, events: events.length, updated: updatedCount });
    } catch (e: unknown) {
      results.push({
        account: account.name,
        events: 0,
        updated: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  return NextResponse.json({
    ok: true,
    synced: totalUpdated,
    daysBack,
    accounts: results,
  });
}

export { POST as GET };
