import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// GET /api/email-status/campaigns
// Returns ALL of this team's campaigns — same source of truth as the
// Dashboard and Campaigns pages (campaigns table, team_id scoped).
//
// Previously this derived the list from send_logs for the currently
// selected account(s), which meant: (a) campaigns sent through a
// different account than the one selected never appeared, and (b) with
// no account selected — the default "All connected accounts" state —
// the list was cleared to empty entirely. Neither matched what the
// Dashboard/Campaigns pages show, which is every campaign for the team
// regardless of account.
export async function GET(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();

  const { data: campaigns, error } = await db
    .from('campaigns')
    .select('id, name, subject')
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: campaigns ?? [] });
}
