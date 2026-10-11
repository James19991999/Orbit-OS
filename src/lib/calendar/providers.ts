import 'server-only';

/**
 * Google Calendar (OAuth 2.0 + Calendar API v3) and Outlook (Microsoft identity platform + Graph v1.0).
 * Base URLs can be overridden for the local test mock; production uses the real endpoints.
 */
export type Provider = 'google' | 'microsoft';
export const PROVIDERS: Provider[] = ['google', 'microsoft'];

export interface EventInput { title: string; description: string | null; start: Date; end: Date; url: string | null }
export interface TokenSet { accessToken: string; refreshToken: string | null; expiresAt: Date; email: string | null }
export class CalendarAuthError extends Error {}   // refresh token revoked/expired: the person must reconnect
export class CalendarApiError extends Error { constructor(public status: number, message: string) { super(message); } }

const env = (k: string) => (process.env[k] || '').trim();
const G = {
  oauth: () => (env('GOOGLE_OAUTH_BASE') || 'https://accounts.google.com').replace(/\/$/, ''),
  token: () => (env('GOOGLE_TOKEN_BASE') || 'https://oauth2.googleapis.com').replace(/\/$/, ''),
  api: () => (env('GOOGLE_API_BASE') || 'https://www.googleapis.com').replace(/\/$/, ''),
};
const M = {
  login: () => `${(env('MICROSOFT_LOGIN_BASE') || 'https://login.microsoftonline.com').replace(/\/$/, '')}/${env('MICROSOFT_CALENDAR_TENANT') || 'common'}`,
  graph: () => (env('MICROSOFT_GRAPH_BASE') || 'https://graph.microsoft.com').replace(/\/$/, ''),
};

export function isProviderConfigured(p: Provider): boolean {
  return p === 'google'
    ? !!(env('GOOGLE_CALENDAR_CLIENT_ID') && env('GOOGLE_CALENDAR_CLIENT_SECRET'))
    : !!(env('MICROSOFT_CALENDAR_CLIENT_ID') && env('MICROSOFT_CALENDAR_CLIENT_SECRET'));
}

const SCOPES: Record<Provider, string> = {
  // Create/update/delete events, read free/busy, and know which account was connected.
  google: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy',
  microsoft: 'openid email offline_access Calendars.ReadWrite',
};

export function authorizeUrl(p: Provider, redirectUri: string, state: string, loginHint?: string | null): string {
  if (p === 'google') {
    const q = new URLSearchParams({
      client_id: env('GOOGLE_CALENDAR_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.google,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return `${G.oauth()}/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: env('MICROSOFT_CALENDAR_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code', response_mode: 'query',
    scope: SCOPES.microsoft, state, prompt: 'select_account', ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${M.login()}/oauth2/v2.0/authorize?${q}`;
}

/** The email claim of an id_token received directly from the provider's token endpoint over TLS. */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    const e = payload.email ?? payload.preferred_username ?? payload.upn;
    return typeof e === 'string' && e.includes('@') ? e.toLowerCase() : null;
  } catch { return null; }
}

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenSet> {
  const url = p === 'google' ? `${G.token()}/token` : `${M.login()}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env(p === 'google' ? 'GOOGLE_CALENDAR_CLIENT_ID' : 'MICROSOFT_CALENDAR_CLIENT_ID'),
    client_secret: env(p === 'google' ? 'GOOGLE_CALENDAR_CLIENT_SECRET' : 'MICROSOFT_CALENDAR_CLIENT_SECRET'),
    ...(p === 'microsoft' ? { scope: SCOPES.microsoft } : {}),
    ...params,
  });
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== 'string') {
    // invalid_grant = the person revoked access or the refresh token expired.
    if (j.error === 'invalid_grant' || res.status === 400 || res.status === 401) throw new CalendarAuthError(String(j.error_description ?? j.error ?? `HTTP ${res.status}`));
    throw new CalendarApiError(res.status, String(j.error_description ?? j.error ?? `Token request failed (${res.status})`));
  }
  return {
    accessToken: j.access_token, refreshToken: typeof j.refresh_token === 'string' ? j.refresh_token : null,
    expiresAt: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000), email: emailFromIdToken(j.id_token),
  };
}

export const exchangeCode = (p: Provider, code: string, redirectUri: string) =>
  tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
export const refreshAccess = (p: Provider, refreshToken: string) =>
  tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken });

/** Best effort: tells Google to forget the grant. (Microsoft has no per-app revoke endpoint for this flow.) */
export async function revoke(p: Provider, token: string) {
  if (p !== 'google') return;
  await fetch(`${G.token()}/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

async function api(p: Provider, token: string, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${p === 'google' ? G.api() : M.graph()}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000), cache: 'no-store',
  });
  if (res.status === 401) throw new CalendarAuthError('Access token rejected');
  const text = await res.text();
  const j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg = (j.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new CalendarApiError(res.status, msg);
  }
  return j;
}

function eventBody(p: Provider, e: EventInput) {
  const notes = [e.description, e.url ? `Join: ${e.url}` : null, 'Scheduled in OrbitOS'].filter(Boolean).join('\n\n');
  if (p === 'google') {
    return { summary: e.title, description: notes, location: e.url ?? undefined, start: { dateTime: e.start.toISOString() }, end: { dateTime: e.end.toISOString() },
      source: e.url ? { title: 'OrbitOS', url: e.url } : undefined, reminders: { useDefault: true } };
  }
  const iso = (d: Date) => d.toISOString().replace('Z', '');
  return { subject: e.title, body: { contentType: 'text', content: notes }, start: { dateTime: iso(e.start), timeZone: 'UTC' }, end: { dateTime: iso(e.end), timeZone: 'UTC' },
    location: e.url ? { displayName: e.url } : undefined, isReminderOn: true };
}

/** Creates the event in the person's own calendar (no invitations are sent by Google/Microsoft). */
export async function createEvent(p: Provider, token: string, e: EventInput): Promise<string> {
  const j = p === 'google'
    ? await api(p, token, 'POST', '/calendar/v3/calendars/primary/events?sendUpdates=none', eventBody(p, e))
    : await api(p, token, 'POST', '/v1.0/me/events', eventBody(p, e));
  return String(j.id);
}

export async function updateEvent(p: Provider, token: string, id: string, e: EventInput): Promise<void> {
  if (p === 'google') await api(p, token, 'PATCH', `/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`, eventBody(p, e));
  else await api(p, token, 'PATCH', `/v1.0/me/events/${encodeURIComponent(id)}`, eventBody(p, e));
}

/** Deleting an event that's already gone counts as done. */
export async function deleteEvent(p: Provider, token: string, id: string): Promise<void> {
  try {
    if (p === 'google') await api(p, token, 'DELETE', `/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`);
    else await api(p, token, 'DELETE', `/v1.0/me/events/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof CalendarApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

/** Busy intervals (times only) between from and to. Free and "working elsewhere" time is not busy. */
export async function fetchBusy(p: Provider, token: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[]> {
  if (p === 'google') {
    const j = await api(p, token, 'POST', '/calendar/v3/freeBusy', { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] });
    const busy = ((j.calendars as Record<string, { busy?: { start: string; end: string }[] }> | undefined)?.primary?.busy) ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }
  const out: { start: Date; end: Date }[] = [];
  let path: string | null = `/v1.0/me/calendarView?${new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $select: 'start,end,showAs,isCancelled', $top: '250' })}`;
  for (let page = 0; path && page < 10; page++) {
    const j = await api(p, token, 'GET', path, undefined, { Prefer: 'outlook.timezone="UTC"' });
    for (const ev of (j.value as { start: { dateTime: string }; end: { dateTime: string }; showAs?: string; isCancelled?: boolean }[] | undefined) ?? []) {
      if (ev.isCancelled || ev.showAs === 'free' || ev.showAs === 'workingElsewhere') continue;
      out.push({ start: new Date(`${ev.start.dateTime.replace(/Z$/, '')}Z`), end: new Date(`${ev.end.dateTime.replace(/Z$/, '')}Z`) });
    }
    const next = j['@odata.nextLink'];
    path = typeof next === 'string' ? next.replace(M.graph(), '') : null;
  }
  return out;
}
