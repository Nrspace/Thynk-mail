import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/session';
import { requireSuperAdmin } from '@/lib/api-auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServerClient();

  if (user.role === 'super_admin') {
    const { data, error } = await db.from('projects').select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Project admins/members only ever see their own project.
  if (!user.project_id) return NextResponse.json([]);
  const { data, error } = await db.from('projects').select('*').eq('id', user.project_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const name = body?.name?.toString().trim();
  if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 });

  const slug = body?.slug?.toString().trim() ? slugify(body.slug) : slugify(name);
  if (!slug) return NextResponse.json({ error: 'Could not derive a valid slug from the name' }, { status: 400 });

  const db = createServerClient();
  const { data, error } = await db
    .from('projects')
    .insert({ name, slug, is_active: true, created_by: guard.user.id })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      return NextResponse.json({ error: 'A project with that slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
