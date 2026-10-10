'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/env';
import { applyRemember } from './cookies';

let cached: SupabaseClient | null = null;

export function readRemember(cookieString = typeof document === 'undefined' ? '' : document.cookie): boolean {
  return !cookieString.split('; ').some((c) => c === `${REMEMBER_COOKIE}=0`);
}

type CookieOptions = { path?: string; domain?: string; maxAge?: number; expires?: Date; sameSite?: string | boolean; secure?: boolean };

/** Serialises one cookie for document.cookie. maxAge undefined → browser-session cookie. */
export function serializeCookie(name: string, value: string, o: CookieOptions = {}): string {
  let s = `${name}=${encodeURIComponent(value)}; Path=${o.path ?? '/'}`;
  if (o.domain) s += `; Domain=${o.domain}`;
  if (typeof o.maxAge === 'number') s += `; Max-Age=${Math.floor(o.maxAge)}`;
  if (o.sameSite) s += `; SameSite=${o.sameSite === true ? 'Strict' : String(o.sameSite)}`;
  if (o.secure || (typeof location !== 'undefined' && location.protocol === 'https:')) s += '; Secure';
  return s;
}

/**
 * Browser Supabase client. We supply our own cookie writer because @supabase/ssr always writes
 * 400-day cookies and ignores cookieOptions.maxAge — which would make "Remember this device" a no-op.
 * Returns null when env vars are missing so UI can show a setup notice.
 */
export function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (cached) return cached;
  // Required on first use rather than imported at the top: the client library (~55 KB) is then
  // evaluated after the page has painted and become interactive, not during start-up.
  const { createBrowserClient } = require('@supabase/ssr') as typeof import('@supabase/ssr');
  cached = createBrowserClient(url, key, {
    cookies: {
      getAll: () => document.cookie.split('; ').filter(Boolean).map((c) => {
        const i = c.indexOf('=');
        return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
      }),
      setAll: (list) => {
        const remember = readRemember(); // read at write time, so the checkbox applies to this sign-in
        for (const { name, value, options } of list) {
          document.cookie = serializeCookie(name, value, applyRemember(options as CookieOptions, remember));
        }
      },
    },
  });
  return cached;
}

export function requireBrowserClient(): SupabaseClient {
  const c = getBrowserClient();
  if (!c) throw new Error('Supabase is not configured for this deployment.');
  return c;
}

export function setRememberDevice(remember: boolean) {
  document.cookie = `${REMEMBER_COOKIE}=${remember ? '1' : '0'}; path=/; samesite=lax${remember ? `; max-age=${REMEMBER_MAX_AGE}` : ''}`;
}
