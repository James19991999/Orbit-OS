// Pure session/routing rules (no next/server import) so they can be unit-tested anywhere.

export const PROTECTED_PREFIXES = ['/dashboard', '/operations', '/scheduling', '/culture', '/compliance', '/reports',
  '/people', '/settings', '/profile', '/notifications', '/onboarding', '/mfa'];

export function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export const DEFAULT_TIMEOUT_HOURS = 8;

/**
 * Inactivity timeout: true when the last request is older than the org's timeout. The org's value is mirrored
 * into a cookie by the app shell; until that cookie exists we enforce the default instead of skipping the check.
 */
export function isIdleExpired(lastSeen: string | undefined, timeoutHours: string | undefined, now = Date.now()): boolean {
  const last = Number(lastSeen);
  const hours = timeoutHours === undefined || timeoutHours === '' ? DEFAULT_TIMEOUT_HOURS : Number(timeoutHours);
  if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(hours) || hours <= 0) return false;
  return now - last > hours * 3_600_000;
}

/** Tenant slug from a subdomain when NEXT_PUBLIC_ROOT_DOMAIN is configured (acme.orbitos.io → "acme"). */
export function tenantFromHost(host: string | null, root = process.env.NEXT_PUBLIC_ROOT_DOMAIN): string | null {
  if (!host || !root) return null;
  const h = host.split(':')[0].toLowerCase();
  const r = root.toLowerCase();
  if (h === r || !h.endsWith('.' + r)) return null;
  const sub = h.slice(0, -(r.length + 1));
  return /^[a-z0-9-]{3,40}$/.test(sub) && sub !== 'www' && sub !== 'app' ? sub : null;
}

