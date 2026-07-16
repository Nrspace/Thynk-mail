import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { testConnection } from '@/lib/smtp-router';
import { requireProjectContext } from '@/lib/api-auth';
import type { EmailAccount } from '@/types';

export async function POST(req: NextRequest) {
  const guard = await requireProjectContext();
  if (!guard.ok) return guard.response;
  const { projectId } = guard.ctx;

  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  const db = createServerClient();
  const { data, error } = await db
    .from('email_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('team_id', projectId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const result = await testConnection(data as EmailAccount);
  return NextResponse.json(result);
}
