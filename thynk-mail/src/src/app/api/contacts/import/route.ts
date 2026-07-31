import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

interface ContactRow {
  email: string;
  first_name?: string;
  last_name?: string;
  [key: string]: string | undefined;
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const { contacts, list_id } = body as { contacts: ContactRow[]; list_id?: string };

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });
  }

  // Check suppression list (case-insensitive — emails are stored lowercase).
  // Chunked because a single .in() with thousands of emails can exceed
  // request/URL size limits — same issue that caused the send-side
  // truncation bug, avoided here the same way.
  const CHUNK_SIZE = 300;
  const normalizedInputEmails = Array.from(new Set(contacts.map((c) => (c.email || '').trim().toLowerCase()).filter(Boolean)));
  const suppressedEmails = new Set<string>();
  for (let i = 0; i < normalizedInputEmails.length; i += CHUNK_SIZE) {
    const chunk = normalizedInputEmails.slice(i, i + CHUNK_SIZE);
    const { data: suppressed, error: suppErr } = await db
      .from('suppressions').select('email').eq('team_id', projectId).in('email', chunk);
    if (suppErr) return NextResponse.json({ error: `Failed to check unsubscribe list: ${suppErr.message}` }, { status: 500 });
    (suppressed ?? []).forEach((s) => suppressedEmails.add(s.email.toLowerCase()));
  }

  const skippedSuppressedEmails = contacts
    .filter((c) => c.email && suppressedEmails.has(c.email.trim().toLowerCase()))
    .map((c) => c.email.trim().toLowerCase());
  const valid = contacts.filter((c) => c.email && !suppressedEmails.has(c.email.trim().toLowerCase()));

  if (valid.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: contacts.length,
      skippedSuppressed: skippedSuppressedEmails.length,
      skippedSuppressedEmails: skippedSuppressedEmails.slice(0, 20), // sample for display, not the full list
      skippedDuplicate: 0,
    });
  }

  // Upsert contacts
  // Postgres throws "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // if the SAME (team_id, email) pair appears more than once within a single
  // upsert batch — which real spreadsheets do all the time (duplicate rows,
  // same person entered twice, different casing, etc). We normalize emails to
  // lowercase and collapse duplicates within this batch before sending it to
  // Postgres; the last occurrence in the file wins for name/metadata fields.
  const rowsByEmail = new Map<string, { team_id: string; email: string; first_name?: string; last_name?: string; metadata: Record<string, string> }>();
  for (const { email, first_name, last_name, ...rest } of valid) {
    const key = email.trim().toLowerCase();
    const metadata: Record<string, string> = {};
    Object.entries(rest).forEach(([k, v]) => { if (v) metadata[k] = v; });
    const existing = rowsByEmail.get(key);
    rowsByEmail.set(key, {
      team_id: projectId,
      email: key,
      first_name: first_name || existing?.first_name,
      last_name: last_name || existing?.last_name,
      metadata: { ...existing?.metadata, ...metadata },
    });
  }
  const rows = Array.from(rowsByEmail.values());
  const duplicatesInFile = valid.length - rows.length;

  const { data: inserted, error } = await db
    .from('contacts')
    .upsert(rows, { onConflict: 'team_id,email' })
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add to list if specified
  if (list_id && inserted?.length) {
    const uniqueContactIds = Array.from(new Set(inserted.map((c) => c.id)));
    const junctions = uniqueContactIds.map((contact_id) => ({ contact_id, list_id }));
    const { error: junctionError } = await db.from('contact_lists').upsert(junctions, { onConflict: 'contact_id,list_id' });
    if (junctionError) return NextResponse.json({ error: junctionError.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: inserted?.length ?? 0,
    skipped: contacts.length - valid.length + duplicatesInFile,
    skippedSuppressed: skippedSuppressedEmails.length,
    skippedSuppressedEmails: skippedSuppressedEmails.slice(0, 20),
    skippedDuplicate: duplicatesInFile,
  });
}
