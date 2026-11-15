import { NextRequest, NextResponse } from 'next/server';
import { requireProjectContext } from '@/lib/api-auth';
import { launchSequence, pauseSequence, resumeSequence, cancelSequence } from '@/lib/sequence-scheduler';

interface Params { params: { id: string } }

/** POST { action: 'launch' | 'pause' | 'resume' | 'cancel' } */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const body = await req.json().catch(() => ({}));
  let result;
  switch (body?.action) {
    case 'launch': result = await launchSequence(projectId, params.id); break;
    case 'pause':  result = await pauseSequence(projectId, params.id); break;
    case 'resume': result = await resumeSequence(projectId, params.id); break;
    case 'cancel': result = await cancelSequence(projectId, params.id); break;
    default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
