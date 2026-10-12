/** Public URL of a workspace logo in the 'branding' storage bucket. */
export function brandLogoUrl(path: string | null | undefined): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && url ? `${url.replace(/\/$/, '')}/storage/v1/object/public/branding/${path}` : null;
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const isSupabaseConfigured = () => supabaseEnv() !== null;

/** The site's public address. Set NEXT_PUBLIC_APP_URL; on Vercel it falls back to the production domain, so links,
 *  canonical tags and the sitemap never point at localhost if the variable is forgotten. */
export function appUrl(): string {
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return (process.env.NEXT_PUBLIC_APP_URL || (vercel ? `https://${vercel}` : 'http://localhost:3000')).replace(/\/$/, '');
}

export const REMEMBER_COOKIE = 'orbit_remember';
export const ORG_COOKIE = 'orbit_org';
export const LAST_SEEN_COOKIE = 'orbit_last_seen';
export const TIMEOUT_COOKIE = 'orbit_timeout_h';
export const THEME_COOKIE = 'orbit_theme';
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Public contact address shown on the security and privacy pages (NEXT_PUBLIC_CONTACT_EMAIL). */
export function contactEmail(): string | null {
  const v = (process.env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}
