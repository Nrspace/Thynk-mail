import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { fetchAllRows, runInChunks, DB_IN_CHUNK_SIZE } from '@/lib/db-paginate';

export async function GET(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const list_id = searchParams.get('list_id');
  const search = searchParams.get('search');

  // Supabase/PostgREST silently caps any select at 1000 rows (db.max_rows)
  // unless you page through with .range(). With many thousands of contacts
  // that meant this endpoint always returned exactly 1000 rows — which is
  // why "All Contacts" showed a count stuck at 1000 no matter how many were
  // actually uploaded. fetchAllRows below pages through until it has
  // everything.
  let contactIdFilter: string[] | null = null;

  if (list_id) {
    // The join table can also have more than 1000 rows for a single list,
    // so this has to be paged too — otherwise only the first 1000 members
    // of a large list would ever be resolved, which is why selecting a
    // list would show an incomplete (or, for lists that happened to sort
    // past the first 1000 contact_lists rows, completely empty) result.
    let clRows: { contact_id: string }[];
    try {
      clRows = await fetchAllRows<{ contact_id: string }>((from, to) =>
        db.from('contact_lists').select('contact_id').eq('list_id', list_id).range(from, to)
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Failed to load list members: ${message}` }, { status: 500 });
    }
    contactIdFilter = Array.from(new Set(clRows.map((r) => r.contact_id)));
    if (contactIdFilter.length === 0) return NextResponse.json({ data: [] });
  }

  try {
    let data: any[];
    if (contactIdFilter) {
      // Chunk the id list too — with thousands of ids in a single list,
      // .in('id', ids) can build a URL long enough to be rejected outright.
      data = await runInChunks(contactIdFilter, DB_IN_CHUNK_SIZE, async (chunk) => {
        let q = db.from('contacts').select('*').eq('team_id', projectId).in('id', chunk);
        if (search) {
          q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        }
        const { data: rows, error } = await q;
        if (error) throw new Error(error.message);
        return rows ?? [];
      });
      data.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } else {
      data = await fetchAllRows<any>((from, to) => {
        let q = db.from('contacts').select('*').eq('team_id', projectId).order('created_at', { ascending: false });
        if (search) {
          q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        }
        return q.range(from, to);
      });
    }
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  const { email, first_name, last_name, metadata } = body;

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const { data, error } = await db
    .from('contacts')
    .upsert(
      { team_id: projectId, email, first_name, last_name, metadata: metadata ?? {} },
      { onConflict: 'team_id,email' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
