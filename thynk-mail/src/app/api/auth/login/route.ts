import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyPassword, createSession, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.toString().toLowerCase().trim();
  const password = body?.password?.toString();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const db = createServerClient();
  const { data: user } = await db
    .from('app_users')
    .select('id, email, name, role, project_id, password_hash, is_active')
    .ilike('email', email)
    .maybeSingle();

  if (!user || !user.is_active) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);

  let projectSlug: string | null = null;
  if (user.project_id) {
    const { data: project } = await db.from('projects').select('slug').eq('id', user.project_id).maybeSingle();
    projectSlug = project?.slug ?? null;
  }

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      project_id: user.project_id,
      project_slug: projectSlug,
    },
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });

  // Non-super-admins are always scoped to their own project — set this so
  // API routes have a consistent place to read the active project from.
  if (user.project_id) {
    res.cookies.set('active_project_id', user.project_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: new Date(expiresAt),
    });
  }

  return res;
}
