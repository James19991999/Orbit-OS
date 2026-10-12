// Pure request checks for /api routes (no next/server import, so they can be unit-tested anywhere).
// Webhooks (/api/webhooks/*) and scheduled jobs (/api/cron/*) are excluded by the middleware matcher: they are
// called by other servers and prove themselves with signatures and CRON_SECRET instead.

/** Largest JSON body any OrbitOS endpoint accepts. Real requests are a few kilobytes. */
export const MAX_API_BODY_BYTES = 1_000_000;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface GuardInput {
  method: string;
  pathname: string;
  host: string | null;            // the host this request was sent to
  origin: string | null;          // Origin header (browsers send it on every POST/PATCH/PUT/DELETE)
  secFetchSite: string | null;    // Sec-Fetch-Site header (modern browsers)
  contentLength: string | null;
  appUrl?: string;                // NEXT_PUBLIC_APP_URL, also accepted as an origin
}

export type GuardResult = { ok: true } | { ok: false; status: 403 | 413; error: string };

/**
 * Blocks two kinds of abuse before any route code runs:
 *  1. Cross-site requests: another website making a signed-in visitor's browser change data in OrbitOS
 *     (cross-site request forgery). Browsers always label where a request came from, so a write whose Origin
 *     isn't this site — or that the browser marks as cross-site — is refused.
 *     Requests with neither header come from scripts and servers, which never carry a visitor's cookies.
 *  2. Oversized bodies meant to exhaust memory.
 */
export function guardApiRequest(r: GuardInput): GuardResult {
  if (!r.pathname.startsWith('/api/')) return { ok: true };
  const len = Number(r.contentLength ?? 0);
  if (Number.isFinite(len) && len > MAX_API_BODY_BYTES) return { ok: false, status: 413, error: 'Request is too large' };
  if (SAFE_METHODS.has(r.method.toUpperCase())) return { ok: true };

  if (r.origin && r.origin !== 'null') {
    let originHost: string;
    try { originHost = new URL(r.origin).host.toLowerCase(); } catch { return { ok: false, status: 403, error: 'Cross-site request blocked' }; }
    const allowed = new Set<string>();
    if (r.host) allowed.add(r.host.toLowerCase());
    if (r.appUrl) { try { allowed.add(new URL(r.appUrl).host.toLowerCase()); } catch { /* ignore a malformed setting */ } }
    return allowed.has(originHost) ? { ok: true } : { ok: false, status: 403, error: 'Cross-site request blocked' };
  }
  if (r.origin === 'null' || r.secFetchSite === 'cross-site') return { ok: false, status: 403, error: 'Cross-site request blocked' };
  return { ok: true };
}

/** Makes user input safe inside a Postgres ILIKE pattern, so "%" and "_" match only themselves. */
export function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
