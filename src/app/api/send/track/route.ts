import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const event = searchParams.get('event');
  const url = searchParams.get('url');

  if (!id || !event) {
    return new NextResponse(PIXEL, {
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  }

  const db = createServerClient();

  if (event === 'open') {
    // Update send_log opened_at (only first open)
    await db
      .from('send_logs')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', id)
      .is('opened_at', null);

    // Increment campaign open count
    const { data: log } = await db
      .from('send_logs')
      .select('campaign_id')
      .eq('id', id)
      .single();

    if (log?.campaign_id) {
      try {
        await db.rpc('increment_campaign_opens', { cid: log.campaign_id });
      } catch (_) { /* best-effort */ }
    }

    // Log event
    await db.from('events').insert({
      send_log_id: id,
      type: 'open',
      ip_address: req.headers.get('x-forwarded-for') ?? '',
      user_agent: req.headers.get('user-agent') ?? '',
    });

    return new NextResponse(PIXEL, {
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  }

  if (event === 'click' && url) {
    const decodedUrl = decodeURIComponent(url);

    // Update send_log clicked_at (only first click)
    await db
      .from('send_logs')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', id)
      .is('clicked_at', null);

    // Increment campaign click count
    const { data: log } = await db
      .from('send_logs')
      .select('campaign_id')
      .eq('id', id)
      .single();

    if (log?.campaign_id) {
      try {
        await db.rpc('increment_campaign_clicks', { cid: log.campaign_id });
      } catch (_) { /* best-effort */ }
    }

    // Log event
    await db.from('events').insert({
      send_log_id: id,
      type: 'click',
      metadata: { url: decodedUrl },
      ip_address: req.headers.get('x-forwarded-for') ?? '',
      user_agent: req.headers.get('user-agent') ?? '',
    });

    return NextResponse.redirect(decodedUrl);
  }

  return new NextResponse(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
  });
}
