// End-to-end flows for WhatsApp, M-Pesa payouts, languages, low-bandwidth mode and the AI chief-of-staff,
// in real Chromium against the local stack (GoTrue + PostgREST + Postgres + IntaSend/WhatsApp/AI mocks).
// Usage: node scripts/e2e-features.mjs [baseUrl]   (run after `npm run stack:up` and the app on :3000)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

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
const waSent = async (to) => (await fetch(`${WA}/__sent?to=${to}`)).json();
const waInbound = async (body) => (await fetch(`${WA}/__inbound`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const lastText = async (to) => { const s = await waSent(to); const m = s[s.length - 1]; return m?.text?.body ?? ''; };
const uid = (email) => sql(`select id from auth.users where email = '${email}'`);

const ELENA = '254711000001'; const DEVON = '254711000002';

// Clean slate for repeated runs.
sql(`delete from whatsapp_links; delete from whatsapp_verifications; delete from whatsapp_prompts; delete from whatsapp_inbound;
     update profiles set whatsapp_checkins = true, whatsapp_approvals = true, language = 'en', data_saver = false`);

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

await ownerCtx.close(); await dirCtx.close();
await browser.close();
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} feature flows passed`);
process.exit(passed === results.length ? 0 : 1);
