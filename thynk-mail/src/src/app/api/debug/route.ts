import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// Diagnostic endpoint — requires a logged-in user with an active project,
// and only ever shows that project's own data.
export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const hasUrl        = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnonKey    = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAppUrl     = !!process.env.NEXT_PUBLIC_APP_URL;
  const { data: project,   error: e1 } = await db.from('projects').select('id,name').eq('id', projectId).single();
  const { data: templates, error: e2 } = await db.from('templates').select('id,name').eq('team_id', projectId);
  const { data: campaigns, error: e3 } = await db.from('campaigns').select('id,name').eq('team_id', projectId);
  const { data: contacts,  error: e4 } = await db.from('contacts').select('id,email').eq('team_id', projectId).limit(3);
  const { data: accounts,  error: e5 } = await db.from('email_accounts').select('id,name').eq('team_id', projectId);
  return NextResponse.json({
    env: { hasUrl, hasAnonKey, hasServiceKey, hasAppUrl },
    projectId,
    project:   project   ?? { error: e1?.message },
    templates: templates ?? { error: e2?.message },
    campaigns: campaigns ?? { error: e3?.message },
    contacts:  contacts  ?? { error: e4?.message },
    accounts:  accounts  ?? { error: e5?.message },
  });
}
