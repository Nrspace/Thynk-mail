import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/session';
import { ACTIVE_PROJECT_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can switch projects' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const projectId = body?.project_id;
  if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });

  const db = createServerClient();
  const { data: project } = await db.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const res = NextResponse.json({ success: true });
  res.cookies.set(ACTIVE_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
