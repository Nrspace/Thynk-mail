# Multi-Project Setup Guide

MailFlow now supports multiple independent projects (workspaces) instead of
a single hardcoded tenant. Each project has its own email accounts,
contacts, templates, and campaigns — nothing is shared or visible across
projects.

## Roles

| Role            | Scope                | Can do |
|-----------------|-----------------------|--------|
| `super_admin`   | All projects (global) | Create/deactivate projects, switch between them, manage users in any project |
| `project_admin` | One project           | Manage users within their own project, full access to that project's data |
| `project_member`| One project           | Use the app (campaigns, contacts, templates, accounts, reports) within their own project |

A user's project is fixed at creation time and can never be changed to
another project by editing a request — every API route re-derives the
active project from the server-side session, never from client input.

## 1. Run the database migration

In the Supabase SQL editor, run `migration-multi-project.sql` (after the
original `supabase-schema.sql` has already been applied). This:

- Renames the `teams` table to `projects` (existing foreign keys are
  preserved automatically — nothing else needs to change).
- Adds `slug` / `is_active` to `projects`.
- Renames your existing single-tenant data into a project called
  **"Thynk Success"**, reusing the same id so all existing accounts,
  contacts, templates and campaigns are automatically scoped to it.
- Creates `app_users` (custom email/password users, with `role` and
  `project_id`) and `app_sessions` (server-side session tokens) tables.

## 2. Create your first super admin — two options

### Option A: Browser only, no CLI (recommended if you deploy via GitHub + Vercel web UI)

1. In Vercel → your project → **Settings → Environment Variables**, add a new
   variable:
   - `SETUP_SECRET` = any long random string you make up (e.g. a password
     you generate once and keep safe)
2. Redeploy (Vercel → Deployments → redeploy the latest one, so the new env
   var takes effect).
3. Visit `https://your-app.vercel.app/setup` in your browser.
4. Fill in the Setup Secret (same value from step 1), your name, email, and
   a password. Submit.
5. That's it — you're redirected to `/login`. Log in with those credentials.

This endpoint only works **once**: after the first super admin exists, it
refuses all further requests, so it's safe to leave the code in place
(though you can also remove the `SETUP_SECRET` env var afterward if you'd
rather lock it down further).

Once logged in as super admin, create the Thynk Success **Project Admin**
from the **Users** page in the app itself (Users → New User → role
"Project Admin") — no CLI needed for that either.

### Option B: Local CLI (if you have Node.js installed)

```bash
npm install

npm run seed:user -- --email=you@thynksuccess.com --password="Str0ngPass!" \
  --name="Your Name" --role=super_admin

npm run seed:user -- --email=admin@thynksuccess.com --password="Str0ngPass!" \
  --name="Thynk Success Admin" --role=project_admin --project=thynk-success
```

`--project` accepts either the project's slug (e.g. `thynk-success`) or its
UUID. Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
your environment (`.env.local`, or pull from Vercel with `vercel env pull`).

## 3. Log in

Visit `/login`. Super admins land on `/projects`; everyone else lands on
`/dashboard` for their project automatically.

## 4. Day-to-day project management (Super Admin)

- **Projects** (`/projects`) — create a new project, deactivate an old one.
  Creating a project just registers the workspace; you still need to add at
  least one Project Admin via the Users page so someone can log into it.
- **Users** (`/users`) — create/deactivate users. Super admins can create
  users in any project (and other super admins); Project Admins can only
  create Project Admins / Project Members inside their own project.
- **Project switcher** — in the sidebar, super admins can switch which
  project's data they're currently viewing/editing. Every screen (accounts,
  contacts, templates, campaigns, reports, email status) reflects whichever
  project is active.

## Notes on isolation

- Every API route resolves the "active project" from the signed-in user's
  session (their fixed `project_id`, or — for super admins — the project
  they've switched to). Client requests can never override this.
- Record-level endpoints (e.g. editing a single campaign, template, or
  account by id) additionally verify that record belongs to the active
  project before reading/updating/deleting it.
- Creating a campaign validates that the selected sending accounts,
  contact lists, and template all belong to the active project.
