import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/session';
import { hashPassword } from '@/lib/auth';

const SAFE_COLUMNS = 'id, project_id, name, email, role, is_active, created_at';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'project_member') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServerClient();
  const { searchParams } = new URL(req.url);
  const requestedProjectId = searchParams.get('project_id');

  let query = db.from('app_users').select(SAFE_COLUMNS).order('created_at', { ascending: false });

  if (user.role === 'super_admin') {
    // Super admin can filter by a specific project, or see everyone.
    if (requestedProjectId) query = query.eq('project_id', requestedProjectId);
  } else {
    // project_admin: locked to their own project, no matter what's requested.
    query = query.eq('project_id', user.project_id!);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'project_member') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const email = body?.email?.toString().toLowerCase().trim();
  const name = body?.name?.toString().trim();
  const password = body?.password?.toString();
  const role = body?.role?.toString();
  let projectId = body?.project_id?.toString() || null;

  if (!email || !name || !password || !role) {
    return NextResponse.json({ error: 'name, email, password and role are required' }, { status: 400 });
  }
  if (!['super_admin', 'project_admin', 'project_member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  if (user.role === 'project_admin') {
    // Project admins can only create users inside their own project, and
    // can never grant super_admin.
    if (role === 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can create super admins' }, { status: 403 });
    }
    projectId = user.project_id;
  }

  if (role !== 'super_admin' && !projectId) {
    return NextResponse.json({ error: 'project_id is required for this role' }, { status: 400 });
  }
  if (role === 'super_admin') projectId = null;

  const db = createServerClient();

  const { data: existing } = await db.from('app_users').select('id').ilike('email', email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
  }

  const password_hash = await hashPassword(password);

  const { data, error } = await db
    .from('app_users')
    .insert({ email, name, password_hash, role, project_id: projectId, is_active: true })
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
