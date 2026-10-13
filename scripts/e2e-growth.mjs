// Founder-side automations end to end, in real Chromium against the local stack (email and AI stand-ins):
// trial follow-up emails, lapsed and failed payment emails, unsubscribe, the help centre and its assistant,
// at-risk customers and the weekly summary in the Founder Console.
// Usage: node scripts/e2e-growth.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const base = process.argv[2] || 'http://localhost:3000';
const EMAIL = 'http://localhost:54460';
const PW = 'OrbitOS-demo-2026';
const CRON = process.env.CRON_SECRET || 'local-cron-secret';
const FOUNDER = 'priya@acme-global.demo';
const results = [];
const sqlRaw = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const sql = (q) => sqlRaw(q).split('\n')[0];
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 260)); }
}
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
  return { ctx, page };
}
async function axe(page, label, include) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  if (r.violations.length) fail(`${label}: ${r.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join('; ')}`);
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
const runJob = async () => {
  const r = await fetch(`${base}/api/cron/lifecycle`, { headers: { authorization: `Bearer ${CRON}` } });
  const body = await r.json();
  if (r.status !== 200) fail(`job ${r.status}: ${JSON.stringify(body)}`);
  return body;
};
const mail = async (to) => (await (await fetch(`${EMAIL}/log`)).json()).filter((m) => !to || m.to.includes(to));

// Emails go out on weekdays 09:00–17:00 in the owner's time zone: put the test owner somewhere it's mid-morning on a weekday.
function workingZone() {
  for (let n = -12; n <= 12; n++) {
    const tz = n === 0 ? 'UTC' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    if (Number(parts.hour) >= 10 && Number(parts.hour) <= 14 && !['Sat', 'Sun'].includes(parts.weekday)) return tz;
  }
  return null;
}
const TZ = workingZone();
if (!TZ) { console.log('No weekday time zone at mid-morning right now; try again later.'); process.exit(1); }

// ── A fresh trial workspace owned by Kiran ──
const KIRAN = sql(`select id from auth.users where email = 'kiran@acme-global.demo'`);
const KIRAN_EMAIL = 'kiran@acme-global.demo';
const KIRAN_TZ = sql(`select timezone from profiles where id = '${KIRAN}'`);
sqlRaw(`delete from lifecycle_log; delete from help_questions; delete from organizations where slug = 'e2e-trial-co';
  update profiles set timezone = '${TZ}', language = 'en', product_emails = true where id = '${KIRAN}'`);
const ORG = sql(`insert into organizations (name, slug, owner_id, plan, plan_period, created_at, plan_expires_at)
  values ('Trial Co', 'e2e-trial-co', '${KIRAN}', 'pro', 'trial', now() - interval '1 day 2 hours', now() + interval '13 days') returning id`);
sql(`insert into memberships (org_id, user_id, role) values ('${ORG}', '${KIRAN}', 'owner')`);
await fetch(`${EMAIL}/log`, { method: 'DELETE' });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

// ── Trial follow-up ──
let unsubscribeUrl = '';
await step('trial day 1: the owner gets a welcome with three first steps, once, with a working unsubscribe link', async () => {
  await runJob(); await runJob();
  const m = await mail(KIRAN_EMAIL);
  if (m.length !== 1) fail(`${m.length} emails`);
  if (!/Welcome to OrbitOS — 3 things to do first in Trial Co/.test(m[0].subject)) fail(m[0].subject);
  if (!/Invite your team/.test(m[0].html)) fail('no first steps');
  unsubscribeUrl = (m[0].html.match(/href="([^"]*\/api\/email\/unsubscribe[^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&');
  return unsubscribeUrl ? 'welcome sent once' : fail('no unsubscribe link');
});
await step('trial day 3: a solo owner is nudged to invite the team (in their language)', async () => {
  sql(`update profiles set language = 'sw' where id = '${KIRAN}'`);
  sql(`update organizations set created_at = now() - interval '3 days 2 hours' where id = '${ORG}'`);
  await runJob();
  sql(`update profiles set language = 'en' where id = '${KIRAN}'`);
  const m = await mail(KIRAN_EMAIL);
  return m.length === 2 && /ni bora zaidi ukiwa na timu yako/.test(m[1].subject) ? m[1].subject : fail(m.map((x) => x.subject).join(' | '));
});
await step('unsubscribe: opening the link changes nothing until the button is pressed; a forged link is refused', async () => {
  const p = await (await browser.newContext()).newPage();
  watch(p);
  await p.goto(unsubscribeUrl.replace(/^https?:\/\/[^/]+/, base), { waitUntil: 'networkidle' });
  const before = sql(`select product_emails from profiles where id = '${KIRAN}'`);
  await axe(p, 'unsubscribe page');
  await p.getByRole('button', { name: 'Stop tips and follow-up emails' }).click();
  await p.getByRole('heading', { name: 'You won’t get tips and follow-up emails' }).waitFor();
  const after = sql(`select product_emails from profiles where id = '${KIRAN}'`);
  const forged = await fetch(`${base}/api/email/unsubscribe?u=${sql(`select id from auth.users where email = 'sam@acme-global.demo'`)}&s=${'A'.repeat(32)}`);
  await p.context().close();
  if (before !== 't' || after !== 'f') fail(`before ${before}, after ${after}`);
  return forged.status === 400 || fail(`forged link → ${forged.status}`);
});
await step('after unsubscribing, tips stop — but the “trial ends soon” notice still arrives', async () => {
  sql(`update organizations set created_at = now() - interval '7 days 2 hours' where id = '${ORG}'`);
  await runJob();
  const tips = (await mail(KIRAN_EMAIL)).length;
  sql(`update organizations set plan_expires_at = now() + interval '1 day 20 hours' where id = '${ORG}'`);
  await runJob();
  const m = await mail(KIRAN_EMAIL);
  if (tips !== 2) fail(`a tip was sent after unsubscribing (${tips})`);
  if (m.length !== 3 || !/Your OrbitOS trial for Trial Co ends on/.test(m[2].subject)) fail(m.map((x) => x.subject).join(' | '));
  if (!/KES\s?4,900/.test(m[2].html) || !/settings\/billing/.test(m[2].html)) fail('no price or billing link');
  return m[2].subject;
});
await step('the person can switch tips back on in their Profile', async () => {
  const k = await login(browser, KIRAN_EMAIL);
  watch(k.page);
  await k.page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  const sw = k.page.getByRole('switch', { name: 'Tips and follow-up emails' });
  if ((await sw.getAttribute('aria-checked')) !== 'false') fail('switch should show off');
  await sw.click();
  await k.page.waitForTimeout(800);
  await k.ctx.close();
  return sql(`select product_emails from profiles where id = '${KIRAN}'`) === 't' || fail('not saved');
});

// ── Payments ──
await step('a lapsed trial: the owner is told the workspace is read-only and nothing is lost, once per stage', async () => {
  sql(`update organizations set plan_expires_at = now() - interval '2 days' where id = '${ORG}'`);
  await runJob(); await runJob();
  const m = (await mail(KIRAN_EMAIL)).filter((x) => /has ended|has run out/.test(x.subject));
  if (m.length !== 1 || !/Your OrbitOS trial for Trial Co has ended/.test(m[0].subject)) fail(m.map((x) => x.subject).join(' | '));
  return /Nothing has been deleted/.test(m[0].html) ? m[0].subject : fail('no reassurance');
});
await step('a failed M-Pesa payment: the payer gets the likely reasons and a retry link; a newer attempt cancels it', async () => {
  sql(`insert into billing_payments (org_id, created_by, plan, period, seats, amount_minor, currency, method, api_ref, state)
    values ('${ORG}', '${KIRAN}', 'starter', 'monthly', 10, 490000, 'KES', 'MPESA', 'e2e-fail-${Date.now()}', 'FAILED')`);
  const second = sql(`insert into billing_payments (org_id, created_by, plan, period, seats, amount_minor, currency, method, api_ref, state, created_at)
    values ('${ORG}', '${KIRAN}', 'starter', 'monthly', 10, 490000, 'KES', 'CARD', 'e2e-fail2-${Date.now()}', 'FAILED', now() - interval '1 hour') returning id`);
  await runJob(); await runJob();
  const m = (await mail(KIRAN_EMAIL)).filter((x) => /didn’t go through/.test(x.subject));
  const loggedSecond = Number(sql(`select count(*) from lifecycle_log where ref = '${second}'`));
  if (m.length !== 1) fail(`${m.length} payment emails (the older failure had a newer attempt)`);
  if (!/PIN/.test(m[0].html) || !/KES\s?4,900/.test(m[0].html)) fail('reasons or amount missing');
  return loggedSecond === 0 ? m[0].subject : fail('older failure was emailed');
});

// ── Help centre ──
await step('help centre: articles, search, and an answer drawn from the articles with links to them', async () => {
  const s = await login(browser, 'sam@acme-global.demo');
  watch(s.page);
  const p = s.page;
  await p.getByRole('link', { name: 'Help', exact: true }).first().click();
  await p.waitForURL((u) => u.pathname === '/help');
  await p.getByRole('heading', { name: 'Help centre' }).waitFor();
  await axe(p, 'help centre');
  await p.getByRole('searchbox', { name: 'Search help' }).fill('passkey');
  await p.getByText('1 articles').or(p.getByText('Security and signing in')).first().waitFor();
  if (await p.getByText('Time off and handover').count()) fail('search did not filter');
  await p.getByRole('searchbox', { name: 'Search help' }).fill('');
  await p.getByRole('textbox', { name: 'Ask a question' }).fill('How do I renew our plan with M-Pesa?');
  await p.getByRole('button', { name: 'Ask', exact: true }).click();
  const ans = p.getByTestId('help-answer');
  await ans.getByText(/^Mock answer \(English\)/).waitFor({ timeout: 20000 });
  await ans.getByText('Answers are written by AI').waitFor();
  await ans.getByRole('button', { name: /Plans, payment and renewal/ }).click();
  await p.locator('#help-billing details[open]').waitFor();
  await axe(p, 'help answer');
  await s.ctx.close();
  return sql(`select answered::text || '|' || array_to_string(sources, ',') from help_questions order by created_at desc limit 1`) === 'true|billing' || fail('not recorded');
});
await step('help centre: a question the articles don’t cover says so, suggests articles and how to get help', async () => {
  const s = await login(browser, 'sam@acme-global.demo');
  await s.page.goto(`${base}/help`, { waitUntil: 'networkidle' });
  await s.page.getByRole('textbox', { name: 'Ask a question' }).fill('Where is the best pizza in Nairobi?');
  await s.page.getByRole('button', { name: 'Ask', exact: true }).click();
  await s.page.getByText('I couldn’t find that in the help articles.').waitFor({ timeout: 20000 });
  await s.page.getByText(/Still stuck\?/).waitFor();
  await s.ctx.close();
  return sql(`select answered::text from help_questions order by created_at desc limit 1`) === 'false' || fail('should be recorded as not covered');
});
await step('help centre in Kiswahili: articles and the answer are in Kiswahili; search finds it', async () => {
  sql(`update profiles set language = 'sw' where email = 'lukas@acme-global.demo'`);
  try {
    const l = await login(browser, 'lukas@acme-global.demo');
    watch(l.page);
    await l.page.waitForLoadState('networkidle');
    await l.page.locator('[data-tour="search"]').first().click();
    await l.page.keyboard.type('msaada');
    await l.page.getByRole('option', { name: 'Kituo cha msaada' }).click({ timeout: 8000 }).catch(async (e) => {
      throw new Error(`${e.message.split('\n')[0]} · url ${l.page.url()} · options ${JSON.stringify(await l.page.getByRole('option').allTextContents())} · focus ${await l.page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('aria-label') ?? ''))}`);
    });
    await l.page.waitForURL((u) => u.pathname === '/help');
    await l.page.getByRole('heading', { name: 'Kituo cha msaada' }).waitFor();
    await l.page.getByText('Likizo na makabidhiano').waitFor();
    await l.page.getByRole('textbox', { name: 'Uliza swali' }).fill('Ninaombaje likizo na makabidhiano?');
    await l.page.getByRole('button', { name: 'Uliza', exact: true }).click();
    const t = await l.page.getByTestId('help-answer').getByText(/Mock answer \(Kiswahili\)/).textContent({ timeout: 20000 });
    await axe(l.page, 'help (sw)');
    await l.ctx.close();
    return t.slice(0, 80);
  } finally { sql(`update profiles set language = 'en' where email = 'lukas@acme-global.demo'`); }
});
await step('help assistant: signed-in only, limited question length', async () => {
  const anon = await fetch(`${base}/api/help/ask`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ question: 'hello there' }) });
  const s = await login(browser, 'sam@acme-global.demo');
  const long = await s.page.evaluate(async () => (await fetch('/api/help/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'x'.repeat(501) }) })).status);
  await s.ctx.close();
  return (anon.status === 401 && long === 400) || fail(`anon ${anon.status}, long ${long}`);
});

// ── Founder Console ──
await step('Founder Console: customers to call (with why), what customers ask, and the weekly summary on demand', async () => {
  sql(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${FOUNDER}')`);
  const f = await login(browser, FOUNDER, { viewport: { width: 1360, height: 950 } });
  watch(f.page);
  const p = f.page;
  await p.goto(`${base}/founder`, { waitUntil: 'networkidle' });
  const secret = (await p.locator('code').first().textContent()).trim();
  await p.getByLabel('6-digit code').fill(totp(secret));
  await p.getByRole('button', { name: 'Verify' }).click();
  await p.waitForURL((u) => u.pathname === '/founder', { timeout: 20000 });
  const risk = p.getByTestId('at-risk');
  await risk.getByText('Trial Co').waitFor();
  const row = risk.locator('li', { hasText: 'Trial Co' });
  const why = await row.getByText(/Payment failed|Plan ran out/).textContent();
  await row.getByRole('link', { name: /Kiran/ }).waitFor();
  await p.getByTestId('help-questions').getByText('“Where is the best pizza in Nairobi?”').waitFor();
  await p.getByTestId('help-questions').getByText('Not covered').first().waitFor();
  await axe(p, 'founder console', '#risk-h');
  const before = (await mail(FOUNDER)).length;
  await p.getByRole('button', { name: 'Email me this week’s summary' }).click();
  await p.getByText('Weekly summary sent to your inbox').waitFor();
  await f.ctx.close();
  const m = (await mail(FOUNDER)).slice(before);
  if (m.length !== 1) fail(`${m.length} summaries`);
  for (const s of ['New workspaces', 'Customers to call', 'Trial Co', 'Questions the help centre couldn’t answer', 'pizza', 'Platform health']) if (!m[0].html.includes(s)) fail(`summary lacks “${s}”`);
  const audited = Number(sql(`select count(*) from platform_audit where action = 'founder.weekly_sent'`));
  return audited ? `${why}; “${m[0].subject}”` : fail('not audited');
});
await step('the weekly summary endpoint is invisible to everyone else', async () => {
  const s = await login(browser, 'elena@acme-global.demo');
  const st = await s.page.evaluate(async () => (await fetch('/api/founder/weekly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
  await s.ctx.close();
  return st === 404 || fail(`owner of another workspace got ${st}`);
});
await step('no JavaScript errors on any page', async () => (errors.length ? fail(errors.slice(0, 3).join(' | ')) : true));

await browser.close();
sqlRaw(`delete from organizations where slug = 'e2e-trial-co'; delete from lifecycle_log; delete from help_questions; update profiles set timezone = '${KIRAN_TZ}' where id = '${KIRAN}';
  update profiles set language = 'en', product_emails = true; delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${FOUNDER}')`);
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} growth checks passed`);
process.exit(failed ? 1 : 0);
