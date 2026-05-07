export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient();
  const listId = params.id;

  // Get all contact IDs in this list
  const { data: members } = await db
    .from('contact_lists')
    .select('contact_id')
    .eq('list_id', listId);

  const contactIds = (members ?? []).map(m => m.contact_id);

  // Delete contact_list junctions first
  await db.from('contact_lists').delete().eq('list_id', listId);

  // Delete contacts that belong ONLY to this list (not in any other list)
  if (contactIds.length > 0) {
    const { data: stillLinked } = await db
      .from('contact_lists')
      .select('contact_id')
      .in('contact_id', contactIds);

    const stillLinkedIds = new Set((stillLinked ?? []).map(r => r.contact_id));
    const toDelete = contactIds.filter(id => !stillLinkedIds.has(id));

    if (toDelete.length > 0) {
      await db.from('contacts').delete().in('id', toDelete);
    }
  }

  // Delete the list itself
  const { error } = await db.from('lists').delete().eq('id', listId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
