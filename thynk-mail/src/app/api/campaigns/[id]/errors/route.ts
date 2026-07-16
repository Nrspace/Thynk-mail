import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

interface Params { params: { id: string } }

// GET /api/campaigns/[id]/errors — returns failed send_logs with error messages
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();

  // Confirm the campaign belongs to this project before returning any logs.
  const { data: campaign } = await db
    .from('campaigns')
    .select('id')
    .eq('id', params.id)
    .eq('team_id', projectId)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

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
