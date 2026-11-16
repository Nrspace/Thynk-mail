import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireProjectContext } from '@/lib/api-auth';

interface Params { params: { id: string } }

/**
 * Emails that belong to a LIVE sequence (active or paused) are driven by the
 * sequence scheduler. Their content can still be edited, but their status,
 * schedule and recipients must be managed from the sequence — otherwise e.g.
 * saving one as a draft would silently stall the whole sequence.
 */
async function liveSequenceOf(db: ReturnType<typeof createServerClient>, campaignId: string, projectId: string) {
  const { data: c } = await db.from('campaigns').select('sequence_id').eq('id', campaignId).eq('team_id', projectId).maybeSingle();
  if (!c?.sequence_id) return null;
  const { data: seq } = await db.from('sequences').select('id, status').eq('id', c.sequence_id).maybeSingle();
  return seq && ['active', 'paused'].includes(seq.status) ? seq : null;
}
const SEQUENCE_LOCKED_FIELDS = [
  'status', 'scheduled_at', 'list_ids', 'account_id', 'account_ids',
  'sequence_id', 'sequence_step', 'audience_campaign_id', 'audience_condition', 'pause_reason',
];

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const { data, error } = await db
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .eq('team_id', projectId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  const body = await req.json();
  delete body.team_id; // never allow moving a record between projects

  // Sanitize — convert empty strings to null for nullable fields
  const sanitized = { ...body };
  if (await liveSequenceOf(db, params.id, projectId)) {
    // A bare status change (Pause / Cancel / Resume buttons) must go through the sequence.
    if (body.status && body.subject === undefined && body.html_body === undefined) {
      return NextResponse.json({ error: 'This email belongs to a running sequence. Use Pause / Resume / Cancel on the Sequences page.' }, { status: 409 });
    }
    for (const f of SEQUENCE_LOCKED_FIELDS) delete sanitized[f];
  }
  const nullableFields = ['scheduled_at', 'reply_to', 'template_id', 'text_body'];
  for (const field of nullableFields) {
    if (field in sanitized && sanitized[field] === '') {
      sanitized[field] = null;
    }
  }

  const { data, error } = await db
    .from('campaigns')
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('team_id', projectId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const db = createServerClient();
  if (await liveSequenceOf(db, params.id, projectId)) {
    return NextResponse.json({ error: 'This email belongs to a running sequence. Cancel the sequence first.' }, { status: 409 });
  }
  const { error } = await db.from('campaigns').delete().eq('id', params.id).eq('team_id', projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
