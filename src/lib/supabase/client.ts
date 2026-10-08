'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/env';

let cached: { client: SupabaseClient; remember: boolean } | null = null;

function readRemember(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.cookie.split('; ').some((c) => c === `${REMEMBER_COOKIE}=0`);
}

/** Browser Supabase client. Returns null when env vars are missing so UI can show a setup notice. */
export function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const remember = readRemember();
  if (cached && cached.remember === remember) return cached.client;
  const client = createBrowserClient(url, key, {
    cookieOptions: remember ? { maxAge: REMEMBER_MAX_AGE } : { maxAge: undefined },
  });
  cached = { client, remember };
  return client;
}

export function requireBrowserClient(): SupabaseClient {
  const c = getBrowserClient();
  if (!c) throw new Error('Supabase is not configured for this deployment.');
  return c;
}

export function setRememberDevice(remember: boolean) {
  document.cookie = `${REMEMBER_COOKIE}=${remember ? '1' : '0'}; path=/; samesite=lax${remember ? `; max-age=${REMEMBER_MAX_AGE}` : ''}`;
  cached = null;
}
