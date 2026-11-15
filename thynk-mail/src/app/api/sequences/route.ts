import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';
import { normaliseSteps, checkOwnership, resolveStartAt } from '@/lib/sequence-scheduler';
import { isValidTimezone, MAX_SEQUENCE_STEPS } from '@/lib/sequence-time';

export async function GET() {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const db = createServerClient();
  const { data, error } = await db.from('sequences').select('*').eq('team_id', guard.ctx.projectId).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** Create a DRAFT sequence with its steps. Launching is a separate action. */
export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });

  const timezone = body.timezone || 'Asia/Kolkata';
  if (!isValidTimezone(timezone)) return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  const start = resolveStartAt(body.start_local, timezone);
  if (!start.ok) return NextResponse.json({ error: start.error }, { status: 400 });

  const steps = normaliseSteps(body.steps);
  if (steps.length > MAX_SEQUENCE_STEPS) return NextResponse.json({ error: `At most ${MAX_SEQUENCE_STEPS} emails per sequence` }, { status: 400 });
  const list_ids: string[] = Array.isArray(body.list_ids) ? body.list_ids : [];
  const account_ids: string[] = Array.isArray(body.account_ids) ? body.account_ids : [];

  const owned = await checkOwnership(projectId, list_ids, account_ids, steps.map(s => s.template_id).filter(Boolean) as string[]);
  if (owned) return NextResponse.json({ error: owned }, { status: 403 });

  const db = createServerClient();
  const { data: seq, error } = await db.from('sequences').insert({
    team_id: projectId, name: body.name.trim(), description: body.description || null,
    list_ids, account_ids, reply_to: body.reply_to || null, timezone, start_at: start.value,
  }).select().single();
  if (error || !seq) return NextResponse.json({ error: error?.message ?? 'Failed to create sequence' }, { status: 500 });

  if (steps.length) {
    const { error: sErr } = await db.from('sequence_steps').insert(steps.map((s, i) => ({ ...s, sequence_id: seq.id, step_number: i + 1 })));
    if (sErr) {
      await db.from('sequences').delete().eq('id', seq.id);
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }
  }
  return NextResponse.json(seq, { status: 201 });
}
