import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { normaliseSteps, checkOwnership, resolveStartAt, deleteSequence } from '@/lib/sequence-scheduler';
import { isValidTimezone, MAX_SEQUENCE_STEPS } from '@/lib/sequence-time';

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const db = createServerClient();
  const { data: seq } = await db.from('sequences').select('*').eq('id', params.id).eq('team_id', guard.ctx.projectId).maybeSingle();
  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  const { data: steps } = await db.from('sequence_steps').select('*').eq('sequence_id', seq.id).order('step_number');
  return NextResponse.json({ ...seq, steps: steps ?? [] });
}

/** Edit a DRAFT sequence (details + the full list of steps). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;
  const db = createServerClient();

  const { data: seq } = await db.from('sequences').select('*').eq('id', params.id).eq('team_id', projectId).maybeSingle();
  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  if (seq.status !== 'draft') return NextResponse.json({ error: 'Only draft sequences can be edited. Edit the individual email from the Campaigns page instead.' }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const timezone = body.timezone || seq.timezone;
  if (!isValidTimezone(timezone)) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  const start = resolveStartAt(body.start_local, timezone);
  if (!start.ok) return NextResponse.json({ error: start.error }, { status: 400 });

  const steps = normaliseSteps(body.steps);
  if (steps.length > MAX_SEQUENCE_STEPS) return NextResponse.json({ error: `At most ${MAX_SEQUENCE_STEPS} emails per sequence` }, { status: 400 });
  const list_ids: string[] = Array.isArray(body.list_ids) ? body.list_ids : [];
  const account_ids: string[] = Array.isArray(body.account_ids) ? body.account_ids : [];

  const owned = await checkOwnership(projectId, list_ids, account_ids, steps.map(s => s.template_id).filter(Boolean) as string[]);
  if (owned) return NextResponse.json({ error: owned }, { status: 403 });

  const { data: updated, error } = await db.from('sequences').update({
    name: String(body.name ?? seq.name).trim() || seq.name, description: body.description || null,
    list_ids, account_ids, reply_to: body.reply_to || null, timezone, start_at: start.value,
    updated_at: new Date().toISOString(),
  }).eq('id', seq.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace the step list wholesale (draft only, so nothing references the old rows yet).
  await db.from('sequence_steps').delete().eq('sequence_id', seq.id);
  if (steps.length) {
    const { error: sErr } = await db.from('sequence_steps').insert(steps.map((s, i) => ({ ...s, sequence_id: seq.id, step_number: i + 1 })));
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const result = await deleteSequence(guard.ctx.projectId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
