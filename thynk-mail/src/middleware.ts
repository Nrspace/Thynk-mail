import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth-constants';

// Paths that never require a session.
const PUBLIC_PREFIXES = [
  '/login',
  '/setup',
  '/unsubscribe',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/setup',
  '/api/webhooks',
  '/api/cron',
  '/api/send/track',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Fine-grained checks (session validity, role, project scoping) happen in
  // each server component / route handler via getCurrentUser(), since that
  // requires a DB lookup. This middleware only keeps anonymous users out.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
