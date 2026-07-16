import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const {
    name, subject, from_name, from_email, reply_to,
    html_body, text_body, template_id,
    account_id,   // legacy single account (kept for backwards compat)
    account_ids,  // new: array of account IDs
    list_ids, status, scheduled_at,
  } = body;

  if (!name || !subject) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Normalise account_ids — support both single and multi
  const resolvedAccountIds: string[] = Array.isArray(account_ids) && account_ids.length
    ? account_ids
    : account_id ? [account_id] : [];

  // Make sure every referenced account and list actually belongs to this
  // project — prevents one project's campaign from ever touching another
  // project's sending accounts or contact lists.
  if (resolvedAccountIds.length > 0) {
    const { data: ownedAccounts } = await db
      .from('email_accounts')
      .select('id')
      .eq('team_id', projectId)
      .in('id', resolvedAccountIds);
    const ownedIds = new Set((ownedAccounts ?? []).map(a => a.id));
    if (resolvedAccountIds.some(id => !ownedIds.has(id))) {
      return NextResponse.json({ error: 'One or more selected accounts do not belong to this project' }, { status: 403 });
    }
  }
  if (Array.isArray(list_ids) && list_ids.length > 0) {
    const { data: ownedLists } = await db
      .from('lists')
      .select('id')
      .eq('team_id', projectId)
      .in('id', list_ids);
    const ownedIds = new Set((ownedLists ?? []).map(l => l.id));
    if (list_ids.some((id: string) => !ownedIds.has(id))) {
      return NextResponse.json({ error: 'One or more selected lists do not belong to this project' }, { status: 403 });
    }
  }
  if (template_id) {
    const { data: ownedTemplate } = await db
      .from('templates')
      .select('id')
      .eq('team_id', projectId)
      .eq('id', template_id)
      .maybeSingle();
    if (!ownedTemplate) {
      return NextResponse.json({ error: 'Selected template does not belong to this project' }, { status: 403 });
    }
  }

  // primary account_id = first in list (for backwards compat with single-account queries)
  const primaryAccountId = resolvedAccountIds[0] ?? null;

  // Count total recipients from selected lists
  let total_recipients = 0;
  if (list_ids?.length > 0) {
    const { count } = await db
      .from('contact_lists')
      .select('*', { count: 'exact', head: true })
      .in('list_id', list_ids);
    total_recipients = count ?? 0;
  }

  const { data, error } = await db
    .from('campaigns')
    .insert({
      team_id: projectId,
      name, subject, from_name, from_email,
      reply_to:     reply_to     || null,
      html_body:    html_body    || '',
      text_body:    text_body    || null,
      template_id:  template_id  || null,
      account_id:   primaryAccountId,
      account_ids:  resolvedAccountIds,
      list_ids:     list_ids     || [],
      status:       status       || 'draft',
      scheduled_at: scheduled_at || null,
      total_recipients,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
