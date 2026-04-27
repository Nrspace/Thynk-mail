import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

import { DEMO_TEAM } from '@/lib/constants';

interface ContactRow {
  email: string;
  first_name?: string;
  last_name?: string;
  [key: string]: string | undefined;
}

export async function POST(req: NextRequest) {
  const db = createServerClient();
  const body = await req.json();
  const { contacts, list_id } = body as { contacts: ContactRow[]; list_id?: string };

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
  }

  // Check suppression list
  const { data: suppressed } = await db
    .from('suppressions')
    .select('email')
    .eq('team_id', DEMO_TEAM)
    .in('email', contacts.map((c) => c.email));

  const suppressedEmails = new Set((suppressed ?? []).map((s) => s.email));
  const valid = contacts.filter((c) => c.email && !suppressedEmails.has(c.email));

  if (valid.length === 0) {
    return NextResponse.json({ imported: 0, skipped: contacts.length });
  }

  // Upsert contacts
  const rows = valid.map(({ email, first_name, last_name, ...rest }) => {
    const metadata: Record<string, string> = {};
    Object.entries(rest).forEach(([k, v]) => { if (v) metadata[k] = v; });
    return { team_id: DEMO_TEAM, email, first_name, last_name, metadata };
  });

  const { data: inserted, error } = await db
    .from('contacts')
    .upsert(rows, { onConflict: 'team_id,email' })
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add to list if specified
  if (list_id && inserted?.length) {
    const junctions = inserted.map((c) => ({ contact_id: c.id, list_id }));
    await db.from('contact_lists').upsert(junctions, { onConflict: 'contact_id,list_id' });
  }

  return NextResponse.json({
    imported: inserted?.length ?? 0,
    skipped: contacts.length - valid.length,
  });
}
