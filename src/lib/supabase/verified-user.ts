import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * The signed-in user, from a verified session token.
 *
 * `getClaims()` checks the token's signature and expiry. On projects using Supabase's asymmetric JWT
 * signing keys it does this locally (the public key is cached), so there is no round trip to Supabase Auth
 * on every page — the main cost when the app and the database are in different regions. On projects still
 * on the legacy shared secret it falls back to `getUser()` (a network check), exactly as before.
 * Row-level security in Postgres trusts the same token, so this is the same trust boundary as every query.
 */
export async function verifiedUser(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims as Record<string, unknown> | undefined;
  if (error || !c || typeof c.sub !== 'string' || c.role === 'anon') return null;
  return {
    id: c.sub,
    email: typeof c.email === 'string' ? c.email : undefined,
    phone: typeof c.phone === 'string' ? c.phone : undefined,
    aud: String(c.aud ?? 'authenticated'),
    role: typeof c.role === 'string' ? c.role : undefined,
    user_metadata: (c.user_metadata as User['user_metadata']) ?? {},
    app_metadata: (c.app_metadata as User['app_metadata']) ?? {},
    is_anonymous: c.is_anonymous === true,
    created_at: '',
  } as User;
}
