export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Vercel Cron: resets sent_today=0 for all accounts each UTC midnight.
// Add to vercel.json "crons": [{ "path": "/api/cron/reset-daily", "schedule": "0 0 * * *" }]
// Optionally set CRON_SECRET env var for protection.

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const todayUTC = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from('email_accounts')
    .update({ sent_today: 0, last_reset_date: todayUTC })
    .lt('last_reset_date', todayUTC)
    .select('id, name');

  if (error) {
    console.error('[cron/reset-daily]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[cron/reset-daily] Reset', data?.length ?? 0, 'accounts on', todayUTC);
  return NextResponse.json({ reset: data?.length ?? 0, date: todayUTC });
}
