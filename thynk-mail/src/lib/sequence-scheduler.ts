import { createServerClient } from '@/lib/supabase';
import {
  computeSchedule, isValidTimezone, parseSendTime, wallInputToUtc,
  MAX_SEQUENCE_STEPS, MIN_SEQUENCE_STEPS,
} from '@/lib/sequence-time';

/**
 * Email sequences: an ordered set of steps that are sent automatically on a
 * schedule. On launch every step becomes a normal row in `campaigns` (with
 * sequence_id / sequence_step set), so the existing send engine
 * (campaign-sender.ts) does the actual sending, tracking and unsubscribe
 * handling. This file only decides WHEN each step starts:
 *
 *   - launchSequence()   creates the step campaigns + computes the schedule
 *   - runSequenceTick()  called by the cron (send-tick): starts steps that
 *                        are due, resumes steps that only hit the daily
 *                        limit, and closes the sequence when every step is done
 *   - pause / resume / cancel  user controls
 */

export const AUDIENCES = ['all', 'not_opened', 'opened', 'not_clicked', 'clicked'] as const;
export type StepAudience = typeof AUDIENCES[number];

export interface StepInput {
  subject: string;
  html_body: string;
  text_body: string | null;
  template_id: string | null;
  delay_amount: number;
  delay_unit: 'hours' | 'days';
  send_time: string | null;
  audience: StepAudience;
}

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

/** Clean raw step objects from a request body into the shape stored in the DB. */
export function normaliseSteps(raw: unknown): StepInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => {
    const unit = r?.delay_unit === 'hours' ? 'hours' : 'days';
    const amount = Math.max(1, Math.min(365, Math.floor(Number(r?.delay_amount) || 1)));
    const st = parseSendTime(r?.send_time);
    return {
      subject: String(r?.subject ?? '').trim(),
      html_body: String(r?.html_body ?? ''),
      text_body: r?.text_body ? String(r.text_body) : null,
      template_id: r?.template_id ? String(r.template_id) : null,
      delay_amount: amount,
      delay_unit: unit,
      send_time: unit === 'days' && st ? `${String(st.hh).padStart(2, '0')}:${String(st.mm).padStart(2, '0')}` : null,
      audience: (AUDIENCES as readonly string[]).includes(r?.audience) ? r.audience : 'all',
    } as StepInput;
  });
}

/** Everything that must be true before a sequence can go live. null = OK. */
export function validateForLaunch(
  seq: { name: string; list_ids: string[]; account_ids: string[]; timezone: string },
  steps: StepInput[]
): string | null {
  if (!seq.name?.trim()) return 'Sequence name is required';
  if (!isValidTimezone(seq.timezone)) return 'Invalid timezone';
  if (!seq.account_ids?.length) return 'Select at least one sending account';
  if (!seq.list_ids?.length) return 'Select at least one recipient list';
  if (steps.length < MIN_SEQUENCE_STEPS) return `A sequence needs at least ${MIN_SEQUENCE_STEPS} emails`;
  if (steps.length > MAX_SEQUENCE_STEPS) return `A sequence can have at most ${MAX_SEQUENCE_STEPS} emails`;
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].subject) return `Email ${i + 1}: subject line is required`;
    if (!steps[i].html_body.trim()) return `Email ${i + 1}: email body is empty`;
  }
  return null;
}

/** Start time from a datetime-local string read in the sequence timezone ('' / null = start on launch). */
export function resolveStartAt(startLocal: unknown, tz: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!startLocal) return { ok: true, value: null };
  const d = wallInputToUtc(String(startLocal), tz);
  if (!d || isNaN(d.getTime())) return { ok: false, error: 'Invalid start date/time' };
  return { ok: true, value: d.toISOString() };
}

/** Make sure every list / account / template the request references belongs to this project. */
export async function checkOwnership(
  projectId: string, listIds: string[], accountIds: string[], templateIds: string[]
): Promise<string | null> {
  const db = createServerClient();
  const check = async (table: string, ids: string[], label: string) => {
    if (!ids.length) return null;
    const unique = Array.from(new Set(ids));
    const { data } = await db.from(table).select('id').eq('team_id', projectId).in('id', unique);
    return (data?.length ?? 0) === unique.length ? null : `One or more selected ${label} do not belong to this project`;
  };
  return (await check('lists', listIds, 'lists'))
    ?? (await check('email_accounts', accountIds, 'accounts'))
    ?? (await check('templates', templateIds, 'templates'));
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

export async function launchSequence(projectId: string, sequenceId: string): Promise<Result<{ firstCampaignId: string | null; startsNow: boolean }>> {
  const db = createServerClient();

  const { data: seq } = await db.from('sequences').select('*').eq('id', sequenceId).eq('team_id', projectId).maybeSingle();
  if (!seq) return fail('Sequence not found', 404);
  if (seq.status !== 'draft') return fail(`Only draft sequences can be launched (this one is ${seq.status})`, 409);

  const { data: stepRows } = await db.from('sequence_steps').select('*').eq('sequence_id', sequenceId).order('step_number');
  const steps = stepRows ?? [];
  if (steps.some((s: any) => s.campaign_id)) return fail('This sequence has already been launched', 409);

  const stepInputs = normaliseSteps(steps);
  const invalid = validateForLaunch(seq, stepInputs);
  if (invalid) return fail(invalid);

  const owned = await checkOwnership(projectId, seq.list_ids, seq.account_ids, steps.map((s: any) => s.template_id).filter(Boolean));
  if (owned) return fail(owned, 403);

  const { data: accounts } = await db.from('email_accounts').select('id, name, email, is_active').in('id', seq.account_ids);
  const active = (accounts ?? []).filter((a: any) => a.is_active);
  if (!active.length) return fail('None of the selected sending accounts are active');
  const primary = active.find((a: any) => a.id === seq.account_ids[0]) ?? active[0];

  const now = new Date();
  let start = seq.start_at ? new Date(seq.start_at) : now;
  if (start < now) start = now;
  const startsNow = start.getTime() - now.getTime() < 60_000;
  const times = computeSchedule(start, stepInputs, seq.timezone);

  const created: string[] = [];
  const cleanup = async () => { if (created.length) await db.from('campaigns').delete().in('id', created); };

  let firstId: string | null = null;
  for (let i = 0; i < stepInputs.length; i++) {
    const s = stepInputs[i];
    const n = i + 1;
    const audience = i === 0 ? null : s.audience;
    const { data: c, error }: { data: { id: string } | null; error: { message: string } | null } = await db.from('campaigns').insert({
      team_id: projectId,
      name: `${seq.name} · Email ${n}`,
      subject: s.subject,
      from_name: primary.name || primary.email,
      from_email: primary.email,
      reply_to: seq.reply_to || null,
      html_body: s.html_body,
      text_body: s.text_body,
      template_id: s.template_id,
      account_id: seq.account_ids[0],
      account_ids: seq.account_ids,
      list_ids: seq.list_ids,
      status: i === 0 && startsNow ? 'sending' : 'scheduled',
      scheduled_at: times[i].toISOString(),
      total_recipients: 0,
      sequence_id: sequenceId,
      sequence_step: n,
      // Step 2+: recipients come from step 1 ("everyone") or the previous step (engagement filters)
      audience_campaign_id: i === 0 ? null : (audience === 'all' ? firstId : created[i - 1]),
      audience_condition: audience,
    }).select('id').single();

    if (error || !c) {
      await cleanup();
      return fail(`Failed to create email ${n}: ${error?.message ?? 'unknown error'}`, 500);
    }
    created.push(c.id);
    if (i === 0) firstId = c.id;
  }

  for (let i = 0; i < steps.length; i++) {
    const { error } = await db.from('sequence_steps')
      .update({ campaign_id: created[i], scheduled_at: times[i].toISOString() })
      .eq('id', steps[i].id);
    if (error) {
      await cleanup();
      await db.from('sequence_steps').update({ campaign_id: null, scheduled_at: null }).eq('sequence_id', sequenceId);
      return fail(`Failed to link steps: ${error.message}`, 500);
    }
  }

  await db.from('sequences').update({
    status: 'active', launched_at: now.toISOString(), status_note: null, updated_at: now.toISOString(),
  }).eq('id', sequenceId);

  return { ok: true, firstCampaignId: firstId, startsNow };
}

// ---------------------------------------------------------------------------
// User controls
// ---------------------------------------------------------------------------

export async function pauseSequence(projectId: string, sequenceId: string, note = 'Paused manually'): Promise<Result> {
  const db = createServerClient();
  const { data: seq } = await db.from('sequences').select('id, status').eq('id', sequenceId).eq('team_id', projectId).maybeSingle();
  if (!seq) return fail('Sequence not found', 404);
  if (seq.status !== 'active') return fail('Only an active sequence can be paused', 409);
  await db.from('sequences').update({ status: 'paused', status_note: note, updated_at: new Date().toISOString() }).eq('id', sequenceId);
  await db.from('campaigns').update({ status: 'paused', pause_reason: 'sequence_paused' })
    .eq('sequence_id', sequenceId).eq('status', 'sending');
  return { ok: true };
}

export async function resumeSequence(projectId: string, sequenceId: string): Promise<Result> {
  const db = createServerClient();
  const { data: seq } = await db.from('sequences').select('id, status').eq('id', sequenceId).eq('team_id', projectId).maybeSingle();
  if (!seq) return fail('Sequence not found', 404);
  if (seq.status !== 'paused') return fail('Only a paused sequence can be resumed', 409);
  // Paused or failed steps go back to 'sending' (already-sent contacts are skipped by the engine).
  // Steps that are still waiting for their time stay 'scheduled'; any whose time passed while paused start on the next tick.
  await db.from('campaigns').update({ status: 'sending', pause_reason: null })
    .eq('sequence_id', sequenceId).in('status', ['paused', 'failed']);
  await db.from('sequences').update({ status: 'active', status_note: null, updated_at: new Date().toISOString() }).eq('id', sequenceId);
  return { ok: true };
}

export async function cancelSequence(projectId: string, sequenceId: string): Promise<Result> {
  const db = createServerClient();
  const { data: seq } = await db.from('sequences').select('id, status').eq('id', sequenceId).eq('team_id', projectId).maybeSingle();
  if (!seq) return fail('Sequence not found', 404);
  if (!['active', 'paused'].includes(seq.status)) return fail('Only an active or paused sequence can be cancelled', 409);
  // Steps that never started are removed; anything mid-send is stopped (and can be resumed from the Campaigns page).
  await db.from('campaigns').delete().eq('sequence_id', sequenceId).eq('status', 'scheduled');
  await db.from('campaigns').delete().eq('sequence_id', sequenceId).eq('status', 'sending').eq('sent_count', 0);
  await db.from('campaigns').update({ status: 'paused', pause_reason: 'sequence_cancelled' })
    .eq('sequence_id', sequenceId).eq('status', 'sending');
  await db.from('sequences').update({ status: 'cancelled', status_note: 'Cancelled', updated_at: new Date().toISOString() }).eq('id', sequenceId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scheduler tick (called every minute by /api/cron/send-tick)
// ---------------------------------------------------------------------------

export interface SequenceTickResult {
  activated: number;      // steps started because their time arrived
  resumed: number;        // steps resumed after the daily limit reset
  completed: number;      // sequences finished
  paused: number;         // sequences auto-paused because a step needs attention
}

export async function runSequenceTick(): Promise<SequenceTickResult> {
  const db = createServerClient();
  const out: SequenceTickResult = { activated: 0, resumed: 0, completed: 0, paused: 0 };
  const now = new Date();
  const nowIso = now.toISOString();
  const todayUTC = nowIso.slice(0, 10);

  // A pause can race with a send chunk that was already running and flip the
  // campaign back to 'sending' — re-assert it so paused sequences stay quiet.
  const { data: pausedSeqs } = await db.from('sequences').select('id').in('status', ['paused']);
  if (pausedSeqs?.length) {
    await db.from('campaigns').update({ status: 'paused', pause_reason: 'sequence_paused' })
      .in('sequence_id', pausedSeqs.map((s: any) => s.id)).eq('status', 'sending');
  }

  const { data: seqs, error } = await db.from('sequences').select('id, name').eq('status', 'active');
  if (error) throw new Error(`Failed to load active sequences: ${error.message}`);
  if (!seqs?.length) return out;

  const seqIds = seqs.map((s: any) => s.id);
  const { data: stepRows } = await db.from('sequence_steps')
    .select('sequence_id, step_number, campaign_id').in('sequence_id', seqIds).order('step_number');
  const campaignIds = (stepRows ?? []).map((r: any) => r.campaign_id).filter(Boolean);
  const { data: campRows } = campaignIds.length
    ? await db.from('campaigns').select('id, status, scheduled_at, pause_reason, account_ids, account_id').in('id', campaignIds)
    : { data: [] as any[] };
  const campById = new Map<string, any>((campRows ?? []).map((c: any) => [c.id, c]));

  const pauseSeq = async (id: string, note: string) => {
    await db.from('sequences').update({ status: 'paused', status_note: note, updated_at: nowIso }).eq('id', id).eq('status', 'active');
    out.paused++;
  };

  for (const seq of seqs as any[]) {
    const steps = (stepRows ?? []).filter((r: any) => r.sequence_id === seq.id);
    const camps = steps.map((r: any) => ({ step: r.step_number as number, c: r.campaign_id ? campById.get(r.campaign_id) : undefined }));

    if (!camps.length || camps.some(x => !x.c)) {
      await pauseSeq(seq.id, 'One of the emails in this sequence was deleted. Cancel and recreate the sequence.');
      continue;
    }

    const failed = camps.find(x => x.c.status === 'failed');
    if (failed) { await pauseSeq(seq.id, `Email ${failed.step} failed to send. Check the campaign, then press Resume to retry.`); continue; }

    const stuck = camps.find(x => x.c.status === 'paused' && x.c.pause_reason !== 'daily_limit');
    if (stuck) {
      const why = stuck.c.pause_reason === 'failures' ? 'after repeated send failures' : 'manually';
      await pauseSeq(seq.id, `Email ${stuck.step} was paused ${why}. Press Resume to continue.`);
      continue;
    }

    // Daily sending cap hit mid-step: carry on automatically once any assigned account has capacity again.
    for (const x of camps.filter(x => x.c.status === 'paused' && x.c.pause_reason === 'daily_limit')) {
      const ids: string[] = x.c.account_ids?.length ? x.c.account_ids : x.c.account_id ? [x.c.account_id] : [];
      const { data: accs } = ids.length
        ? await db.from('email_accounts').select('daily_limit, sent_today, last_reset_date, is_active').in('id', ids)
        : { data: [] as any[] };
      const hasCapacity = (accs ?? []).some((a: any) =>
        a.is_active && ((a.last_reset_date ?? '') < todayUTC || (a.sent_today ?? 0) < a.daily_limit));
      if (hasCapacity) {
        const { data: upd } = await db.from('campaigns').update({ status: 'sending', pause_reason: null })
          .eq('id', x.c.id).eq('status', 'paused').select('id');
        if (upd?.length) out.resumed++;
      }
    }

    if (camps.every(x => x.c.status === 'sent')) {
      await db.from('sequences').update({ status: 'completed', completed_at: nowIso, status_note: null, updated_at: nowIso })
        .eq('id', seq.id).eq('status', 'active');
      out.completed++;
      continue;
    }

    // Start the next step once it is due AND every earlier step has fully finished
    // (so its recipient list — "who opened / didn't open" — is final).
    const next = camps.find(x => x.c.status === 'scheduled');
    if (next && next.c.scheduled_at && new Date(next.c.scheduled_at) <= now) {
      const earlierDone = camps.filter(x => x.step < next.step).every(x => x.c.status === 'sent');
      if (earlierDone) {
        // Conditional update = safe even if two ticks overlap: only one can flip it.
        const { data: upd } = await db.from('campaigns').update({ status: 'sending', pause_reason: null })
          .eq('id', next.c.id).eq('status', 'scheduled').select('id');
        if (upd?.length) out.activated++;
      }
    }
  }

  return out;
}
