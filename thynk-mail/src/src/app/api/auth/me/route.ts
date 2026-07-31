import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCurrentUser, getActiveProjectId } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const db = createServerClient();
  const activeProjectId = await getActiveProjectId(user);

  let activeProject: { id: string; name: string; slug: string } | null = null;
  if (activeProjectId) {
    const { data } = await db.from('projects').select('id, name, slug').eq('id', activeProjectId).maybeSingle();
    activeProject = data ?? null;
  }

  let projects: { id: string; name: string; slug: string }[] = [];
  if (user.role === 'super_admin') {
    const { data } = await db.from('projects').select('id, name, slug').eq('is_active', true).order('name');
    projects = data ?? [];
  }

  return NextResponse.json({
    user,
    activeProject,
    projects, // only populated for super_admin (used by the project switcher)
  });
}
