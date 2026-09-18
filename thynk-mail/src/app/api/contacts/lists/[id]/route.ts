import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { fetchAllRows, runInChunks, DB_IN_CHUNK_SIZE } from '@/lib/db-paginate';

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const listId = params.id;

  // Make sure this list actually belongs to the active project before
  // touching anything.
  const { data: list } = await db.from('lists').select('id').eq('id', listId).eq('team_id', projectId).maybeSingle();
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

  try {
    // Get all contact IDs in this list. A list with more than 1000 members
    // needs paging (the default 1000-row select cap), otherwise contacts
    // past the first page would never get cleaned up.
    const members = await fetchAllRows<{ contact_id: string }>((from, to) =>
      db.from('contact_lists').select('contact_id').eq('list_id', listId).range(from, to)
    );
    const contactIds = Array.from(new Set(members.map(m => m.contact_id)));

    // Delete contact_list junctions first.
    const { error: junctionErr } = await db.from('contact_lists').delete().eq('list_id', listId);
    if (junctionErr) return NextResponse.json({ error: `Failed to remove list members: ${junctionErr.message}` }, { status: 500 });

    // Delete contacts that belong ONLY to this list (not in any other list).
    // Both the "who else is this contact linked to" lookup and the final
    // delete have to be chunked — with thousands of contact ids in a single
    // .in() call the request URL can exceed the server/proxy limit and fail
    // outright, which silently left the list "deleted" but most of its
    // contacts behind.
    if (contactIds.length > 0) {
      const stillLinked = await runInChunks(contactIds, DB_IN_CHUNK_SIZE, async (chunk) => {
        const { data, error } = await db.from('contact_lists').select('contact_id').in('contact_id', chunk);
        if (error) throw new Error(error.message);
        return data ?? [];
      });
      const stillLinkedIds = new Set(stillLinked.map(r => r.contact_id));
      const toDelete = contactIds.filter(id => !stillLinkedIds.has(id));

      if (toDelete.length > 0) {
        await runInChunks(toDelete, DB_IN_CHUNK_SIZE, async (chunk) => {
          const { error } = await db.from('contacts').delete().in('id', chunk).eq('team_id', projectId);
          if (error) throw new Error(error.message);
          return [];
        });
      }
    }

    // Delete the list itself
    const { error } = await db.from('lists').delete().eq('id', listId).eq('team_id', projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to delete list: ${message}` }, { status: 500 });
  }
}
