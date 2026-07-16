-- ============================================================================
-- Multi-Project Migration
-- Adds: project management, app users, sessions, and roles.
-- Existing "teams" table becomes the "projects" table (same id/rows kept,
-- so every existing team_id column across the schema keeps working as-is).
-- Run this once in the Supabase SQL editor AFTER the original
-- supabase-schema.sql (and any other prior migrations) have been applied.
-- ============================================================================

-- 1. Rename teams -> projects (Postgres keeps all foreign keys intact because
--    they reference the table by OID, not by name, so every existing
--    "team_id" column elsewhere in the schema keeps working unchanged).
ALTER TABLE IF EXISTS teams RENAME TO projects;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID;

-- Backfill a slug for any existing rows that don't have one yet, then
-- enforce uniqueness.
UPDATE projects
SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- 2. Migrate the existing single-tenant data into a named project:
--    "Thynk Success". The original demo/default team id is reused so every
--    row that already points at it (email_accounts, contacts, templates,
--    campaigns, etc.) is automatically now scoped to this project.
INSERT INTO projects (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Thynk Success', 'thynk-success', true)
ON CONFLICT (id) DO UPDATE
  SET name = 'Thynk Success', slug = 'thynk-success', is_active = true;

-- 3. App users (custom auth, not Supabase Auth).
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'project_admin', 'project_member')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- super_admin is global (no project); the other two roles must belong to
  -- exactly one project. This is what keeps projects from overlapping.
  CONSTRAINT app_users_role_project_chk CHECK (
    (role = 'super_admin' AND project_id IS NULL) OR
    (role IN ('project_admin', 'project_member') AND project_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(lower(email));
CREATE INDEX IF NOT EXISTS idx_app_users_project ON app_users(project_id);

-- 4. Sessions (simple opaque-token sessions, stored server-side).
CREATE TABLE IF NOT EXISTS app_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at);

-- ============================================================================
-- NOTE: This migration does NOT create any users. Run the seed script after
-- this migration to create your first Super Admin and the Thynk Success
-- Project Admin:
--
--   npm run seed:user -- --email=you@thynksuccess.com --password=... \
--     --name="Your Name" --role=super_admin
--
--   npm run seed:user -- --email=admin@thynksuccess.com --password=... \
--     --name="Thynk Success Admin" --role=project_admin --project=thynk-success
-- ============================================================================
