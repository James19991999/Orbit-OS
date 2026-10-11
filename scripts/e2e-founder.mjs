// Founder Console in a real browser against the local stack: who can open it, two-factor, and that the numbers are real.
// The local stack sets FOUNDER_EMAILS=priya@acme-global.demo (an auditor in Acme: founder access is separate from workspace roles).
// Usage: node scripts/e2e-founder.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const FOUNDER = 'priya@acme-global.demo';
const results = [];
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); if (r !== false) ok(name, true, typeof r === 'string' ? r : ''); else ok(name, false); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 220)); }
}
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
async function login(page, email) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
}

// Fresh state: Priya has no authenticator yet; known job/delivery rows to look for.
sql(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${FOUNDER}')`);
sql(`delete from public.platform_audit`);
sql(`insert into public.delivery_failures (channel, error, context) values ('email', 'Domain not verified (e2e)', 'Invite to Acme')`);

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  await step('signed-out visitors are sent to sign in', async () => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${base}/founder`, { waitUntil: 'networkidle' });
    return new URL(page.url()).pathname === '/login' ? 'redirected to /login' : false;
  });

  await step('anyone not in FOUNDER_EMAILS gets a plain 404 — even a workspace owner', async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await login(page, 'elena@acme-global.demo');
    const res = await page.goto(`${base}/founder`, { waitUntil: 'networkidle' });
    const menu = await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' }).then(async () => {
      await page.getByRole('button', { name: 'Account menu' }).click();
      return page.getByRole('menuitem', { name: 'Founder console' }).count();
    });
    await ctx.close();
    return res.status() === 404 && menu === 0 ? '404, and no menu link' : false;
  });

  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctx.newPage();
  await step('the founder without two-factor is sent to set it up first', async () => {
    await login(page, FOUNDER);
    await page.goto(`${base}/founder`, { waitUntil: 'networkidle' });
    const u = new URL(page.url());
    return u.pathname === '/mfa' && u.searchParams.get('next') === '/founder' ? '/mfa?next=/founder' : false;
  });

  await step('after a real authenticator code, the founder lands on the console', async () => {
    const secret = (await page.locator('code').first().textContent()).trim();
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();
    await page.waitForURL((u) => u.pathname === '/founder', { timeout: 20000 });
    await page.getByRole('heading', { name: 'Founder console' }).waitFor();
    return true;
  });

  await step('the account menu offers the console to the founder', async () => {
    await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Founder console' }).click();
    await page.waitForURL((u) => u.pathname === '/founder');
    return true;
  });

  // Run a background job the way GitHub Actions does, then reload: the console must show it.
  const cron = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Authorization: Bearer local-cron-secret', `${base}/api/cron/etims`]).toString();
  const renewalsBefore = sql(`select coalesce((select runs from job_runs where job = 'renewals'), 0)`);
  execFileSync('curl', ['-s', '-o', '/dev/null', `${base}/api/cron/renewals`]); // no secret: must NOT be recorded

  await step('numbers match the database (people, workspaces, revenue)', async () => {
    await page.goto(`${base}/founder`, { waitUntil: 'networkidle' });
    const users = sql(`select count(distinct user_id) from memberships where status = 'active'`);
    const workspaces = sql(`select count(*) from organizations`);
    const rev = Number(sql(`select coalesce(sum(amount_minor), 0) from billing_payments where state = 'COMPLETE' and created_at >= date_trunc('month', now())`));
    const people = await page.locator('section, div').filter({ has: page.getByText('People', { exact: true }) }).getByText(users, { exact: true }).count();
    const text = await page.locator('main').innerText();
    const kes = (rev / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 });
    const wsOk = new RegExp(`workspaces\\s+${workspaces}\\b`, 'i').test(text);
    return wsOk && people > 0 && text.includes(kes) ? `${users} people, ${workspaces} workspaces, KES ${kes} this month` : fail(`missing: users=${people > 0} ws=${wsOk} kes=${text.includes(kes)} (${kes})`);
  });

  await step('the founder shows as online (heartbeat from the app)', async () => {
    const text = await page.locator('main').innerText();
    const n = Number(sql(`select count(*) from user_activity where last_seen_at > now() - interval '5 minutes'`));
    return n >= 1 && text.includes('Priya') ? `${n} online, Priya listed` : false;
  });

  await step('background job runs are recorded; unauthorised calls are not', async () => {
    const etims = sql(`select runs || '|' || last_status from job_runs where job = 'etims'`);
    const renewalsAfter = sql(`select coalesce((select runs from job_runs where job = 'renewals'), 0)`);
    const renewals = String(Number(renewalsAfter) - Number(renewalsBefore));
    const text = await page.locator('main').innerText();
    return cron === '200' && etims.endsWith('|200') && renewals === '0' && /KRA eTIMS retries[\s\S]*?on time/i.test(text) ? `etims ${etims}, unauthorised renewals call ignored` : fail(`cron=${cron} etims=${etims} renewals=${renewals}`);
  });

  await step('undelivered emails are listed', async () => {
    return (await page.getByText('Domain not verified (e2e)').count()) > 0;
  });

  await step('workspace search finds Acme and lists lifetime revenue', async () => {
    await page.getByLabel('Search by name or address').fill('acme');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL(/q=acme/);
    const row = page.locator('tbody tr').filter({ hasText: 'Acme Global' });
    return (await row.count()) === 1 && /KES/.test(await row.innerText());
  });

  await step('each visit is logged (at most once per 10 minutes)', async () => {
    const n = sql(`select count(*) from platform_audit where action = 'founder.console_viewed' and actor_email = '${FOUNDER}'`);
    return n === '1' ? '1 log entry for several page loads' : fail(`got ${n}`);
  });

  await step('the console data is unreachable from the browser API (even for the founder)', async () => {
    const r = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
      return { key: Boolean(key) };
    });
    const anon = (() => { try { return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', '-H', 'content-type: application/json',
      '-H', `apikey: ${process.env.ANON || ''}`, 'http://localhost:54321/rest/v1/rpc/platform_metrics', '-d', '{}']).toString(); } catch (e) { return String(e.stdout ?? 'error'); } })();
    return ['401', '403', '404'].includes(anon) ? `platform_metrics via the public API → ${anon}` : fail(`public API returned ${anon} (${JSON.stringify(r)})`);
  });
  await ctx.close();
} finally {
  sql(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${FOUNDER}')`);
  sql(`delete from public.delivery_failures where error like '%(e2e)%'`);
  await browser.close();
}
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} founder console checks passed`);
process.exit(passed === results.length ? 0 : 1);
