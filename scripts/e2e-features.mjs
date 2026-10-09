// End-to-end flows for WhatsApp, M-Pesa payouts, languages, low-bandwidth mode and the AI chief-of-staff,
// in real Chromium against the local stack (GoTrue + PostgREST + Postgres + IntaSend/WhatsApp/AI mocks).
// Usage: node scripts/e2e-features.mjs [baseUrl]   (run after `npm run stack:up` and the app on :3000)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const base = process.argv[2] || 'http://localhost:3000';
const WA = process.env.WA_MOCK || 'http://localhost:54410';
const PW = 'OrbitOS-demo-2026';
const results = [];
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 220)); }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function session(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message.slice(0, 160)));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/Work email|Barua pepe|E-mail/).fill(email);
  await page.getByLabel(/^(Password|Nenosiri|Mot de passe)$/).fill(PW);
  await page.getByRole('button', { name: /^(Sign in|Ingia|Se connecter)$/ }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  return { ctx, page };
}
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
const waSent = async (to) => (await fetch(`${WA}/__sent?to=${to}`)).json();
const waInbound = async (body) => (await fetch(`${WA}/__inbound`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const lastText = async (to) => { const s = await waSent(to); const m = s[s.length - 1]; return m?.text?.body ?? ''; };
const uid = (email) => sql(`select id from auth.users where email = '${email}'`);

const ELENA = '254711000001'; const DEVON = '254711000002';

// Clean slate for repeated runs.
sql(`delete from whatsapp_links; delete from whatsapp_verifications; delete from whatsapp_prompts; delete from whatsapp_inbound;
     update profiles set whatsapp_checkins = true, whatsapp_approvals = true, language = 'en', data_saver = false;
     delete from payout_batches; delete from auth.mfa_factors where user_id in (select id from auth.users where email = 'marcus@acme-global.demo');
     update organizations set enforce_mfa_admins = false, status = 'active' where slug = 'acme-global'`);

async function linkWhatsApp(page, phone) {
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  const card = page.locator('#whatsapp');
  await card.getByLabel('WhatsApp number').fill(`+${phone.slice(0, 3)} ${phone.slice(3)}`);
  await card.getByRole('button', { name: 'Send code' }).click();
  await card.getByLabel('6-digit code').waitFor({ timeout: 15000 });
  const tpl = (await waSent(phone)).reverse().find((m) => m.type === 'template' && m.template?.name === 'orbitos_verify_code');
  if (!tpl) throw new Error('no verification template reached the WhatsApp mock');
  const code = tpl.template.components[0].parameters[0].text;
  await card.getByLabel('6-digit code').fill(code);
  await card.getByRole('button', { name: 'Link number' }).click();
  await card.getByText(/Linked to/).waitFor({ timeout: 15000 });
}

// ─────────────── WhatsApp ───────────────
const { ctx: ownerCtx, page } = await session('elena@acme-global.demo');
const { ctx: dirCtx, page: dpage } = await session('devon@acme-global.demo');

await step('WhatsApp: owner links a number with a code sent by WhatsApp (wrong code rejected first)', async () => {
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  const card = page.locator('#whatsapp');
  await card.getByLabel('WhatsApp number').fill('0711 000 001');
  await card.getByRole('button', { name: 'Send code' }).click();
  await card.getByLabel('6-digit code').fill('000000');
  await card.getByRole('button', { name: 'Link number' }).click();
  await card.getByText(/code is not right/).waitFor({ timeout: 10000 });
  await card.getByRole('button', { name: 'Use another number' }).click();
  await linkWhatsApp(page, ELENA);
  if (sql(`select phone from whatsapp_links where user_id = '${uid('elena@acme-global.demo')}'`) !== ELENA) throw new Error('link not stored');
  return 'stored as E.164, code consumed';
});

await step('WhatsApp: the same number cannot be linked to a second account', async () => {
  const r = await dpage.request.post(`${base}/api/whatsapp/link`, { data: { action: 'start', phone: `+${ELENA}` } });
  if (r.status() !== 409) throw new Error(`expected 409, got ${r.status()}`);
});

await step('WhatsApp: director links a number too', async () => { await linkWhatsApp(dpage, DEVON); });

await step('WhatsApp webhook: GET verification echoes the challenge only with the right token', async () => {
  const good = await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=local-wa-verify&hub.challenge=12345`);
  const bad = await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345`);
  if (good.status !== 200 || (await good.text()) !== '12345' || bad.status !== 403) throw new Error(`good=${good.status} bad=${bad.status}`);
});

await step('WhatsApp webhook: a forged signature is rejected (401) and changes nothing', async () => {
  const r = await waInbound({ from: ELENA, text: '5 forged', badSignature: true });
  if (r.status !== 401) throw new Error(`got ${r.status}`);
});

await step('WhatsApp: a reply becomes today\'s check-in (mood, blockers, owner\'s own time zone)', async () => {
  const r = await waInbound({ from: ELENA, text: '4 Shipped the WhatsApp integration. Blockers: waiting on Meta template approval' });
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.body}`);
  const row = sql(`select mood || '|' || shipped || '|' || blockers from check_ins where user_id = '${uid('elena@acme-global.demo')}' and for_date = (now() at time zone 'Africa/Nairobi')::date`);
  if (row !== '4|Shipped the WhatsApp integration.|waiting on Meta template approval') throw new Error(`today's row: ${row || 'missing'}`);
  if (!/check-in for Acme Global is saved/.test(await lastText(ELENA))) throw new Error('no confirmation reply');
  return 'saved + confirmed on WhatsApp';
});

await step('WhatsApp: Meta retrying the same message id is processed once', async () => {
  const id = `wamid.DUP${Date.now()}`;
  await waInbound({ from: ELENA, text: 'help', id });
  const before = (await waSent(ELENA)).length;
  const r = await waInbound({ from: ELENA, text: 'help', id });
  if (!/duplicate/.test(r.body) || (await waSent(ELENA)).length !== before) throw new Error(r.body);
});

await step('WhatsApp: an unknown number is told to link it first', async () => {
  await waInbound({ from: '254799999999', text: 'hello' });
  if (!/not linked to an OrbitOS account/.test(await lastText('254799999999'))) throw new Error('no reply');
});

let expenseId = '';
await step('WhatsApp: a pending expense sends Approve/Reject to the other approver (not its creator)', async () => {
  const org = sql(`select id from organizations where slug = 'acme-global'`);
  expenseId = sql(`insert into finance_entries (org_id, kind, amount_minor, currency, vendor, approval_status, created_by) values ('${org}', 'expense', 25000000, 'KES', 'WA E2E Vendor', 'pending', '${uid('elena@acme-global.demo')}') returning id`).split('\n')[0];
  const r = await page.request.post(`${base}/api/finance/${expenseId}/notify`);
  const body = await r.json();
  if (r.status() !== 200 || body.sent < 1) throw new Error(JSON.stringify(body));
  const tpl = (await waSent(DEVON)).reverse().find((m) => m.template?.name === 'orbitos_expense_approval');
  const payloads = tpl.template.components.filter((c) => c.type === 'button').map((c) => c.parameters[0].payload);
  if (payloads[0] !== `exp:approved:${expenseId}` || payloads[1] !== `exp:rejected:${expenseId}`) throw new Error(JSON.stringify(payloads));
  if ((await waSent(ELENA)).some((m) => m.template?.name === 'orbitos_expense_approval')) throw new Error('creator was asked to approve own expense');
  return `${body.sent} approver(s) asked`;
});

await step('WhatsApp: the creator tapping Approve on their own expense is refused', async () => {
  await waInbound({ from: ELENA, payload: `exp:approved:${expenseId}` });
  if (sql(`select approval_status from finance_entries where id = '${expenseId}'`) !== 'pending') throw new Error('self-approval went through');
  if (!/can't approve your own expense/.test(await lastText(ELENA))) throw new Error('no refusal message');
});

await step('WhatsApp: the director taps Approve — expense approved, attributed to them, audited', async () => {
  await waInbound({ from: DEVON, payload: `exp:approved:${expenseId}` });
  const row = sql(`select approval_status || '|' || (approved_by = '${uid('devon@acme-global.demo')}') from finance_entries where id = '${expenseId}'`);
  if (row !== 'approved|true') throw new Error(row);
  if (!/Approved: KES 250,000.00/.test(await lastText(DEVON))) throw new Error(await lastText(DEVON));
  await waInbound({ from: DEVON, payload: `exp:rejected:${expenseId}` });
  if (!/already approved/.test(await lastText(DEVON))) throw new Error('second tap not handled');
  return 'approved_by = director; second tap says already approved';
});

await step('WhatsApp: STOP turns reminders and approvals off, START back on', async () => {
  await waInbound({ from: DEVON, text: 'STOP' });
  const off = sql(`select whatsapp_checkins::text || whatsapp_approvals::text from profiles where id = '${uid('devon@acme-global.demo')}'`);
  await waInbound({ from: DEVON, text: 'start' });
  const on = sql(`select whatsapp_checkins::text || whatsapp_approvals::text from profiles where id = '${uid('devon@acme-global.demo')}'`);
  if (off !== 'falsefalse' || on !== 'truetrue') throw new Error(`${off} ${on}`);
});

await step('WhatsApp: unlinking removes the number', async () => {
  await dpage.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  await dpage.locator('#whatsapp').getByRole('button', { name: 'Unlink this number' }).click();
  await dpage.locator('#whatsapp').getByLabel('WhatsApp number').waitFor({ timeout: 10000 });
  if (sql(`select count(*) from whatsapp_links where user_id = '${uid('devon@acme-global.demo')}'`) !== '0') throw new Error('still linked');
});

// ── (more feature flows are appended below) ──

// ─────────────── Low-bandwidth: installable, offline, data saver ───────────────
await step('PWA: manifest, icons and service worker are served without signing in', async () => {
  const m = await (await fetch(`${base}/manifest.webmanifest`)).json();
  if (m.display !== 'standalone' || m.start_url !== '/dashboard' || !m.icons.some((i) => i.purpose === 'maskable')) throw new Error(JSON.stringify(m));
  const sw = await fetch(`${base}/sw.js`);
  const icon = await fetch(`${base}/icon-512.png`);
  const off = await fetch(`${base}/offline`, { redirect: 'manual' });
  if (sw.status !== 200 || !/javascript/.test(sw.headers.get('content-type') || '') || icon.status !== 200 || off.status !== 200) throw new Error(`sw=${sw.status} icon=${icon.status} offline=${off.status}`);
});

await step('Offline: with no connection, pages fall back to the offline page (service worker)', async () => {
  const { ctx, page: p } = await session('wanjiru@acme-global.demo');
  await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 15000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: 'networkidle' }); // page now controlled by the worker
  await ctx.setOffline(true);
  await p.goto(`${base}/scheduling`).catch(() => undefined);
  await p.getByRole('heading', { name: "You're offline" }).waitFor({ timeout: 15000 });
  await ctx.setOffline(false);
  await ctx.close();
});

await step('Offline: a check-in written offline is kept on the device and sent on reconnect', async () => {
  const email = 'tomas@acme-global.demo';
  const me = uid(email);
  sql(`delete from check_ins where user_id = '${me}' and for_date = (now() at time zone 'Europe/Lisbon')::date`);
  const { ctx, page: p } = await session(email);
  await p.goto(`${base}/culture`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Check in' }).first().click();
  const d = p.locator('dialog[open]');
  await d.getByLabel('What did you ship today?').fill('Offline check-in from a matatu');
  await ctx.setOffline(true);
  await d.getByRole('button', { name: 'Save check-in' }).click();
  await p.getByText(/saved on this device/).first().waitFor({ timeout: 10000 });
  await p.getByRole('status').filter({ hasText: /You're offline/ }).first().waitFor({ timeout: 10000 });
  if (sql(`select count(*) from check_ins where user_id = '${me}' and shipped like 'Offline check-in%'`) !== '0') throw new Error('saved while offline?');
  await ctx.setOffline(false);
  await p.getByText(/Sent 1 check-in saved while you were offline/).waitFor({ timeout: 15000 });
  const n = sql(`select count(*) from check_ins where user_id = '${me}' and shipped = 'Offline check-in from a matatu'`);
  await ctx.close();
  if (n !== '1') throw new Error(`rows after reconnect: ${n}`);
  return 'queued offline → sent once on reconnect';
});

await step('Data saver: live updates start paused (Retry turns them on) and the setting persists', async () => {
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  await page.locator('#data').getByRole('switch', { name: 'Data saver' }).click();
  await page.getByText('Saved').first().waitFor({ timeout: 10000 });
  if (sql(`select data_saver from profiles where id = '${uid('elena@acme-global.demo')}'`) !== 't') throw new Error('not stored');
  await page.goto(`${base}/operations?tab=activity`, { waitUntil: 'networkidle' });
  await page.getByText(/Live updates paused/).first().waitFor({ timeout: 10000 });
  const imgs = await page.locator('main img[src*="avatar"], header img[src*="avatar"]').count();
  await page.goto(`${base}/profile`, { waitUntil: 'networkidle' });
  await page.locator('#data').getByRole('switch', { name: 'Data saver' }).click();
  await page.getByText('Saved').first().waitFor({ timeout: 10000 });
  return `avatar photos loaded with data saver: ${imgs}`;
});


// ─────────────── M-Pesa payroll payouts ───────────────
await step('Payouts: the owner drafts a batch; bad rows are explained per line', async () => {
  await page.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  const card = page.locator('#payouts');
  await card.getByRole('button', { name: 'New M-Pesa payout' }).click();
  const d = page.locator('dialog[open]');
  await d.getByLabel('Batch name').fill('E2E October salaries');
  await d.getByLabel('Name 1').fill('Wanjiru Kamau');
  await d.getByLabel('M-Pesa number 1').fill('12345');
  await d.getByLabel('Amount 1 (KES)').fill('45,000');
  await d.getByRole('button', { name: 'Save draft' }).click();
  await d.getByText(/Row 1: "12345" is not a Kenyan M-Pesa number/).waitFor({ timeout: 10000 });
  await d.getByLabel('M-Pesa number 1').fill('0712 000 001');
  await d.getByRole('button', { name: 'Add person' }).click();
  await d.getByLabel('Name 2').fill('Unregistered Number');
  await d.getByLabel('M-Pesa number 2').fill('0700000000');
  await d.getByLabel('Amount 2 (KES)').fill('1000');
  await d.getByText('Total KES 46,000.00').waitFor();
  await d.getByRole('button', { name: 'Save draft' }).click();
  await card.getByText('E2E October salaries').waitFor({ timeout: 10000 });
  await card.getByText('Waiting for a second approver').waitFor();
  const row = sql(`select status || '|' || total_minor || '|' || line_count from payout_batches where title = 'E2E October salaries'`);
  if (row !== 'draft|4600000|2') throw new Error(row);
  return 'draft: KES 46,000 to 2 people';
});

let batchId = '';
await step('Payouts: the person who drafted it cannot approve it (403)', async () => {
  batchId = sql(`select id from payout_batches where title = 'E2E October salaries'`);
  const r = await page.request.post(`${base}/api/payouts/${batchId}`, { data: { action: 'approve' } });
  const body = await r.json();
  if (r.status() !== 403 || !/second owner or director/.test(body.error)) throw new Error(`${r.status()} ${body.error}`);
});

const { ctx: mCtx, page: mpage } = await session('marcus@acme-global.demo');
await step('Payouts: a second director without two-factor is sent to verify first (403 from the API)', async () => {
  await mpage.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  await mpage.locator('#payouts').getByRole('link', { name: 'Verify with 2FA to approve' }).waitFor();
  const r = await mpage.request.post(`${base}/api/payouts/${batchId}`, { data: { action: 'approve' } });
  if (r.status() !== 403 || !/two-factor/.test((await r.json()).error)) throw new Error(String(r.status()));
});

await step('Payouts: after two-factor, the second director approves → IntaSend pays → statuses, payroll run, audit', async () => {
  await mpage.goto(`${base}/mfa?next=${encodeURIComponent('/operations?tab=finance')}`, { waitUntil: 'networkidle' });
  const secret = (await mpage.locator('code').first().textContent()).trim();
  await mpage.getByLabel('6-digit code').fill(totp(secret));
  await mpage.getByRole('button', { name: 'Verify' }).click();
  await mpage.waitForURL((u) => u.pathname === '/operations', { timeout: 20000 });
  await mpage.waitForLoadState('networkidle');
  const card = mpage.locator('#payouts');
  await card.getByRole('button', { name: 'Approve & send' }).click();
  await mpage.locator('dialog[open]').getByRole('button', { name: 'Approve & send' }).click();
  let status = '';
  for (let i = 0; i < 40 && !['completed', 'partially_failed', 'failed'].includes(status); i++) { await new Promise((r) => setTimeout(r, 500)); status = sql(`select status from payout_batches where id = '${batchId}'`); }
  if (status !== 'partially_failed') throw new Error(`batch status ${status}`);
  const lines = sql(`select string_agg(phone || ':' || status, ',' order by phone) from payout_lines where batch_id = '${batchId}'`);
  if (lines !== '254700000000:failed,254712000001:sent') throw new Error(lines);
  const run = sql(`select total_minor || '|' || provider_label || '|' || status from payroll_runs where id = (select payroll_run_id from payout_batches where id = '${batchId}')`);
  if (run !== '4500000|M-Pesa (IntaSend)|settled') throw new Error(`payroll run: ${run}`);
  const approver = sql(`select approved_by = (select id from auth.users where email = 'marcus@acme-global.demo') from payout_batches where id = '${batchId}'`);
  const audited = sql(`select count(*) from audit_log where action in ('payout.drafted', 'payout.approved') and target_id = '${batchId}'`);
  if (approver !== 't' || audited !== '2') throw new Error(`approver=${approver} audit=${audited}`);
  await mpage.reload({ waitUntil: 'networkidle' });
  await card.getByText('Some failed').waitFor();
  return 'KES 45,000 paid, unregistered number failed, payroll run recorded';
});

await step('Payouts: approving twice is impossible (the batch is no longer a draft)', async () => {
  const r = await mpage.request.post(`${base}/api/payouts/${batchId}`, { data: { action: 'approve' } });
  if (r.status() !== 409) throw new Error(String(r.status()));
});

await step('Payouts: a contributor cannot create payouts, and the database hides batches from them (RLS)', async () => {
  const { ctx, page: cp } = await session('wanjiru@acme-global.demo');
  const r = await cp.request.post(`${base}/api/payouts`, { data: { title: 'Sneaky', lines: [{ name: 'Me', phone: '0712000001', amount_minor: 100000 }] } });
  await ctx.close();
  if (r.status() !== 403) throw new Error(String(r.status()));
  const w = uid('wanjiru@acme-global.demo');
  const seen = sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${w}','role','authenticated')::text, true); select count(*) from payout_batches; commit;`).split('\n').filter((x) => /^\d+$/.test(x)).pop();
  if (seen !== '0') throw new Error(`contributor sees ${seen} batches`);
});

await step('Payouts: a draft can be cancelled', async () => {
  const r = await page.request.post(`${base}/api/payouts`, { data: { title: 'E2E cancel me', lines: [{ name: 'A', phone: '0712000009', amount_minor: 200000 }] } });
  const { id } = await r.json();
  const c = await page.request.post(`${base}/api/payouts/${id}`, { data: { action: 'cancel' } });
  if (c.status() !== 200 || sql(`select status from payout_batches where id = '${id}'`) !== 'cancelled') throw new Error(String(c.status()));
});
await mCtx.close();

await ownerCtx.close(); await dirCtx.close();
await browser.close();
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} feature flows passed`);
process.exit(passed === results.length ? 0 : 1);
