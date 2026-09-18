import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// This endpoint didn't exist at all before — the contacts table's per-row
// delete button in the UI had no click handler and there was nowhere for it
// to call even if it had one. contact_lists rows for this contact are
// removed automatically (ON DELETE CASCADE in the schema).

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const contactId = params.id;

  const { data: existing } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('team_id', projectId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const { error } = await db.from('contacts').delete().eq('id', contactId).eq('team_id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const contactId = params.id;
  const body = await req.json();
  const { first_name, last_name, is_subscribed, metadata } = body;

  const update: Record<string, unknown> = {};
  if (first_name !== undefined) update.first_name = first_name;
  if (last_name !== undefined) update.last_name = last_name;
  if (is_subscribed !== undefined) update.is_subscribed = is_subscribed;
  if (metadata !== undefined) update.metadata = metadata;

  const { data, error } = await db
    .from('contacts')
    .update(update)
    .eq('id', contactId)
    .eq('team_id', projectId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
