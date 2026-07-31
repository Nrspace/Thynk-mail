// Plain constants only — no Node.js APIs (bcryptjs, crypto) — so this file
// is safe to import from Edge Runtime code such as middleware.ts.
export const SESSION_COOKIE = 'mf_session';
export const ACTIVE_PROJECT_COOKIE = 'active_project_id';
