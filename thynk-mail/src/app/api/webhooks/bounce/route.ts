export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { type, email, message_id } = body as { type: string; email: string; message_id?: string };

  if (!type || !email) {
    return NextResponse.json({ error: 'type and email required' }, { status: 400 });
  }

  if (type === 'bounce' || type === 'complaint') {
    if (message_id) {
      const { data: log } = await db
        .from('send_logs')
        .select('id, campaign_id')
        .eq('message_id', message_id)
        .limit(1)
        .maybeSingle();

      if (log) {
        await db.from('send_logs').update({
          status: 'bounced',
          bounced_at: new Date().toISOString(),
        }).eq('id', log.id);

        await db.from('events').insert({
          send_log_id: log.id,
          type: type === 'complaint' ? 'complaint' : 'bounce',
          metadata: body,
        });

        if (log.campaign_id) {
          const { data: camp } = await db
            .from('campaigns').select('bounce_count').eq('id', log.campaign_id).single();
          if (camp) {
            await db.from('campaigns')
              .update({ bounce_count: (camp.bounce_count ?? 0) + 1 })
              .eq('id', log.campaign_id);
          }
        }
      }
    }

    const { data: contact } = await db
      .from('contacts').select('id, team_id').eq('email', email).limit(1).maybeSingle();

    if (contact?.team_id) {
      await db.from('suppressions').upsert(
        { team_id: contact.team_id, email, reason: type === 'complaint' ? 'complaint' : 'bounce' },
        { onConflict: 'team_id,email' }
      );
      await db.from('contacts').update({ is_subscribed: false }).eq('id', contact.id);
    }
  }

  return NextResponse.json({ ok: true });
}
