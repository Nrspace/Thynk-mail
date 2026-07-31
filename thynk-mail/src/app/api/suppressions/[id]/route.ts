import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

// Removes an entry from the unsubscribe list — i.e. resubscribes them.
// Use with care: this means the address becomes eligible for campaigns
// again. Only meant for correcting a mistaken/accidental suppression.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data: existing, error: fetchErr } = await db
    .from('suppressions').select('email').eq('id', params.id).eq('team_id', projectId).single();
  if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await db.from('suppressions').delete().eq('id', params.id).eq('team_id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('contacts').update({ is_subscribed: true }).eq('team_id', projectId).eq('email', existing.email);

  return NextResponse.json({ ok: true });
}
