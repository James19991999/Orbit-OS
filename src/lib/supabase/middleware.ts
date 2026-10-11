import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseEnv, REMEMBER_COOKIE, LAST_SEEN_COOKIE, TIMEOUT_COOKIE } from '@/lib/env';
import { applyRemember } from './cookies';
import { verifiedUser } from './verified-user';

export { PROTECTED_PREFIXES, isProtected, isIdleExpired, tenantFromHost } from './session-rules';
import { isProtected, isIdleExpired, tenantFromHost } from './session-rules';

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const tenant = tenantFromHost(request.headers.get('host'));
  if (tenant) requestHeaders.set('x-orbit-tenant', tenant);
  requestHeaders.set('x-orbit-path', request.nextUrl.pathname + request.nextUrl.search);

  const env = supabaseEnv();
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!env) return response; // unconfigured deployment: pages render a setup notice

  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== '0';
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, applyRemember(options, remember)));
      },
    },
  });

  const user = await verifiedUser(supabase);
  const { pathname, search } = request.nextUrl;

  if (isProtected(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    // session inactivity timeout (org setting, mirrored into a cookie by the app shell)
    if (isIdleExpired(request.cookies.get(LAST_SEEN_COOKIE)?.value, request.cookies.get(TIMEOUT_COOKIE)?.value)) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?reason=timeout';
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      redirect.cookies.delete(LAST_SEEN_COOKIE);
      return redirect;
    }
    response.cookies.set(LAST_SEEN_COOKIE, String(Date.now()), { path: '/', sameSite: 'lax', httpOnly: true, secure: request.nextUrl.protocol === 'https:' });
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
