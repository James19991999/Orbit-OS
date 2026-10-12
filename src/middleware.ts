import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { guardApiRequest } from '@/lib/security/request-guard';

// NOTE: lives in src/ because the project uses --src-dir; a root-level middleware.ts would silently never run.
// Middleware only refreshes sessions and redirects. Row Level Security in Postgres is the real security boundary.
export function middleware(request: NextRequest) {
  const guard = guardApiRequest({
    method: request.method, pathname: request.nextUrl.pathname, host: request.headers.get('host'),
    origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site'),
    contentLength: request.headers.get('content-length'), appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|offline|api/webhooks|api/cron|monitoring|.*\\.(?:png|jpg|svg|webp|woff2)$).*)'],
};
