/**
 * CLI script to create an app user (super_admin, project_admin, or
 * project_member). Run with ts-node/tsx, e.g.:
 *
 *   npm run seed:user -- --email=you@thynksuccess.com --password=Secret123! \
 *     --name="Your Name" --role=super_admin
 *
 *   npm run seed:user -- --email=admin@thynksuccess.com --password=Secret123! \
 *     --name="Thynk Success Admin" --role=project_admin --project=thynk-success
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
 * in the environment (e.g. loaded from .env.local).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const email = arg('email');
  const password = arg('password');
  const name = arg('name');
  const role = arg('role') as 'super_admin' | 'project_admin' | 'project_member' | undefined;
  const projectSlugOrId = arg('project');

  if (!email || !password || !name || !role) {
    console.error(
      'Usage: npm run seed:user -- --email=<email> --password=<password> --name="<Name>" --role=<super_admin|project_admin|project_member> [--project=<slug-or-id>]'
    );
    process.exit(1);
  }

  if (!['super_admin', 'project_admin', 'project_member'].includes(role)) {
    console.error('Invalid --role. Must be super_admin, project_admin, or project_member.');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let projectId: string | null = null;
  if (role !== 'super_admin') {
    if (!projectSlugOrId) {
      console.error('--project=<slug-or-id> is required for project_admin / project_member.');
      process.exit(1);
    }
    const { data: project, error } = await db
      .from('projects')
      .select('id, name, slug')
      .or(`slug.eq.${projectSlugOrId},id.eq.${projectSlugOrId}`)
      .maybeSingle();
    if (error || !project) {
      console.error(`Could not find a project matching "${projectSlugOrId}". Create it first via the Projects page or seed it directly.`);
      process.exit(1);
    }
    projectId = project.id;
  }

  const { data: existing } = await db
    .from('app_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existing) {
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error: insertError } = await db
    .from('app_users')
    .insert({
      email: email.toLowerCase().trim(),
      name,
      password_hash,
      role,
      project_id: projectId,
      is_active: true,
    })
    .select('id, email, name, role, project_id')
    .single();

  if (insertError) {
    console.error('Failed to create user:', insertError.message);
    process.exit(1);
  }

  console.log('User created successfully:');
  console.log(user);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
