import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { DEMO_TEAM } from '@/lib/constants';

export async function GET() {
  const db = createServerClient();
  const hasUrl        = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnonKey    = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasAppUrl     = !!process.env.NEXT_PUBLIC_APP_URL;
  const { data: team,      error: e1 } = await db.from('teams').select('id,name').eq('id', DEMO_TEAM).single();
  const { data: templates, error: e2 } = await db.from('templates').select('id,name').eq('team_id', DEMO_TEAM);
  const { data: campaigns, error: e3 } = await db.from('campaigns').select('id,name').eq('team_id', DEMO_TEAM);
  const { data: contacts,  error: e4 } = await db.from('contacts').select('id,email').eq('team_id', DEMO_TEAM).limit(3);
  const { data: accounts,  error: e5 } = await db.from('email_accounts').select('id,name').eq('team_id', DEMO_TEAM);
  return NextResponse.json({
    env: { hasUrl, hasAnonKey, hasServiceKey, hasAppUrl },
    DEMO_TEAM,
    team:      team      ?? { error: e1?.message },
    templates: templates ?? { error: e2?.message },
    campaigns: campaigns ?? { error: e3?.message },
    contacts:  contacts  ?? { error: e4?.message },
    accounts:  accounts  ?? { error: e5?.message },
  });
}
