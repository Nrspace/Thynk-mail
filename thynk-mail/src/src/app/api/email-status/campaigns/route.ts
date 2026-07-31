import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// GET /api/email-status/campaigns?account_ids=id1,id2
// Returns distinct campaigns that have send_logs for the given account IDs
export async function GET(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const accountIdsParam = searchParams.get('account_ids');
  const requestedAccountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];

  // Only ever look at this project's own accounts.
  const { data: teamAccounts } = await db.from('email_accounts').select('id').eq('team_id', projectId);
  const teamAccountIds = (teamAccounts ?? []).map(a => a.id);
  const accountIds = requestedAccountIds.length > 0
    ? requestedAccountIds.filter(id => teamAccountIds.includes(id))
    : teamAccountIds;

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
    .eq('team_id', projectId)
    .in('id', campaignIds)
    .order('created_at', { ascending: false });

  return NextResponse.json({ campaigns: campaigns ?? [] });
}
