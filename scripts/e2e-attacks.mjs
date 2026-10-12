// Attacks a running OrbitOS (local stack) the way an outsider would, and checks each one is refused.
// Run last: the flood test fills this machine's write allowance for a minute.
// Usage: node scripts/e2e-attacks.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';

const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const results = [];
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 220)); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Work email').fill('elena@acme-global.demo');
await page.getByLabel('Password', { exact: true }).fill(PW);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
const api = ctx.request; // carries Elena's session cookies, like her browser would
const switchBody = { data: { slug: 'acme-global' } };

await step('a change from the app itself still works', async () => {
  const r = await api.post(`${base}/api/org/switch`, { ...switchBody, headers: { origin: base, 'sec-fetch-site': 'same-origin' } });
  return r.status() === 200 || fail(`status ${r.status()}`);
});

await step('another website cannot make a signed-in browser change data (cross-site request forgery)', async () => {
  const r = await api.post(`${base}/api/org/switch`, { ...switchBody, headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
  return r.status() === 403 || fail(`status ${r.status()}`);
});

await step('look-alike domains are refused too', async () => {
  const host = new URL(base).host;
  const r = await api.post(`${base}/api/org/switch`, { ...switchBody, headers: { origin: `http://${host}.evil.example` } });
  return r.status() === 403 || fail(`status ${r.status()}`);
});

await step('sandboxed pages (Origin: null) are refused', async () => {
  const r = await api.post(`${base}/api/org/switch`, { ...switchBody, headers: { origin: 'null' } });
  return r.status() === 403 || fail(`status ${r.status()}`);
});

await step('a 2 MB request body is refused before it reaches the code', async () => {
  const r = await api.post(`${base}/api/org/switch`, { headers: { origin: base, 'content-type': 'application/json' }, data: JSON.stringify({ slug: 'x'.repeat(2_000_000) }) });
  return r.status() === 413 || fail(`status ${r.status()}`);
});

await step('an oversized body sent without a size header is refused too', async () => {
  const status = await new Promise((resolve, reject) => {
    const u = new URL(`${base}/api/auth/event`);
    const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    const chunk = 'x'.repeat(100_000);
    req.write('{"type":"login_failed","email":"a@b.co","pad":"');
    for (let i = 0; i < 12; i++) req.write(chunk);
    req.end('"}');
  });
  return status === 413 || fail(`status ${status}`);
});

await step('email wildcards cannot match someone else’s account', async () => {
  // "_" matches any one character in a database LIKE search; "el_na@…" must not find elena@….
  const before = Number(sql(`select count(*) from public.webauthn_challenges where user_id is not null`));
  const r = await api.post(`${base}/api/auth/passkey/login/options`, { headers: { origin: base }, data: { email: 'el_na@acme-global.demo' } });
  if (r.status() !== 200) fail(`status ${r.status()}`);
  const after = Number(sql(`select count(*) from public.webauthn_challenges where user_id is not null`));
  return after === before || fail('the wildcard address was linked to a real account');
});

await step('failed sign-ins for a wildcard address are not pinned on a real person', async () => {
  const before = Number(sql(`select count(*) from public.audit_log where action = 'auth.login_failed'`));
  await api.post(`${base}/api/auth/event`, { headers: { origin: base }, data: { type: 'login_failed', email: 'el_na@acme-global.demo' } });
  const mid = Number(sql(`select count(*) from public.audit_log where action = 'auth.login_failed'`));
  if (mid !== before) fail('wildcard address logged against a real account');
  await api.post(`${base}/api/auth/event`, { headers: { origin: base }, data: { type: 'login_failed', email: 'elena@acme-global.demo' } });
  const after = Number(sql(`select count(*) from public.audit_log where action = 'auth.login_failed'`));
  return after > mid || fail('a real failed sign-in was not recorded');
});

await step('security headers are sent on every page', async () => {
  const r = await api.get(`${base}/`);
  const h = r.headers();
  const need = { 'x-frame-options': 'DENY', 'cross-origin-opener-policy': 'same-origin', 'x-content-type-options': 'nosniff' };
  for (const [k, v] of Object.entries(need)) if (h[k] !== v) fail(`${k}: ${h[k]}`);
  const csp = h['content-security-policy'] || '';
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) if (!csp.includes(d)) fail(`CSP lacks ${d}`);
  return true;
});

await step('the app cannot be framed by another site (clickjacking)', async () => {
  const p2 = await ctx.newPage();
  await p2.setContent(`<iframe id="f" src="${base}/dashboard" width="400" height="300"></iframe>`);
  await p2.waitForTimeout(2500);
  const framed = await p2.frame({ url: /dashboard/ })?.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0) ?? 0;
  await p2.close();
  return framed === 0 || fail('dashboard rendered inside a foreign frame');
});

await step('vulnerability contact published at /.well-known/security.txt', async () => {
  const r = await api.get(`${base}/.well-known/security.txt`);
  const body = await r.text();
  return (r.status() === 200 && /^Contact: /m.test(body) && /^Expires: /m.test(body)) || fail(`${r.status()} ${body.slice(0, 80)}`);
});

await step('internal errors never reveal database details', async () => {
  // A malformed id makes the database raise an error; the caller must only see a generic message.
  const r = await api.post(`${base}/api/invoices/not-a-uuid/void`, { headers: { origin: base }, data: {} });
  const body = await r.text();
  if (/relation|syntax|uuid|postgres|column|violates/i.test(body)) fail(`leaked: ${body.slice(0, 120)}`);
  return `status ${r.status()}`;
});

await step('the founder summary cannot be called with the public key', async () => {
  const anon = process.env.ANON || '';
  if (!anon) return 'skipped (set ANON)';
  const out = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', 'http://localhost:54321/rest/v1/rpc/platform_metrics', '-H', `apikey: ${anon}`, '-H', `authorization: Bearer ${anon}`, '-H', 'content-type: application/json', '-d', '{}']).toString();
  return ['401', '403', '404'].includes(out) || fail(`status ${out}`);
});

await step('a flood of change requests is cut off (rate limit)', async () => {
  const codes = await Promise.all(Array.from({ length: 330 }, () =>
    api.post(`${base}/api/org/switch`, { ...switchBody, headers: { origin: base } }).then((r) => r.status()).catch(() => 0)));
  const limited = codes.filter((c) => c === 429).length;
  return limited > 0 || fail(`no 429 among ${codes.length} requests`);
});

await browser.close();
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} attack checks passed`);
process.exit(passed === results.length ? 0 : 1);
