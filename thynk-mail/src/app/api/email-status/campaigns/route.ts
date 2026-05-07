import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

// GET /api/email-status/campaigns?account_ids=id1,id2
// Returns distinct campaigns that have send_logs for the given account IDs
export async function GET(req: NextRequest) {
  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const accountIdsParam = searchParams.get('account_ids');
  const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];

  if (accountIds.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  // Get distinct campaign_ids from send_logs for these accounts
  const { data: logRows } = await db
    .from('send_logs')
    .select('campaign_id')
    .in('account_id', accountIds)
    .not('campaign_id', 'is', null);

  const campaignIds = [...new Set((logRows ?? []).map((l: any) => l.campaign_id).filter(Boolean))];

  if (campaignIds.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  const { data: campaigns } = await db
    .from('campaigns')
    .select('id, name, subject')
    .eq('team_id', DEMO_TEAM)
    .in('id', campaignIds)
    .order('created_at', { ascending: false });

  return NextResponse.json({ campaigns: campaigns ?? [] });
}
