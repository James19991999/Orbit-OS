// Getting-started checklist, search (Ctrl+K), keyboard shortcuts, task comments with @mentions, and undo,
// in real Chromium against the local stack. Usage: node scripts/e2e-ux.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';

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
async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
  return page;
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  if (r.violations.length) fail(`${label}: ${r.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join('; ')}`);
}

// Known starting point (other suites may have turned on two-factor for Elena).
sql(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'elena@acme-global.demo')`);
const invoiceNo = sql(`select number from invoices i join organizations o on o.id = i.org_id where o.slug = 'acme-global' order by issued_on desc limit 1`);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const ownerCtx = await browser.newContext();
const page = await login(ownerCtx, 'elena@acme-global.demo');
page.on('pageerror', (e) => errors.push(e.message));
const task = sql(`select id || '|' || title from tasks where title = 'Mobile wireframes for Q4' limit 1`).split('|');
sql(`delete from task_comments where task_id = '${task[0]}'`);
sql(`delete from notifications where kind in ('mention', 'task_comment')`);

// ── 1. Getting started ──
await step('owners see a getting-started checklist ticked from real data', async () => {
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const region = page.getByRole('region', { name: 'Welcome to OrbitOS.' });
  await region.waitFor({ timeout: 15000 });
  const text = await region.innerText();
  if (!/of 6 done/.test(text)) fail(`progress missing: ${text.slice(0, 120)}`);
  const invite = region.getByRole('link', { name: /Invite your team \(Done\)/ });
  const mfa = region.getByRole('link', { name: /^Turn on two-factor sign-in$/ });
  if (!(await invite.count()) || !(await mfa.count())) fail('expected invite done and two-factor pending');
  await axe(page, 'dashboard with checklist');
  return text.match(/\d of 6 done/)[0];
});
await step('the checklist can be hidden and stays hidden', async () => {
  await page.getByRole('button', { name: 'Hide the getting-started checklist' }).click();
  await page.getByRole('region', { name: 'Welcome to OrbitOS.' }).waitFor({ state: 'detached', timeout: 10000 });
  await page.reload({ waitUntil: 'networkidle' });
  return (await page.getByRole('region', { name: 'Welcome to OrbitOS.' }).count()) === 0 || fail('came back after reload');
});
await step('contributors don’t get the setup checklist', async () => {
  const c = await browser.newContext();
  const p = await login(c, 'meiling@acme-global.demo');
  await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const n = await p.getByText('A few steps to get your team running on OrbitOS.').count();
  await c.close();
  return n === 0 || fail('checklist shown to a contributor');
});

// ── 2. Search ──
await step('Ctrl+K opens search; typing finds a task; Enter opens it', async () => {
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Search OrbitOS' });
  await box.waitFor();
  await box.fill('wirefr');
  await page.getByRole('option', { name: /Mobile wireframes for Q4/ }).waitFor({ timeout: 10000 });
  await axe(page, 'search open with results');
  await page.keyboard.press('Enter');
  await page.waitForURL(new RegExp(`/operations/tasks/${task[0]}`), { timeout: 15000 });
  return true;
});
await step('search finds people and invoices for an owner, and pages and actions by name', async () => {
  await page.keyboard.press('/');
  const box = page.getByRole('combobox', { name: 'Search OrbitOS' });
  await box.fill('devon');
  await page.getByRole('option', { name: /Devon Vance/ }).waitFor({ timeout: 10000 });
  await box.fill(invoiceNo.slice(-4));
  await page.getByRole('option', { name: new RegExp(invoiceNo) }).waitFor({ timeout: 10000 });
  await box.fill('repor');
  await page.getByRole('option', { name: 'Reports' }).waitFor();
  await page.keyboard.press('Escape');
  return true;
});
await step('a contributor’s search never returns invoices (finance stays hidden)', async () => {
  const c = await browser.newContext();
  const p = await login(c, 'meiling@acme-global.demo');
  const r = await p.request.get(`${base}/api/search?q=INV-2026`);
  const body = await r.json();
  await c.close();
  return (r.ok() && !body.hits.some((h) => h.type === 'invoice')) || fail(JSON.stringify(body).slice(0, 160));
});
await step('search refuses signed-out callers and odd input', async () => {
  const anon = await (await browser.newContext()).request.get(`${base}/api/search?q=wire`);
  const short = await page.request.get(`${base}/api/search?q=a`);
  const tricky = await page.request.get(`${base}/api/search?q=${encodeURIComponent('%_,)(or.')}`);
  return (anon.status() === 401 && short.status() === 400 && tricky.ok()) || fail(`${anon.status()} ${short.status()} ${tricky.status()}`);
});

// ── 3. Shortcuts ──
await step('keyboard: ? shows the shortcuts, G then O opens Operations, N starts a new task', async () => {
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Shift+?');
  await page.getByRole('heading', { name: 'Keyboard shortcuts' }).waitFor();
  await axe(page, 'shortcuts dialog');
  await page.keyboard.press('Escape');
  await page.keyboard.press('g'); await page.keyboard.press('o');
  await page.waitForURL(/\/operations/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('n');
  await page.getByRole('heading', { name: 'Create task' }).waitFor({ timeout: 15000 });
  await page.keyboard.press('Escape');
  return true;
});
await step('shortcuts don’t fire while typing', async () => {
  await page.goto(`${base}/people`, { waitUntil: 'networkidle' });
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('g o n');
  await page.waitForTimeout(800);
  return new URL(page.url()).pathname === '/people' || fail(`navigated to ${page.url()}`);
});

// ── 4. Comments ──
await step('comment with an @mention picked from suggestions', async () => {
  await page.goto(`${base}/operations/tasks/${task[0]}`, { waitUntil: 'networkidle' });
  const box = page.getByRole('combobox', { name: 'Add a comment' });
  await box.click();
  await box.pressSequentially('Can you review this @dev');
  await page.getByRole('option', { name: 'Devon Vance' }).waitFor();
  await page.keyboard.press('Enter');
  await box.pressSequentially('today?');
  if ((await box.inputValue()) !== 'Can you review this @Devon Vance today?') fail(`text: ${await box.inputValue()}`);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await page.getByText('Comment posted').waitFor({ timeout: 10000 });
  await page.locator('#comments li').filter({ hasText: 'today?' }).getByText('@Devon Vance').waitFor();
  await axe(page, 'task page with comments');
  return true;
});
await step('the mentioned teammate is notified, in their language', async () => {
  const n = sql(`select count(*) from notifications n join profiles p on p.id = n.user_id where p.full_name = 'Devon Vance' and n.kind = 'mention'`);
  if (n !== '1') fail(`mention notifications: ${n}`);
  const c = await browser.newContext();
  const p = await login(c, 'devon@acme-global.demo');
  sql(`update profiles set language = 'sw' where full_name = 'Devon Vance'`);
  await c.addCookies([{ name: 'orbit_lang', value: 'sw', url: base }]);
  await p.goto(`${base}/notifications`, { waitUntil: 'networkidle' });
  const seen = await p.getByText(/Elena Kamau amekutaja kwenye “Mobile wireframes for Q4”/).count();
  sql(`update profiles set language = 'en' where full_name = 'Devon Vance'`);
  await c.close();
  return seen > 0 || fail('Kiswahili mention text not shown');
});
await step('an auditor can read comments but not post', async () => {
  const c = await browser.newContext();
  const p = await login(c, 'priya@acme-global.demo');
  await p.goto(`${base}/operations/tasks/${task[0]}`, { waitUntil: 'networkidle' });
  const read = await p.locator('#comments').getByText('today?').count();
  const box = await p.getByRole('combobox', { name: 'Add a comment' }).count();
  await c.close();
  return (read === 1 && box === 0) || fail(`read=${read} box=${box}`);
});

// ── 5. Undo ──
let beforeDelete = '';
await step('deleting a task needs no confirmation, and Undo brings it back with its comments', async () => {
  await page.goto(`${base}/operations/tasks/${task[0]}`, { waitUntil: 'networkidle' });
  beforeDelete = sql('select now()');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForURL(/\/operations$/, { timeout: 15000 });
  if (sql(`select count(*) from tasks where id = '${task[0]}'`) !== '0') fail('task still there');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByText('Task restored').waitFor({ timeout: 10000 });
  await page.waitForURL(new RegExp(`/operations/tasks/${task[0]}`), { timeout: 15000 });
  await page.locator('#comments').getByText('today?').waitFor();
  const back = sql(`select count(*) from tasks where id = '${task[0]}'`) === '1' && sql(`select count(*) from task_comments where task_id = '${task[0]}'`) === '1';
  return back || fail('task or comment missing after undo');
});
await step('undo doesn’t send "new task" notifications again', async () => {
  const n = sql(`select count(*) from notifications where kind = 'task_assigned' and link = '/operations/tasks/${task[0]}' and created_at > '${beforeDelete}'`);
  return n === '0' || fail(`${n} new notifications`);
});

await step('no browser errors on any of these screens', async () => errors.length === 0 || fail(errors.slice(0, 3).join(' | ')));

await browser.close();
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} UX checks passed`);
process.exit(passed === results.length ? 0 : 1);
