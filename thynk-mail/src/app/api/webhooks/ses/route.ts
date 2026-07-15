import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MessageValidator = require('sns-validator');
const validator = new MessageValidator(); // verifies the message really came from AWS SNS

function validateSnsMessage(message: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(message, (err: Error | null) => (err ? reject(err) : resolve()));
  });
}

type SesEvent = {
  eventType?: string;
  notificationType?: string; // legacy field name used on some SNS payloads
  mail?: { messageId?: string; destination?: string[] };
  bounce?: { bounceType?: string; bounceSubType?: string };
};

/** Apply one parsed SES event to the matching send_logs row + campaign aggregates. */
async function applySesEvent(db: ReturnType<typeof createServerClient>, event: SesEvent) {
  const messageId = event?.mail?.messageId;
  if (!messageId) return;

  const type = event.eventType || event.notificationType;
  const now = new Date().toISOString();

  const { data: log } = await db
    .from('send_logs')
    .select('id, campaign_id, status, opened_at, clicked_at, open_count, click_count')
    .eq('message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (!log) return; // event for a send Thynk-mail didn't originate (or already purged)

  const bumpCampaign = async (field: 'open_count' | 'click_count' | 'bounce_count') => {
    if (!log.campaign_id) return;
    const rpc = field === 'open_count' ? 'increment_campaign_opens'
      : field === 'click_count' ? 'increment_campaign_clicks'
      : null;
    if (rpc) {
      try { await db.rpc(rpc, { cid: log.campaign_id }); return; } catch { /* fall through */ }
    }
    const { data: camp } = await db.from('campaigns').select(field).eq('id', log.campaign_id).single();
    if (camp) {
      await db.from('campaigns').update({ [field]: ((camp as any)[field] ?? 0) + 1 }).eq('id', log.campaign_id);
    }
  };

  switch (type) {
    case 'Send':
      // No-op: send_logs is already marked 'sent' at send time.
      break;

    case 'Delivery':
      if (!['bounced', 'complained', 'opened', 'clicked'].includes(log.status)) {
        await db.from('send_logs').update({ status: 'delivered', delivered_at: now }).eq('id', log.id);
      }
      await db.from('events').insert({ send_log_id: log.id, type: 'delivery', metadata: event });
      break;

    case 'Open':
      await db.from('send_logs').update({
        status: log.status === 'clicked' ? log.status : 'opened',
        opened_at: log.opened_at ?? now,
        open_count: (log.open_count ?? 0) + 1,
      }).eq('id', log.id);
      await db.from('events').insert({ send_log_id: log.id, type: 'open', metadata: event });
      if (!log.opened_at) await bumpCampaign('open_count');
      break;

    case 'Click':
      await db.from('send_logs').update({
        status: 'clicked',
        clicked_at: log.clicked_at ?? now,
        click_count: (log.click_count ?? 0) + 1,
      }).eq('id', log.id);
      await db.from('events').insert({ send_log_id: log.id, type: 'click', metadata: event });
      if (!log.clicked_at) await bumpCampaign('click_count');
      break;

    case 'Bounce': {
      const b = event.bounce || {};
      await db.from('send_logs').update({
        status: 'bounced',
        bounced_at: now,
        bounce_type: b.bounceType || null,
        bounce_subtype: b.bounceSubType || null,
        error_message: `SES bounce: ${b.bounceType || 'Unknown'}${b.bounceSubType ? ' / ' + b.bounceSubType : ''}`,
      }).eq('id', log.id);
      await db.from('events').insert({ send_log_id: log.id, type: 'bounce', metadata: event });
      await bumpCampaign('bounce_count');

      // Hard bounces (Permanent) get suppressed like the existing bounce webhook does.
      if (b.bounceType === 'Permanent') {
        const email = event.mail?.destination?.[0];
        if (email) {
          const { data: contact } = await db.from('contacts').select('id, team_id').eq('email', email).limit(1).maybeSingle();
          if (contact?.team_id) {
            await db.from('suppressions').upsert(
              { team_id: contact.team_id, email, reason: 'bounce' },
              { onConflict: 'team_id,email' }
            );
            await db.from('contacts').update({ is_subscribed: false }).eq('id', contact.id);
          }
        }
      }
      break;
    }

    case 'Complaint': {
      await db.from('send_logs').update({ status: 'complained', complained_at: now }).eq('id', log.id);
      await db.from('events').insert({ send_log_id: log.id, type: 'complaint', metadata: event });

      const email = event.mail?.destination?.[0];
      if (email) {
        const { data: contact } = await db.from('contacts').select('id, team_id').eq('email', email).limit(1).maybeSingle();
        if (contact?.team_id) {
          await db.from('suppressions').upsert(
            { team_id: contact.team_id, email, reason: 'complaint' },
            { onConflict: 'team_id,email' }
          );
          await db.from('contacts').update({ is_subscribed: false }).eq('id', contact.id);
        }
      }
      break;
    }

    case 'Reject':
      await db.from('send_logs').update({
        status: 'failed',
        error_message: 'Rejected by SES before sending',
      }).eq('id', log.id);
      break;

    // DeliveryDelay, Rendering Failure, Subscription: informational, no status change
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/webhooks/ses
// SNS posts with Content-Type "text/plain", so this reads the raw body
// itself rather than relying on Next.js's JSON body parsing.
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text();

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 });
  }

  // Verify this really came from AWS SNS before trusting it
  try {
    await validateSnsMessage(body);
  } catch (err) {
    console.error('[ses-webhook] SNS signature validation failed:', (err as Error).message);
    return new NextResponse('Invalid SNS signature', { status: 400 });
  }

  // One-time handshake: SNS requires the endpoint to fetch SubscribeURL to confirm
  if (body.Type === 'SubscriptionConfirmation') {
    try {
      await fetch(body.SubscribeURL);
      console.log('[ses-webhook] SNS subscription confirmed for topic', body.TopicArn);
    } catch (err) {
      console.error('[ses-webhook] Failed to confirm SNS subscription:', (err as Error).message);
    }
    return new NextResponse('OK', { status: 200 });
  }

  if (body.Type === 'UnsubscribeConfirmation') return new NextResponse('OK', { status: 200 });
  if (body.Type !== 'Notification') return new NextResponse('OK', { status: 200 });

  let event: SesEvent;
  try {
    event = JSON.parse(body.Message);
  } catch {
    return new NextResponse('OK', { status: 200 }); // ack anyway so SNS doesn't retry forever
  }

  const db = createServerClient();
  try {
    await applySesEvent(db, event);
  } catch (err) {
    console.error('[ses-webhook] Failed to apply SES event:', (err as Error).message);
  }

  return new NextResponse('OK', { status: 200 });
}
