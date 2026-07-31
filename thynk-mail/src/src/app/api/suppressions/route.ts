import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// The "Unsubscribe list" — every email address that must never receive a
// campaign, whether they got there by clicking unsubscribe, bouncing,
// complaining, or being added manually.
export async function GET(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const reason = searchParams.get('reason'); // optional filter: bounce | unsubscribe | complaint | manual
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)));

  let query = db
    .from('suppressions')
    .select('*', { count: 'exact' })
    .eq('team_id', projectId)
    .order('created_at', { ascending: false });

  if (search) query = query.ilike('email', `%${search}%`);
  if (reason) query = query.eq('reason', reason);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize });
}

// Manually add an email to the unsubscribe list (e.g. someone asked over
// phone/email to be removed rather than clicking the link).
export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const email = (body.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await db
    .from('suppressions')
    .upsert({ team_id: projectId, email, reason: 'manual' }, { onConflict: 'team_id,email' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the contacts table in sync so it's reflected everywhere (contacts
  // list, campaign eligibility) immediately, not just in this list.
  await db.from('contacts').update({ is_subscribed: false }).eq('team_id', projectId).eq('email', email);

  return NextResponse.json(data, { status: 201 });
}
