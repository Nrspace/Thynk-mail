import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface Params { params: { id: string } }

// GET /api/campaigns/[id]/errors — returns failed send_logs with error messages
export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const { data, error } = await db
    .from('send_logs')
    .select('id, contact_id, account_id, status, error_message, sent_at, contacts(email, first_name)')
    .eq('campaign_id', params.id)
    .eq('status', 'failed')
    .order('sent_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group errors by message to see patterns
  const errorCounts: Record<string, number> = {};
  for (const row of data ?? []) {
    const msg = row.error_message ?? 'Unknown';
    errorCounts[msg] = (errorCounts[msg] ?? 0) + 1;
  }

  return NextResponse.json({
    total_failed: data?.length ?? 0,
    error_summary: Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([message, count]) => ({ message, count })),
    rows: data,
  });
}
