export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export const REMEMBER_COOKIE = 'orbit_remember';
export const ORG_COOKIE = 'orbit_org';
export const LAST_SEEN_COOKIE = 'orbit_last_seen';
export const TIMEOUT_COOKIE = 'orbit_timeout_h';
export const THEME_COOKIE = 'orbit_theme';
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
