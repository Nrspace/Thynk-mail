import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';

// One-time setup endpoint: creates the very first super_admin user.
// Protected by SETUP_SECRET (set this in Vercel → Project → Settings →
// Environment Variables) so a random visitor can't call it.
// Refuses to run at all once a super_admin already exists, so it can't be
// used to create extra ones later — use the Users page for that instead.
export async function POST(req: NextRequest) {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json(
      { error: 'SETUP_SECRET is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const secret = body?.secret?.toString();
  const email = body?.email?.toString().toLowerCase().trim();
  const password = body?.password?.toString();
  const name = body?.name?.toString().trim();

  if (secret !== setupSecret) {
    return NextResponse.json({ error: 'Invalid setup secret' }, { status: 401 });
  }
  if (!email || !password || !name) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const db = createServerClient();

  const { count } = await db
    .from('app_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin');

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'A super admin already exists. This setup step can only be used once — log in and use the Users page instead.' },
      { status: 409 }
    );
  }

  const { data: existing } = await db.from('app_users').select('id').ilike('email', email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
  }

  const password_hash = await hashPassword(password);
  const { data: user, error } = await db
    .from('app_users')
    .insert({ email, name, password_hash, role: 'super_admin', project_id: null, is_active: true })
    .select('id, email, name, role')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, user });
}
