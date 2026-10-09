import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// NOTE: lives in src/ because the project uses --src-dir; a root-level middleware.ts would silently never run.
// Middleware only refreshes sessions and redirects. Row Level Security in Postgres is the real security boundary.
export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|offline|api/webhooks|api/cron|monitoring|.*\\.(?:png|jpg|svg|webp|woff2)$).*)'],
};
