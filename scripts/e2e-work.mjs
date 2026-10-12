// Leave and time off, My day, imports (paste, CSV, Excel) and phone notifications, in real Chromium against the
// local stack. Push messages go to the local push-service stand-in and are decrypted here to check what a phone shows.
// Start the app with NODE_EXTRA_CA_CERTS=/tmp/orbit-push/cert.pem. Usage: node scripts/e2e-work.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ece = require('http_ece');
const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const PUSH = 'https://localhost:54450';
const results = [];
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 220)); }
}
async function login(browser, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
  return { ctx, page };
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  if (r.violations.length) fail(`${label}: ${r.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join('; ')}`);
}
const pushLog = () => JSON.parse(execFileSync('curl', ['-sk', `${PUSH}/log`]).toString());
const iso = (d) => d.toISOString().slice(0, 10);
const nextMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7)); return d; })();
const monday = iso(nextMonday);
const friday = iso(new Date(nextMonday.getTime() + 4 * 86_400_000));

// Known starting point.
sql(`delete from leave_requests; delete from push_subscriptions; delete from notifications where kind in ('leave_request','leave_decided','mention')`);
sql(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'elena@acme-global.demo')`);
execFileSync('curl', ['-sk', '-X', 'DELETE', `${PUSH}/log`]);
const id = (email) => sql(`select id from auth.users where email = '${email}'`);
const MEI = id('meiling@acme-global.demo');

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const mei = await login(browser, 'meiling@acme-global.demo');
const elena = await login(browser, 'elena@acme-global.demo');
for (const p of [mei.page, elena.page]) p.on('pageerror', (e) => errors.push(e.message));

// ── Leave ──
await step('a teammate requests a week off; working days are counted and managers are told', async () => {
  const p = mei.page;
  await p.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Request time off' }).click();
  await p.getByLabel('First day').fill(monday);
  await p.getByLabel('Last day').fill(friday);
  await p.getByText('5 working days').waitFor();
  await p.getByLabel('Note (optional)').fill('Family wedding in Kisumu');
  await axe(p, 'request time off dialog');
  await p.getByRole('button', { name: 'Send request' }).click();
  await p.getByText('Request sent to your managers').waitFor({ timeout: 10000 });
  await p.getByText('Waiting for approval').first().waitFor();
  const told = sql(`select count(*) from notifications where kind = 'leave_request'`);
  return Number(told) >= 2 || fail(`notified ${told}`);
});
await step('the balance shows days waiting against the 21-day allowance', async () => {
  const text = await mei.page.getByRole('region', { name: /Annual leave/ }).innerText();
  return /16 days left/.test(text) && /Waiting 5/.test(text) || fail(text.replace(/\s+/g, ' ').slice(0, 120));
});
await step('a manager sees the note, approves with a message, and the teammate hears back', async () => {
  const p = elena.page;
  await p.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  await p.getByText('“Family wedding in Kisumu”').waitFor();
  await axe(p, 'time off tab (manager)');
  await p.getByLabel('Message to Mei-Ling Chen (optional)').fill('Enjoy the wedding!');
  await p.getByRole('button', { name: 'Approve' }).click();
  await p.getByText('Time off approved').first().waitFor({ timeout: 10000 });
  return sql(`select status || '|' || decision_note from leave_requests where user_id = '${MEI}'`) === 'approved|Enjoy the wedding!'
    && sql(`select count(*) from notifications where kind = 'leave_decided' and user_id = '${MEI}'`) === '1' || fail('not approved/notified');
});
await step('everyone sees who is away, but not the type of leave or the note', async () => {
  const pr = await login(browser, 'priya@acme-global.demo');
  await pr.page.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  const away = await pr.page.getByRole('region', { name: 'Who’s away' }).innerText();
  const leak = await pr.page.getByText('Family wedding').count();
  await pr.ctx.close();
  return (/Mei-Ling Chen/.test(away) && leak === 0) || fail(`away=${/Mei-Ling/.test(away)} leak=${leak}`);
});
await step('the slot finder treats approved leave as busy', async () => {
  const r = await elena.page.request.get(`${base}/api/calendar/busy?users=${MEI}`);
  const j = await r.json();
  const blocks = j.busy?.[MEI] ?? [];
  const covers = blocks.some((b) => b.start <= Date.parse(`${monday}T12:00:00Z`) && b.end >= Date.parse(`${friday}T12:00:00Z`));
  return (j.away?.includes(MEI) && covers) || fail(JSON.stringify(j).slice(0, 160));
});
await step('the teammate can cancel upcoming leave', async () => {
  const p = mei.page;
  await p.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  await p.getByText('Approved', { exact: true }).first().waitFor();
  await p.getByRole('button', { name: 'Cancel request' }).click();
  await p.getByText('Request cancelled').waitFor({ timeout: 10000 });
  return sql(`select status from leave_requests where user_id = '${MEI}'`) === 'cancelled' || fail('still active');
});

// ── My day ──
await step('My day gathers my tasks, meetings, check-in, approvals and mentions', async () => {
  sql(`insert into leave_requests (org_id, user_id, starts_on, ends_on) select org_id, user_id, '${monday}', '${monday}' from memberships where user_id = '${id('devon@acme-global.demo')}' limit 1`);
  const p = elena.page;
  await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await p.keyboard.press('g'); await p.keyboard.press('y');
  await p.waitForURL(/\/my-day/, { timeout: 15000 });
  for (const h of ['My tasks', 'Meetings today', 'Daily check-in', 'Waiting for you', 'New mentions', 'Away today']) await p.getByRole('heading', { name: h }).waitFor();
  const waiting = await p.getByRole('region', { name: 'Waiting for you' }).innerText();
  if (!/Time-off requests\s*1/.test(waiting)) fail(`waiting: ${waiting.replace(/\s+/g, ' ')}`);
  await axe(p, 'my day');
  return true;
});

// ── Imports ──
await step('tasks pasted from a spreadsheet: columns matched, bad rows explained, good rows imported', async () => {
  const p = elena.page;
  const before = Number(sql(`select count(*) from tasks`));
  await p.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Import tasks' }).click();
  const box = p.getByLabel('Or paste rows here');
  await box.fill(['Task\tAssignee email\tDue date\tPriority', 'Close October books\tmeiling@acme-global.demo\t31/10/2026\tHigh',
    'Update price list\t\t\t', '\tnobody@nowhere.test\tsoon\turgent-ish'].join('\n'));
  await box.blur();
  await p.getByText('2 ready · 1 with problems').waitFor();
  await p.getByText(/Title is required.*Not a member of this workspace.*Use a date like 2026-11-30/).waitFor();
  await axe(p, 'import preview');
  await p.getByRole('button', { name: 'Import 2 rows' }).click();
  await p.getByText('Tasks created: 2').waitFor({ timeout: 15000 });
  const t = sql(`select priority || '|' || due_on || '|' || (assignee_id = '${MEI}') from tasks where title = 'Close October books'`);
  return (Number(sql(`select count(*) from tasks`)) === before + 2 && t === 'high|2026-10-31|true') || fail(t);
});
await step('people from an Excel file become invitations with job title and department', async () => {
  const xlsx = '/tmp/orbit-import-people.xlsx';
  execFileSync('python3', ['-c', `import openpyxl
wb = openpyxl.Workbook(); ws = wb.active
ws.append(['Email', 'Role', 'Job title', 'Department'])
ws.append(['akinyi@acme-global.demo', 'contributor', 'Accountant', 'Finance'])
ws.append(['otieno@acme-global.demo', 'auditor', 'External auditor', ''])
ws.append(['not-an-email', 'director', '', ''])
wb.save('${xlsx}')`]);
  const p = elena.page;
  await p.goto(`${base}/settings?section=members`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Import people' }).click();
  await p.locator('input[type=file]').setInputFiles(xlsx);
  await p.getByText('2 ready · 1 with problems').waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: 'Import 2 rows' }).click();
  await p.getByText(/Invitations created: 2/).waitFor({ timeout: 20000 });
  const inv = sql(`select string_agg(email || ':' || role || ':' || coalesce(title,'') || ':' || coalesce(department,''), ',' order by email) from invites where email in ('akinyi@acme-global.demo','otieno@acme-global.demo')`);
  return inv === 'akinyi@acme-global.demo:contributor:Accountant:Finance,otieno@acme-global.demo:auditor:External auditor:' || fail(inv);
});
await step('imports are checked again on the server (contributors can’t invite; bad rows refused)', async () => {
  const a = await mei.page.request.post(`${base}/api/import/people`, { headers: { origin: base }, data: { rows: [{ email: 'x@y.co', role: 'contributor' }] } });
  const b = await elena.page.request.post(`${base}/api/import/tasks`, { headers: { origin: base }, data: { rows: [{ title: '', priority: 'high', status: 'todo', points: 1, tags: [] }] } });
  const c = await elena.page.request.post(`${base}/api/import/tasks`, { headers: { origin: base }, data: { rows: [{ title: 'Sneaky', assignee_email: 'dave@other.test', priority: 'high', status: 'todo', points: 1, tags: [] }] } });
  return (a.status() === 403 && b.status() === 400 && c.status() === 400) || fail(`${a.status()} ${b.status()} ${c.status()}`);
});
await step('people imports respect the seat limit', async () => {
  const free = Number(sql(`select seat_limit - (select count(*) from memberships m where m.org_id = o.id and m.status = 'active') - (select count(*) from invites i where i.org_id = o.id and accepted_at is null and expires_at > now()) from organizations o where slug = 'acme-global'`));
  const rows = Array.from({ length: Math.min(free + 1, 200) }, (_, i) => ({ email: `seat${i}@acme-global.demo`, role: 'contributor' }));
  if (rows.length <= free) return `skipped (${free} seats free)`;
  const r = await elena.page.request.post(`${base}/api/import/people`, { headers: { origin: base }, data: { rows } });
  return r.status() === 409 || fail(`status ${r.status()}`);
});

// ── Push ──
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const authSecret = randomBytes(16);
const sub = (endpoint) => ({ endpoint, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: authSecret.toString('base64url') } });
const decrypt = (b64) => JSON.parse(ece.decrypt(Buffer.from(b64, 'base64'), { version: 'aes128gcm', privateKey: ecdh, authSecret }).toString());

await step('Profile turns on notifications for this device', async () => {
  await mei.ctx.grantPermissions(['notifications'], { origin: base });
  await mei.page.addInitScript(([s]) => {
    // Headless Chrome can't reach a real push service; hand back a subscription that points at the local stand-in.
    PushManager.prototype.subscribe = async function () { return { endpoint: s.endpoint, toJSON: () => s, unsubscribe: async () => true }; };
    PushManager.prototype.getSubscription = async function () { return window.__orbitSub ?? null; };
  }, [sub(`${PUSH}/sub/mei-phone`)]);
  await mei.page.goto(`${base}/profile#push`, { waitUntil: 'networkidle' });
  await mei.page.getByRole('button', { name: 'Turn on', exact: true }).click();
  await mei.page.getByText('Notifications turned on').waitFor({ timeout: 15000 });
  await axe(mei.page, 'profile with notifications');
  return sql(`select count(*) from push_subscriptions where user_id = '${MEI}'`) === '1' || fail('not saved');
});
await step('"Send a test" arrives encrypted, with the right title', async () => {
  const r = await mei.page.request.post(`${base}/api/push/test`, { headers: { origin: base } });
  if (!r.ok()) fail(`status ${r.status()}`);
  const got = pushLog().find((x) => x.id === 'mei-phone');
  if (!got) fail('nothing reached the push service');
  if (got.headers.encoding !== 'aes128gcm' || !/^vapid t=/.test(got.headers.authorization)) fail(JSON.stringify(got.headers));
  const msg = decrypt(got.body);
  return msg.title === 'OrbitOS notifications are on' || fail(JSON.stringify(msg));
});
await step('a mention pushed through the database webhook, in the reader’s language, once', async () => {
  execFileSync('curl', ['-sk', '-X', 'DELETE', `${PUSH}/log`]);
  sql(`update profiles set language = 'fr' where id = '${MEI}'`);
  const task = sql(`select id from tasks where title = 'Close October books'`);
  await elena.page.goto(`${base}/operations/tasks/${task}`, { waitUntil: 'networkidle' });
  const box = elena.page.getByRole('combobox', { name: 'Add a comment' });
  await box.click(); await box.pressSequentially('Over to you @mei');
  await elena.page.getByRole('option', { name: 'Mei-Ling Chen' }).click();
  await elena.page.getByRole('button', { name: 'Comment', exact: true }).click();
  await elena.page.getByText('Comment posted').waitFor({ timeout: 10000 });
  const nid = sql(`select id from notifications where kind = 'mention' and user_id = '${MEI}' order by created_at desc limit 1`);
  const hook = (secret) => elena.page.request.post(`${base}/api/webhooks/push`, { headers: { authorization: `Bearer ${secret}` }, data: { type: 'INSERT', table: 'notifications', record: { id: nid } } });
  if ((await hook('wrong')).status() !== 401) fail('webhook accepted a wrong secret');
  const first = await (await hook('local-push-secret')).json();
  const again = await (await hook('local-push-secret')).json();
  sql(`update profiles set language = 'en' where id = '${MEI}'`);
  const got = pushLog().filter((x) => x.id === 'mei-phone');
  const msg = got[0] ? decrypt(got[0].body) : {};
  return (first.sent === 1 && again.sent === 0 && got.length === 1 && msg.title === 'Elena Kamau vous a mentionné sur « Close October books »' && msg.url.startsWith(`/operations/tasks/${task}`))
    || fail(JSON.stringify({ first, again, n: got.length, msg }));
});
await step('the hourly catch-up pushes anything the webhook missed', async () => {
  execFileSync('curl', ['-sk', '-X', 'DELETE', `${PUSH}/log`]);
  sql(`select public._notify((select org_id from memberships where user_id = '${MEI}' limit 1), '${MEI}', 'task_assigned', 'New task assigned', 'Catch-up check', '/operations')`);
  const cron = readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.*)$/m)[1];
  const r = await (await elena.page.request.get(`${base}/api/cron/push`, { headers: { authorization: `Bearer ${cron}` } })).json();
  const got = pushLog().filter((x) => x.id === 'mei-phone').map((x) => decrypt(x.body));
  return (r.pushed >= 1 && got.some((m) => m.body === 'Catch-up check')) || fail(JSON.stringify(r));
});
await step('devices the push service says are gone are removed', async () => {
  const r = await mei.page.request.post(`${base}/api/push/subscribe`, { headers: { origin: base }, data: sub(`${PUSH}/sub/gone-old-phone`) });
  if (!r.ok()) fail(`subscribe ${r.status()}`);
  await mei.page.request.post(`${base}/api/push/test`, { headers: { origin: base } });
  return sql(`select count(*) from push_subscriptions where endpoint like '%gone-old-phone'`) === '0' || fail('still stored');
});
await step('push endpoints must be https and belong to the caller', async () => {
  const bad = await mei.page.request.post(`${base}/api/push/subscribe`, { headers: { origin: base }, data: sub('http://evil.example/x') });
  const anon = await (await browser.newContext()).request.post(`${base}/api/push/subscribe`, { headers: { origin: base }, data: sub(`${PUSH}/sub/anon`) });
  return (bad.status() === 400 && anon.status() === 401) || fail(`${bad.status()} ${anon.status()}`);
});

await step('no browser errors on these screens', async () => errors.length === 0 || fail(errors.slice(0, 3).join(' | ')));
await browser.close();
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} work checks passed`);
process.exit(passed === results.length ? 0 : 1);
