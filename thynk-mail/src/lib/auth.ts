import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createServerClient } from './supabase';

export { SESSION_COOKIE, ACTIVE_PROJECT_COOKIE } from './auth-constants';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const db = createServerClient();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const { error } = await db.from('app_sessions').insert({ token, user_id: userId, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  const db = createServerClient();
  await db.from('app_sessions').delete().eq('token', token);
}
