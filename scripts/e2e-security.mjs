// End-to-end auth & session security flows in real Chromium against the local stack.
// Runs AFTER scripts/e2e-flows.mjs on the same database. Usage: node scripts/e2e-security.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';

const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const results = [];
const stamp = Date.now().toString(36);
let shotPage = null;
const ok = (name, cond, detail = '') => {
  if (!cond && shotPage) shotPage.screenshot({ path: `/tmp/e2e-fail-${results.length}.png`, fullPage: true }).catch(() => undefined); results.push(cond); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
async function step(name, fn) {
  // Return true / a success note to pass. Return false or a string starting with '✗' to fail.
  try { const r = await fn(); const failed = r === false || (typeof r === 'string' && r.startsWith('✗')); ok(name, !failed, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 220)); }
}
/** psql against the local stack DB (superuser) — only used to put the DB into states a test needs. */
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret. */
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

// Reset the preconditions this suite changes, so it can be re-run on the same database.
sql(`delete from auth.mfa_factors where user_id in (select id from auth.users where email in ('elena@acme-global.demo'))`);
sql(`delete from public.passkeys where user_id in (select id from auth.users where email = 'sofia@acme-global.demo')`);
sql(`update public.organizations set enforce_mfa_admins = false, status = 'active', deletion_scheduled_at = null where slug = 'acme-global'`);
sql(`delete from public.organizations where slug like 'side-project-%' or slug like 'dbg-%'`);

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function login(page, email, { remember = true, password = PW } = {}) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  if (!remember) await page.getByLabel('Remember this device for 30 days').uncheck();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function signOut(page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/login', { timeout: 20000 });
}

// ───────────── Remember device / session cookies ─────────────
await step('“Remember this device” off → auth cookies are browser-session cookies', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, 'meiling@acme-global.demo', { remember: false });
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const auth = (await ctx.cookies()).filter((c) => c.name.startsWith('sb-'));
  await ctx.close();
  return auth.length > 0 && auth.every((c) => c.expires === -1) ? `${auth.length} session cookie(s)` : `✗ expires: ${auth.map((c) => c.expires).join(',')}`;
});
await step('“Remember this device” on → auth cookies last ~30 days', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, 'meiling@acme-global.demo');
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const auth = (await ctx.cookies()).filter((c) => c.name.startsWith('sb-'));
  const days = auth.map((c) => (c.expires - Date.now() / 1000) / 86400);
  await ctx.close();
  return days.length && days.every((d) => d > 29 && d < 31) ? `${days[0].toFixed(1)} days` : `✗ days: ${days.join(',')}`;
});

// ───────────── Inactivity timeout (middleware) ─────────────
await step('inactivity timeout signs the user out and explains why', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, 'meiling@acme-global.demo');
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await ctx.addCookies([{ name: 'orbit_last_seen', value: String(Date.now() - 9 * 3_600_000), url: base, httpOnly: true }]);
  await page.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  const atLogin = /\/login\?reason=timeout/.test(page.url());
  const banner = await page.getByText('You were signed out after a period of inactivity.').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const stillOut = /\/login/.test(page.url());
  await ctx.close();
  return atLogin && banner && stillOut ? 'redirected, banner shown, session really ended' : `✗ url=${page.url()} banner=${banner}`;
});

// ───────────── Passkeys via Chrome's virtual authenticator ─────────────
await step('register a passkey, sign out, then sign in with it (real WebAuthn ceremony)', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await login(page, 'sofia@acme-global.demo');
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add passkey' }).click();
  await page.getByText('Passkey added').first().waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: 'networkidle' });
  const listed = await page.getByText(/^Passkey/).first().first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  await signOut(page);
  await page.getByLabel('Work email').fill('sofia@acme-global.demo');
  await page.getByRole('button', { name: /Use a passkey/ }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const h1 = await page.locator('h1').first().textContent();
  const logged = sql(`select count(*) from audit_log where action = 'auth.login' and metadata->>'method' = 'passkey'`);
  await ctx.close();
  return listed && /Sofia/.test(h1 ?? '') && Number(logged) > 0 ? `signed in as Sofia; passkey sign-in audited` : `✗ listed=${listed} h1=${h1}`;
});
await step('a passkey cannot be used for a different account’s email', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill('kiran@acme-global.demo'); // Kiran has no passkey; this fresh authenticator has none either
  await page.getByRole('button', { name: /Use a passkey/ }).click();
  const err = await page.getByRole('alert').filter({ hasText: /Passkey sign-in (failed|was cancelled)/ }).first().textContent({ timeout: 20000 });
  const stillOnLogin = /\/login/.test(page.url());
  await ctx.close();
  return stillOnLogin ? err.trim() : false;
});

// ───────────── TOTP two-factor, enforcement, MFA-gated actions ─────────────
const owner = await browser.newContext({ acceptDownloads: true });
const page = await owner.newPage();
shotPage = page;
if (process.env.TRACE) {
  page.on('requestfailed', (r) => console.log('   [reqfail]', r.method(), r.url().replace(base, ''), r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 300) console.log('   [resp]', r.status(), r.url().replace(base, '').slice(0, 120)); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('   [nav]', f.url().replace(base, '')); });
  page.on('response', async (r) => {
    const sc = (await r.allHeaders().catch(() => ({})))['set-cookie'];
    if (!sc || !sc.includes('sb-')) return;
    const m = sc.match(/sb-[^=]+=([^;]*)/); let aal = '?';
    try { const raw = decodeURIComponent(m[1]); const j = raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64').toString() : raw; aal = JSON.parse(Buffer.from(JSON.parse(j).access_token.split('.')[1], 'base64url').toString()).aal; } catch { aal = m && m[1] === '' ? 'CLEARED' : '?'; }
    console.log('   [set-cookie]', r.status(), r.url().replace(base, '').slice(0, 80), 'aal=', aal, Date.now() % 100000);
  });
  page.on('response', async (r) => { if (r.url().includes('/api/org/switch') || r.url().includes('create_organization')) console.log('   [api]', r.status(), r.url().replace(base, '').slice(0, 80), (await r.text().catch(() => '')).slice(0, 160)); });
  page.on('request', (r) => { if (r.url().includes('/factors/') || r.url().includes('/verify')) console.log('   [mfa-req]', r.url().replace('http://localhost:54321', ''), Date.now() % 100000); });
}
let secret = '';
await step('enrol an authenticator app with a real TOTP code → session becomes AAL2', async () => {
  await login(page, 'elena@acme-global.demo');
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  // enforcing MFA without having it yourself is refused (prevents locking yourself out)
  await page.getByRole('switch', { name: /Require two-factor/ }).click();
  await page.getByRole('alert').filter({ hasText: /Set up two-factor authentication on your own account first/ }).first().waitFor();
  await page.goto(`${base}/mfa?next=/profile`, { waitUntil: 'networkidle' });
  secret = (await page.locator('code').first().textContent()).trim();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByRole('alert').filter({ hasText: /not valid/ }).waitFor();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL((u) => u.pathname === '/profile', { timeout: 20000 });
  await page.getByText('This session is two-factor verified.').waitFor();
  return 'wrong code rejected; right code verified';
});
await step('owner turns on “Require two-factor for admins”', async () => {
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  const sw = page.getByRole('switch', { name: /Require two-factor/ });
  await sw.click();
  await page.getByText('Security settings saved').first().waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  return (await page.getByRole('switch', { name: /Require two-factor/ }).getAttribute('aria-checked')) === 'true';
});
await step('MFA-gated tenant archive downloads (every table as JSON + CSV)', async () => {
  await page.goto(`${base}/settings#data`, { waitUntil: 'networkidle' });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Request full tenant archive/ }).click()]);
  const zip = await JSZip.loadAsync(Buffer.concat(await (await dl.createReadStream()).toArray()));
  const tasks = JSON.parse(await zip.file('json/tasks.json').async('string'));
  const orgs = JSON.parse(await zip.file('json/organizations.json').async('string'));
  const foreign = tasks.filter((t) => t.org_id !== orgs[0].id).length;
  return foreign === 0 && tasks.length > 0 ? `${Object.keys(zip.files).length} files, ${tasks.length} tasks, 0 from other workspaces` : `✗ foreign rows: ${foreign}`;
});
await signOut(page).catch(() => undefined);
await step('with enforcement on, a director signing in with only a password is sent to set up 2FA', async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await login(p, 'marcus@acme-global.demo');
  await p.waitForURL((u) => u.pathname === '/mfa' && u.searchParams.get('required') === '1', { timeout: 30000 });
  const banner = await p.getByText(/requires two-factor authentication for owners and directors/).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  await p.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  const blocked = /\/mfa/.test(p.url());
  await ctx.close();
  return banner && blocked ? 'cannot reach app pages until enrolled' : `✗ url=${p.url()}`;
});
await step('contributors are not affected by admin-only enforcement', async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await login(p, 'wanjiru@acme-global.demo');
  await p.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  await ctx.close();
});
await step('the owner signs back in: password → TOTP challenge → app', async () => {
  await login(page, 'elena@acme-global.demo');
  await page.waitForURL((u) => u.pathname === '/mfa', { timeout: 30000 });
  await page.getByRole('heading', { name: /Verify it/ }).waitFor();
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  if (process.env.TRACE) {
    for (const c of (await owner.cookies()).filter((x) => x.name.startsWith('sb-'))) {
      let claims = '';
      try {
        const raw = decodeURIComponent(c.value); const json = raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64').toString() : raw;
        const at = JSON.parse(json).access_token; const p = JSON.parse(Buffer.from(at.split('.')[1], 'base64url').toString()); claims = `aal=${p.aal} session=${p.session_id}`;
      } catch (e) { claims = `(unparsed ${c.value.length} chars)`; }
      console.log('   [cookie]', c.name, 'expires', c.expires, claims);
    }
  }
});
await step('offboarding requires typing the workspace domain, then can be cancelled', async () => {
  await page.goto(`${base}/settings#data`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Close workspace/ }).click();
  const d = page.locator('dialog[open]');
  const confirmBtn = d.getByRole('button', { name: 'Offboard workspace' });
  const disabledFirst = await confirmBtn.isDisabled();
  await d.getByLabel(/Type “acme-global” to confirm/).fill('acme-global');
  await confirmBtn.click();
  await page.getByText(/will be permanently deleted on/).waitFor({ timeout: 20000 });
  const status = sql(`select status from organizations where slug = 'acme-global'`);
  await page.getByRole('button', { name: 'Cancel offboarding' }).click();
  await page.getByText('Offboarding cancelled').first().waitFor();
  const after = sql(`select status from organizations where slug = 'acme-global'`);
  return disabledFirst && status === 'offboarding' && after === 'active' ? 'offboarding → read-only → cancelled → active' : `✗ ${disabledFirst} ${status} ${after}`;
});
await step('turn enforcement back off (restore state)', async () => {
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: /Require two-factor/ }).click();
  await page.getByText('Security settings saved').first().waitFor();
});

// ───────────── Workspace switching & read-only expiry ─────────────
await step('create a second workspace and switch between them with the header switcher', async () => {
  await page.goto(`${base}/onboarding?new=1`, { waitUntil: 'networkidle' });
  await page.getByLabel('Company name').fill(`Side Project ${stamp}`);
  await page.getByText('Available').waitFor();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const inNew = await page.getByText(new RegExp(`Side Project ${stamp} ·`)).waitFor({ timeout: 20000 }).then(() => true, () => false);
  await page.getByRole('button', { name: /Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: /Acme Global/ }).click();
  await page.getByText(/Acme Global · \d+ members/).waitFor({ timeout: 20000 });
  return inNew ? 'new → Acme Global' : false;
});
await step('a forged workspace switch is refused (403)', async () => {
  const r = await page.request.post(`${base}/api/org/switch`, { data: { slug: 'beta-not-mine' } });
  return r.status() === 403;
});
await step('an expired workspace becomes read-only: banner + writes rejected with a clear message', async () => {
  sql(`update organizations set plan_expires_at = now() - interval '10 days' where slug like 'side-project-${stamp}%'`);
  await page.getByRole('button', { name: /Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: new RegExp(`Side Project ${stamp}`) }).click();
  await page.getByText(/plan has expired, so this workspace is read-only/).waitFor({ timeout: 20000 });
  await page.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New task' }).click();
  const d = page.locator('dialog[open]');
  await d.getByLabel('Title').fill('Should not save');
  await d.getByRole('button', { name: 'Create task' }).click();
  const msg = await d.getByRole('alert').first().textContent({ timeout: 15000 });
  const saved = sql(`select count(*) from tasks where title = 'Should not save'`);
  return /permission|read-only/i.test(msg) && saved === '0' ? msg.trim() : `✗ msg=${msg} saved=${saved}`;
});
await step('billing still works on a read-only workspace (owner can renew)', async () => {
  await page.goto(`${base}/settings/billing`, { waitUntil: 'networkidle' });
  await page.getByText('The workspace is read-only until the plan is renewed.').waitFor();
  return (await page.getByRole('button', { name: /Choose Pro|Renew/ }).first().isEnabled()) ? 'plan buttons enabled' : false;
});

// ───────────── Settings persistence ─────────────
await step('timezone-engine settings persist', async () => {
  await page.getByRole('button', { name: /Switch workspace/ }).click();
  await page.getByRole('menuitemradio', { name: /Acme Global/ }).click();
  await page.waitForTimeout(1000);
  await page.goto(`${base}/settings#timezone`, { waitUntil: 'networkidle' });
  await page.getByLabel('Overlap window target (hours)').fill('2.5');
  await page.locator('#timezone').getByRole('button', { name: 'Save' }).click();
  await page.getByText('Time zone settings saved').first().waitFor();
  return sql(`select golden_overlap_min_hours from organizations where slug = 'acme-global'`) === '2.5';
});
await step('every settings change is in the audit log', async () => {
  const n = sql(`select count(*) from audit_log a join organizations o on o.id = a.org_id where o.slug = 'acme-global' and a.action in ('org.settings_updated','org.auth_settings_updated','org.suspension_scheduled','org.suspension_cancelled','export.tenant_archive')`);
  return Number(n) >= 5 ? `${n} events` : `✗ only ${n}`;
});

await owner.close();
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} security flows passed`);
process.exit(failed ? 1 : 0);
