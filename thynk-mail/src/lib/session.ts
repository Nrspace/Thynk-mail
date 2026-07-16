import { cookies } from 'next/headers';
import { createServerClient } from './supabase';
import { SESSION_COOKIE, ACTIVE_PROJECT_COOKIE } from './auth-constants';

export type Role = 'super_admin' | 'project_admin' | 'project_member';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  project_id: string | null;
}

/**
 * Reads the session cookie, validates it against app_sessions, and returns
 * the current user. Returns null if there's no valid, non-expired session,
 * or if the user has been deactivated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = createServerClient();

  const { data: session } = await db
    .from('app_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  const { data: user } = await db
    .from('app_users')
    .select('id, email, name, role, project_id, is_active')
    .eq('id', session.user_id)
    .maybeSingle();

  if (!user || !user.is_active) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    project_id: user.project_id,
  };
}

/**
 * The project a request should be scoped to.
 * - project_admin / project_member are always locked to their own project;
 *   they can never read or write another project's data, regardless of what
 *   a client sends.
 * - super_admin has no fixed project; they pick one via the project switcher,
 *   which is stored in the active_project_id cookie.
 */
export async function getActiveProjectId(user: SessionUser): Promise<string | null> {
  if (user.role !== 'super_admin') return user.project_id;
  return cookies().get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
}
