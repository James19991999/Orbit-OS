import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseEnv, REMEMBER_COOKIE } from '@/lib/env';
import { applyRemember } from './cookies';

/** Supabase client for Server Components, Route Handlers and Server Actions (acts as the signed-in user). */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  const store = await cookies();
  const remember = store.get(REMEMBER_COOKIE)?.value !== '0';
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, applyRemember(options, remember)));
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes the session.
        }
      },
    },
  });
}
