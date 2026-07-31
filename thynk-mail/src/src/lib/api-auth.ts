import { NextResponse } from 'next/server';
import { getCurrentUser, getActiveProjectId, SessionUser } from './session';

export interface ProjectContext {
  user: SessionUser;
  projectId: string;
}

export type ProjectContextResult = { ok: true; ctx: ProjectContext } | { ok: false; response: NextResponse };

/**
 * Standard guard for project-scoped API routes. Resolves the current user
 * and the project their request is scoped to. Every data query in a route
 * handler should filter by ctx.projectId (never trust a client-supplied
 * project/team id) so one project's data can never leak into another.
 */
export async function requireProjectContext(): Promise<ProjectContextResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const projectId = await getActiveProjectId(user);
  if (!projectId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No active project selected. Choose a project first.' },
        { status: 400 }
      ),
    };
  }

  return { ok: true, ctx: { user, projectId } };
}

/** Guard for routes that only super_admin may call (project management, cross-project user admin). */
export async function requireSuperAdmin(): Promise<{ ok: true; user: SessionUser } | { ok: false; response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (user.role !== 'super_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user };
}

/** Guard for routes that project_admin (within their project) or super_admin may call. */
export async function requireProjectAdmin(): Promise<ProjectContextResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (user.role !== 'super_admin' && user.role !== 'project_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const projectId = await getActiveProjectId(user);
  if (!projectId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No active project selected. Choose a project first.' },
        { status: 400 }
      ),
    };
  }
  return { ok: true, ctx: { user, projectId } };
}
