import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email')?.trim().toLowerCase();
  const campaignId = searchParams.get('campaign_id');
  const status = searchParams.get('status');
  const accountIdsParam = searchParams.get('account_ids');
  const requestedAccountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  // Build send_logs query
  let query = db
    .from('send_logs')
    .select(`
      id, status, message_id, sent_at, opened_at, clicked_at, bounced_at, error_message, created_at,
      contact_id,
      campaign_id,
      account_id
    `, { count: 'exact' });

  // Always resolve this project's own accounts first, then (if the caller
  // asked for specific accounts) intersect with that set — this way a
  // request can never read another project's send logs by passing
  // someone else's account id.
  const { data: teamAccounts } = await db
    .from('email_accounts')
    .select('id')
    .eq('team_id', projectId);
  const teamAccountIds = (teamAccounts ?? []).map(a => a.id);

  const accountIds = requestedAccountIds.length > 0
    ? requestedAccountIds.filter(id => teamAccountIds.includes(id))
    : teamAccountIds;

  if (accountIds.length > 0) {
    query = query.in('account_id', accountIds);
  } else {
    return NextResponse.json({ logs: [], total: 0 });
  }

  // Filter by email (search contacts first)
  if (email) {
    const { data: contacts } = await db
      .from('contacts')
      .select('id')
      .eq('team_id', projectId)
      .ilike('email', `%${email}%`)
      .limit(100);
    const contactIds = (contacts ?? []).map(c => c.id);
    if (contactIds.length === 0) {
      return NextResponse.json({ logs: [], total: 0 });
    }
    query = query.in('contact_id', contactIds);
  }

  if (campaignId) query = query.eq('campaign_id', campaignId);
  if (status) query = query.eq('status', status);

  // summary_only=1: return just the status counts for the full result set (no pagination)
  const summaryOnly = searchParams.get('summary_only') === '1';
  if (summaryOnly) {
    const { data: allStatuses } = await query.select('status');
    const summary: Record<string, number> = {};
    for (const row of (allStatuses ?? [])) {
      summary[row.status] = (summary[row.status] ?? 0) + 1;
    }
    return NextResponse.json({ summary });
  }

  const { data: logs, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!logs || logs.length === 0) {
    return NextResponse.json({ logs: [], total: count ?? 0 });
  }

  // Hydrate contacts, campaigns, accounts
  const uniqueContactIds = [...new Set(logs.map(l => l.contact_id).filter(Boolean))];
  const uniqueCampaignIds = [...new Set(logs.map(l => l.campaign_id).filter(Boolean))];
  const uniqueAccountIds  = [...new Set(logs.map(l => l.account_id).filter(Boolean))];

  const [{ data: contacts }, { data: campaigns }, { data: accounts }] = await Promise.all([
    db.from('contacts').select('id, email, first_name, last_name').in('id', uniqueContactIds),
    db.from('campaigns').select('id, name, subject').in('id', uniqueCampaignIds),
    db.from('email_accounts').select('id, name, email, provider').in('id', uniqueAccountIds),
  ]);

  const contactMap = Object.fromEntries((contacts ?? []).map(c => [c.id, c]));
  const campaignMap = Object.fromEntries((campaigns ?? []).map(c => [c.id, c]));
  const accountMap  = Object.fromEntries((accounts ?? []).map(a => [a.id, a]));

  const enriched = logs.map(l => ({
    ...l,
    contact:  contactMap[l.contact_id]  ?? null,
    campaign: campaignMap[l.campaign_id] ?? null,
    account:  accountMap[l.account_id]   ?? null,
  }));

  return NextResponse.json({ logs: enriched, total: count ?? 0 });
}
