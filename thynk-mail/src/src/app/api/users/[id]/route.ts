import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/session';
import { hashPassword } from '@/lib/auth';

interface Params { params: { id: string } }

const SAFE_COLUMNS = 'id, project_id, name, email, role, is_active, created_at';

async function canManage(actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, targetId: string) {
  const db = createServerClient();
  const { data: target } = await db.from('app_users').select('id, project_id, role').eq('id', targetId).maybeSingle();
  if (!target) return { allowed: false as const, target: null };

  if (actor.role === 'super_admin') return { allowed: true as const, target };
  if (actor.role === 'project_admin') {
    // Can only manage users within their own project, and can't touch super admins.
    if (target.project_id !== actor.project_id || target.role === 'super_admin') {
      return { allowed: false as const, target };
    }
    return { allowed: true as const, target };
  }
  return { allowed: false as const, target };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'project_member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await canManage(user, params.id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.is_active === 'boolean') updates.is_active = body.is_active;
  if (typeof body?.role === 'string') {
    if (body.role === 'super_admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can grant super_admin' }, { status: 403 });
    }
    updates.role = body.role;
  }
  if (typeof body?.password === 'string' && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    updates.password_hash = await hashPassword(body.password);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const db = createServerClient();
  const { data, error } = await db
    .from('app_users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'project_member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await canManage(user, params.id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (params.id === user.id) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  const db = createServerClient();
  // Soft-deactivate rather than hard-delete, so audit history / created_by
  // references stay intact.
  const { error } = await db.from('app_users').update({ is_active: false }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
