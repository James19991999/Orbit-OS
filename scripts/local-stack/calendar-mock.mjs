// Local stand-in for Google (OAuth 2.0 + Calendar v3) and Microsoft (identity platform + Graph), used ONLY by
// end-to-end tests. The consent screen is skipped: /authorize redirects straight back with a code.
//   Google:    GET /o/oauth2/v2/auth · POST /token · POST /revoke · /calendar/v3/calendars/primary/events[/:id] · POST /calendar/v3/freeBusy
//   Microsoft: GET /ms/:tenant/oauth2/v2.0/authorize · POST /ms/:tenant/oauth2/v2.0/token · /graph/v1.0/me/events[/:id] · GET /graph/v1.0/me/calendarView
//   Test hooks: GET /__events?email= · POST /__busy {email, blocks:[{start,end}]} · POST /__revoke {email} · POST /__reset
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT || 54440);
const CLIENTS = { google: ['local-google-client', 'local-google-secret'], microsoft: ['local-ms-client', 'local-ms-secret'] };
let codes = new Map();      // code → { email, provider, redirect }
let access = new Map();     // token → { email, provider, exp }
let refresh = new Map();    // token → { email, provider }
let events = new Map();     // email → Map(id → event)
let busy = new Map();       // email → [{ start, end }]
const rid = (p = '') => p + randomBytes(9).toString('base64url');
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const readRaw = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });
const idToken = (email) => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ email, preferred_username: email, sub: email })).toString('base64url')}.`;
const evts = (email) => { if (!events.has(email)) events.set(email, new Map()); return events.get(email); };

function authorize(res, url, provider) {
  const q = url.searchParams;
  if (q.get('client_id') !== CLIENTS[provider][0]) return send(res, 400, { error: 'invalid_client' });
  const redirect = new URL(q.get('redirect_uri'));
  const email = (q.get('login_hint') || `someone@${provider}.test`).toLowerCase();
  if (email.includes('deny')) redirect.searchParams.set('error', 'access_denied');
  else {
    const code = rid('code_');
    codes.set(code, { email, provider, redirect: q.get('redirect_uri'), offline: provider === 'microsoft' ? (q.get('scope') || '').includes('offline_access') : q.get('access_type') === 'offline' });
    redirect.searchParams.set('code', code);
  }
  redirect.searchParams.set('state', q.get('state'));
  res.writeHead(302, { location: redirect.toString() }); res.end();
}

async function token(req, res, provider) {
  const f = new URLSearchParams(await readRaw(req));
  if (f.get('client_id') !== CLIENTS[provider][0] || f.get('client_secret') !== CLIENTS[provider][1]) return send(res, 401, { error: 'invalid_client' });
  let email;
  if (f.get('grant_type') === 'authorization_code') {
    const c = codes.get(f.get('code'));
    codes.delete(f.get('code'));
    if (!c || c.provider !== provider || c.redirect !== f.get('redirect_uri')) return send(res, 400, { error: 'invalid_grant', error_description: 'Bad or reused code' });
    email = c.email;
    const at = rid('at_'); access.set(at, { email, provider, exp: Date.now() + 3600_000 });
    const rt = c.offline ? rid('rt_') : undefined; if (rt) refresh.set(rt, { email, provider });
    return send(res, 200, { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'Bearer', id_token: idToken(email) });
  }
  if (f.get('grant_type') === 'refresh_token') {
    const r = refresh.get(f.get('refresh_token'));
    if (!r || r.provider !== provider) return send(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    const at = rid('at_'); access.set(at, { email: r.email, provider, exp: Date.now() + 3600_000 });
    let rt;
    if (provider === 'microsoft') { refresh.delete(f.get('refresh_token')); rt = rid('rt_'); refresh.set(rt, r); }   // Microsoft rotates refresh tokens
    return send(res, 200, { access_token: at, ...(rt ? { refresh_token: rt } : {}), expires_in: 3600, token_type: 'Bearer' });
  }
  return send(res, 400, { error: 'unsupported_grant_type' });
}

function who(req, provider) {
  const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const a = access.get(t);
  return a && a.provider === provider && a.exp > Date.now() ? a.email : null;
}
const overlaps = (s, e, from, to) => Date.parse(s) < Date.parse(to) && Date.parse(e) > Date.parse(from);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  // ── test hooks
  if (p === '/__events') return send(res, 200, [...evts(url.searchParams.get('email')).values()]);
  if (p === '/__busy' && req.method === 'POST') { const b = JSON.parse(await readRaw(req)); busy.set(b.email.toLowerCase(), b.blocks); return send(res, 200, { ok: true }); }
  if (p === '/__revoke' && req.method === 'POST') {
    const { email } = JSON.parse(await readRaw(req));
    for (const m of [access, refresh]) for (const [k, v] of m) if (v.email === email) m.delete(k);
    return send(res, 200, { ok: true });
  }
  if (p === '/__reset' && req.method === 'POST') { codes = new Map(); access = new Map(); refresh = new Map(); events = new Map(); busy = new Map(); return send(res, 200, { ok: true }); }

  // ── Google
  if (p === '/o/oauth2/v2/auth') return authorize(res, url, 'google');
  if (p === '/token' && req.method === 'POST') return token(req, res, 'google');
  if (p === '/revoke' && req.method === 'POST') { const t = url.searchParams.get('token'); refresh.delete(t); access.delete(t); return send(res, 200, {}); }
  if (p.startsWith('/calendar/v3/')) {
    const email = who(req, 'google');
    if (!email) return send(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (p === '/calendar/v3/freeBusy' && req.method === 'POST') {
      const b = JSON.parse(await readRaw(req));
      const list = [...(busy.get(email) ?? []), ...[...evts(email).values()].map((e) => ({ start: e.start.dateTime, end: e.end.dateTime }))]
        .filter((x) => overlaps(x.start, x.end, b.timeMin, b.timeMax));
      return send(res, 200, { kind: 'calendar#freeBusy', calendars: { primary: { busy: list } } });
    }
    const m = p.match(/^\/calendar\/v3\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if (m) {
      const store = evts(email);
      if (req.method === 'POST' && !m[1]) {
        const b = JSON.parse(await readRaw(req));
        if (!b.summary || !b.start?.dateTime || !b.end?.dateTime) return send(res, 400, { error: { code: 400, message: 'Missing summary/start/end' } });
        const ev = { id: rid('g'), ...b, status: 'confirmed' }; store.set(ev.id, ev);
        return send(res, 200, ev);
      }
      const ev = m[1] && store.get(decodeURIComponent(m[1]));
      if (!ev) return send(res, 404, { error: { code: 404, message: 'Not Found' } });
      if (req.method === 'PATCH') { Object.assign(ev, JSON.parse(await readRaw(req))); return send(res, 200, ev); }
      if (req.method === 'DELETE') { store.delete(ev.id); return send(res, 204); }
    }
    return send(res, 404, { error: { code: 404, message: 'Not Found' } });
  }

  // ── Microsoft
  if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/authorize$/.test(p)) return authorize(res, url, 'microsoft');
  if (/^\/ms\/[^/]+\/oauth2\/v2\.0\/token$/.test(p) && req.method === 'POST') return token(req, res, 'microsoft');
  if (p.startsWith('/graph/v1.0/me/')) {
    const email = who(req, 'microsoft');
    if (!email) return send(res, 401, { error: { code: 'InvalidAuthenticationToken', message: 'Access token has expired or is not yet valid.' } });
    const store = evts(email);
    if (p === '/graph/v1.0/me/calendarView' && req.method === 'GET') {
      const from = url.searchParams.get('startDateTime'); const to = url.searchParams.get('endDateTime');
      if (String(req.headers.prefer || '') !== 'outlook.timezone="UTC"') return send(res, 400, { error: { message: 'test mock expects UTC' } });
      const z = (d) => new Date(d).toISOString().replace('Z', '0000');
      const value = [
        ...(busy.get(email) ?? []).map((b) => ({ start: { dateTime: z(b.start), timeZone: 'UTC' }, end: { dateTime: z(b.end), timeZone: 'UTC' }, showAs: 'busy', isCancelled: false })),
        { start: { dateTime: z(from), timeZone: 'UTC' }, end: { dateTime: z(to), timeZone: 'UTC' }, showAs: 'free', isCancelled: false },   // free time is not busy
        ...[...store.values()].map((e) => ({ start: { dateTime: `${e.start.dateTime}0000`, timeZone: 'UTC' }, end: { dateTime: `${e.end.dateTime}0000`, timeZone: 'UTC' }, showAs: 'busy', isCancelled: false })),
      ].filter((v) => overlaps(`${v.start.dateTime.slice(0, 19)}Z`, `${v.end.dateTime.slice(0, 19)}Z`, from, to));
      return send(res, 200, { value });
    }
    const m = p.match(/^\/graph\/v1\.0\/me\/events(?:\/([^/]+))?$/);
    if (m) {
      if (req.method === 'POST' && !m[1]) {
        const b = JSON.parse(await readRaw(req));
        if (!b.subject || b.start?.timeZone !== 'UTC') return send(res, 400, { error: { message: 'Missing subject or non-UTC start' } });
        const ev = { id: rid('AAMk'), ...b }; store.set(ev.id, ev);
        return send(res, 201, ev);
      }
      const ev = m[1] && store.get(decodeURIComponent(m[1]));
      if (!ev) return send(res, 404, { error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } });
      if (req.method === 'PATCH') { Object.assign(ev, JSON.parse(await readRaw(req))); return send(res, 200, ev); }
      if (req.method === 'DELETE') { store.delete(ev.id); return send(res, 204); }
    }
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`calendar mock on :${PORT}`));
