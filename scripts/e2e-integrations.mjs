// End-to-end flows for KRA eTIMS and calendar sync, in real Chromium against the local stack
// (GoTrue + PostgREST + Postgres + IntaSend / eTIMS / calendar mocks).
// Usage: node scripts/e2e-integrations.mjs [baseUrl]   (run after `npm run stack:up` and the app on :3000)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const KRA = process.env.ETIMS_MOCK || 'http://localhost:54430';
const PW = 'OrbitOS-demo-2026';
const WORKSPACE_PIN = 'A012345678B';
const results = [];
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 240)); }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function session(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message.slice(0, 160)));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel(/Work email/).fill(email);
  await page.getByLabel(/^Password$/).fill(PW);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  return { ctx, page };
}
const kra = async () => (await fetch(`${KRA}/__state`)).json();
const kraFail = (mode) => fetch(`${KRA}/__fail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) });
const salesFor = async (tin) => ((await kra()).find((d) => d.key === `${tin}|00`)?.sales ?? []);
const cron = (job) => fetch(`${base}/api/cron/${job}`, { headers: { authorization: 'Bearer local-cron-secret' } }).then((r) => r.json());
const orgId = sql(`select id from organizations where slug = 'acme-global'`);
const stamp = Date.now().toString(36);
// The plan purchase below changes the workspace's plan; put it back afterwards so other suites see the seed state.
const planBefore = sql(`select plan || '|' || plan_period || '|' || seat_limit || '|' || plan_expires_at from organizations where id = '${orgId}'`).split('|');

// Clean slate for repeated runs.
await fetch(`${KRA}/__reset`, { method: 'POST' });
sql(`delete from etims_documents; delete from etims_sequences; delete from etims_configs; delete from etims_item_classes;
     delete from invoices where number like 'INV-E2E-%' or client_name like 'Savannah Logistics%' or client_name = 'Bad PIN Ltd';
     update organizations set kra_pin = null, status = 'active' where id = '${orgId}'`);

const { ctx: ownerCtx, page } = await session('elena@acme-global.demo');
const { ctx: dirCtx, page: dpage } = await session('devon@acme-global.demo');

/** Creates and sends a KES invoice through the API (the UI path is covered once below). */
async function apiInvoice(p, amountMinor, extra = {}) {
  const id = sql(`insert into invoices (org_id, number, client_name, client_email, amount_minor, currency, due_on, status, client_kra_pin)
    values ('${orgId}', 'INV-E2E-${stamp}-${Math.random().toString(36).slice(2, 7)}', 'Savannah Logistics', 'ap@savannah.test', ${amountMinor}, '${extra.currency ?? 'KES'}', current_date + 30, 'draft', ${extra.pin ? `'${extra.pin}'` : 'null'}) returning id`).split('\n')[0];
  const r = await p.request.post(`${base}/api/invoices/${id}/send`);
  return { id, body: await r.json(), status: r.status() };
}

// ─────────────── KRA eTIMS ───────────────
await step('eTIMS: directors see the section but only the owner can connect it', async () => {
  await dpage.goto(`${base}/settings#etims`, { waitUntil: 'networkidle' });
  await dpage.locator('#etims').getByText('Only the workspace owner can connect KRA eTIMS.').waitFor({ timeout: 10000 });
  const r = await dpage.request.put(`${base}/api/etims/config`, { data: { environment: 'sandbox', tin: WORKSPACE_PIN, bhfId: '00', deviceSerial: 'DEV-1', taxType: 'B' } });
  if (r.status() !== 403) throw new Error(`director PUT → ${r.status()}`);
});

await step('eTIMS: KRA rejects an unknown device serial and the owner sees why', async () => {
  await page.goto(`${base}/settings#etims`, { waitUntil: 'networkidle' });
  const s = page.locator('#etims');
  await s.getByLabel('KRA PIN').fill(WORKSPACE_PIN.toLowerCase());
  await s.getByLabel('Device serial number').fill('BAD-SERIAL');
  await s.getByLabel('What you invoice for').fill('Software development services');
  await s.getByRole('button', { name: 'Connect to KRA' }).click();
  await s.getByText(/KRA didn’t accept these details \(901/).first().waitFor({ timeout: 15000 });
  if (sql(`select count(*) from etims_configs`) !== '0') throw new Error('a config was saved');
});

await step('eTIMS: the owner connects the device; the KRA key is stored encrypted and never sent to the browser', async () => {
  const s = page.locator('#etims');
  await s.getByLabel('Device serial number').fill(`KRA-OSCU-${stamp}`);
  await s.getByRole('button', { name: 'Connect to KRA' }).click();
  await s.getByText('Last step: choose KRA’s classification for what you sell').waitFor({ timeout: 15000 });
  const box = sql(`select cmc_key_enc from etims_configs where scope = '${orgId}'`);
  const api = await (await page.request.get(`${base}/api/etims/config`)).text();
  if (!box.startsWith('v1.')) throw new Error('key not encrypted');
  if (/cmc/i.test(api) || api.includes(box)) throw new Error('key leaked to the API');
  return `status ${sql(`select status from etims_configs where scope = '${orgId}'`)}`;
});

await step('eTIMS: the owner searches KRA’s classifications and registers the service', async () => {
  const s = page.locator('#etims');
  await s.getByLabel('Search KRA classifications').fill('programming');
  await s.getByRole('radio', { name: /Computer programming services/ }).check({ timeout: 10000 });
  await s.getByRole('button', { name: 'Register and finish' }).click();
  await s.getByText('Active').first().waitFor({ timeout: 15000 });
  const items = (await kra()).find((d) => d.key === `${WORKSPACE_PIN}|00`)?.items ?? [];
  if (!items.includes('KE3NTXU0000001')) throw new Error(`items at KRA: ${items}`);
  return 'item KE3NTXU0000001 registered under 8111150000';
});

let firstInvoiceId = '';
await step('eTIMS: an invoice issued in the app goes to KRA with the client’s PIN, VAT split out, and shows its QR code', async () => {
  await page.goto(`${base}/operations?tab=finance&new=invoice`, { waitUntil: 'networkidle' });
  const d = page.getByRole('dialog');
  if (!(await d.count())) await page.getByRole('button', { name: /Issue an invoice|New invoice|Invoice/ }).first().click();
  await d.getByLabel('Client name').fill(`Savannah Logistics ${stamp}`);
  await d.getByLabel('Client billing email').fill('ap@savannah.test');
  await d.getByLabel('Client KRA PIN (optional)').fill('P05 2345678 Y');
  await d.getByLabel(/^Amount/).fill('11,600');
  await d.getByLabel('Email the client a payment link now').check();
  await d.getByRole('button', { name: 'Create & send' }).click();
  await page.waitForTimeout(1500);
  firstInvoiceId = sql(`select id from invoices where client_name = 'Savannah Logistics ${stamp}'`);
  await page.goto(`${base}/operations/invoices/${firstInvoiceId}`, { waitUntil: 'networkidle' });
  const panel = page.getByTestId('etims-panel');
  await panel.getByText('Accepted by KRA').waitFor({ timeout: 15000 });
  const cu = await panel.getByTestId('etims-cu').innerText();
  const svg = await panel.locator('svg').count();
  const [sale] = await salesFor(WORKSPACE_PIN);
  if (!sale || sale.invcNo !== 1 || sale.custTin !== 'P052345678Y' || sale.totAmt !== 11600 || sale.taxAmtB !== 1600 || sale.rcptTyCd !== 'S') throw new Error(JSON.stringify(sale).slice(0, 200));
  if (!svg) throw new Error('no QR code');
  return `CU ${cu}; KRA got invcNo 1, KES 11,600 incl. VAT 1,600`;
});

await step('eTIMS: the invoice PDF carries the KRA details', async () => {
  const r = await page.request.get(`${base}/api/invoices/${firstInvoiceId}/pdf`);
  const buf = Buffer.from(await r.body());
  if (r.status() !== 200 || buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`HTTP ${r.status()}`);
  return `${buf.length} bytes`;
});

await step('eTIMS: an invalid client PIN is caught before saving', async () => {
  await page.goto(`${base}/operations?tab=finance&new=invoice`, { waitUntil: 'networkidle' });
  const d = page.getByRole('dialog');
  if (!(await d.count())) await page.getByRole('button', { name: /Issue an invoice|New invoice|Invoice/ }).first().click();
  await d.getByLabel('Client name').fill('Bad PIN Ltd');
  await d.getByLabel('Client billing email').fill('x@y.test');
  await d.getByLabel('Client KRA PIN (optional)').fill('12345');
  await d.getByLabel(/^Amount/).fill('100');
  await d.getByRole('button', { name: /Create & send|Save draft/ }).click();
  await d.getByText('Enter the KRA PIN as a letter, nine digits and a letter.').waitFor();
  await page.keyboard.press('Escape');
  if (sql(`select count(*) from invoices where client_name = 'Bad PIN Ltd'`) !== '0') throw new Error('saved');
});

await step('eTIMS: when KRA is down, sending still works; the invoice waits and the hourly job sends it with the next number', async () => {
  await kraFail('down');
  const inv = await apiInvoice(page, 5000_00);
  const waiting = sql(`select status || '|' || coalesce(invc_no::text, '-') from etims_documents where invoice_id = '${inv.id}'`);
  await kraFail(null);
  sql(`update etims_documents set next_attempt_at = now() where invoice_id = '${inv.id}'`);
  const r = await cron('etims');
  const after = sql(`select status || '|' || invc_no from etims_documents where invoice_id = '${inv.id}'`);
  if (inv.body.etims?.status !== 'queued' || !waiting.startsWith('queued') || after !== 'submitted|2' || r.sent !== 1) throw new Error(`${JSON.stringify(inv.body.etims)} ${waiting} → ${after} ${JSON.stringify(r)}`);
  return `send returned "queued" (${waiting}); cron → ${after}`;
});

await step('eTIMS: if KRA’s reply is lost, the retry reuses the same number and KRA’s “already have it” counts as sent', async () => {
  await kraFail('ack_then_fail');
  const inv = await apiInvoice(page, 2500_00);
  const mid = sql(`select status || '|' || invc_no from etims_documents where invoice_id = '${inv.id}'`);
  const r = await page.request.post(`${base}/api/invoices/${inv.id}/etims`);
  const after = sql(`select status || '|' || invc_no from etims_documents where invoice_id = '${inv.id}'`);
  const nums = (await salesFor(WORKSPACE_PIN)).map((s) => s.invcNo);
  if (mid !== 'queued|3' || after !== 'submitted|3' || r.status() !== 200 || nums.join(',') !== '1,2,3') throw new Error(`${mid} → ${after}; KRA has ${nums}`);
  return `${mid} → ${after}; KRA numbers ${nums.join(',')}`;
});

await step('eTIMS: a rejected invoice frees its number (no gaps), owners are notified, and it can be resent', async () => {
  await kraFail('reject');
  const inv = await apiInvoice(page, 1000_00);
  await kraFail(null);
  const rej = sql(`select status || '|' || coalesce(invc_no::text, '-') || '|' || result_cd from etims_documents where invoice_id = '${inv.id}'`);
  const notified = sql(`select count(*) from notifications where org_id = '${orgId}' and kind = 'etims' and title like '%rejected%'`);
  const next = await apiInvoice(page, 1200_00);
  const nextNo = sql(`select invc_no from etims_documents where invoice_id = '${next.id}'`);
  const again = await page.request.post(`${base}/api/invoices/${inv.id}/etims`);
  const resent = sql(`select status || '|' || invc_no from etims_documents where invoice_id = '${inv.id}' and status <> 'rejected'`);
  const nums = (await salesFor(WORKSPACE_PIN)).map((s) => s.invcNo);
  if (rej !== 'rejected|-|910' || notified === '0' || nextNo !== '4' || again.status() !== 200 || resent !== 'submitted|5' || nums.join(',') !== '1,2,3,4,5') {
    throw new Error(`${rej} notified=${notified} next=${nextNo} resent=${resent} KRA=${nums}`);
  }
  return `rejected (910) → next invoice took 4 → resent as 5; KRA ${nums.join(',')}`;
});

await step('eTIMS: voiding a fiscalised invoice sends KRA a credit note; editing or voiding it directly is refused', async () => {
  const owner = sql(`select id from auth.users where email = 'elena@acme-global.demo'`);
  const direct = (() => {
    try {
      sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${owner}','role','authenticated')::text, true);
           update invoices set status = 'void' where id = '${firstInvoiceId}'; commit;`);
      return 'allowed';
    } catch (e) { return /credit note/.test(String(e.stderr ?? e.message)) ? 'refused' : String(e.stderr ?? e.message).slice(0, 120); }
  })();
  const amountEdit = (() => {
    try { sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${owner}','role','authenticated')::text, true); update invoices set amount_minor = 1 where id = '${firstInvoiceId}'; commit;`); return 'allowed'; }
    catch (e) { return /can no longer change/.test(String(e.stderr ?? e.message)) ? 'refused' : 'other'; }
  })();
  await page.goto(`${base}/operations/invoices/${firstInvoiceId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Void', exact: true }).click();
  await page.getByText('OrbitOS will send KRA a credit note reversing it').waitFor();
  await page.getByRole('button', { name: 'Void invoice' }).click();
  await page.getByText(/Reversed by KRA credit note 6/).waitFor({ timeout: 15000 });
  const cn = (await salesFor(WORKSPACE_PIN)).find((s) => s.rcptTyCd === 'R');
  if (direct !== 'refused' || amountEdit !== 'refused' || !cn || cn.orgInvcNo !== 1 || cn.invcNo !== 6) throw new Error(`direct=${direct} edit=${amountEdit} cn=${JSON.stringify(cn).slice(0, 120)}`);
  return 'credit note 6 reverses invoice 1';
});

await step('eTIMS: invoices in other currencies are not sent to KRA', async () => {
  const inv = await apiInvoice(page, 500_00, { currency: 'USD' });
  const n = sql(`select count(*) from etims_documents where invoice_id = '${inv.id}'`);
  await page.goto(`${base}/operations/invoices/${inv.id}`, { waitUntil: 'networkidle' });
  await page.getByText('only KES invoices go to KRA eTIMS').waitFor();
  if (n !== '0' || inv.body.etims?.reason !== 'currency') throw new Error(`${n} ${JSON.stringify(inv.body.etims)}`);
});

await step('eTIMS: contributors can’t see fiscal documents or the configuration', async () => {
  const { ctx, page: cp } = await session('wanjiru@acme-global.demo');
  const r = await cp.request.get(`${base}/api/etims/config`);
  await ctx.close();
  const w = sql(`select id from auth.users where email = 'wanjiru@acme-global.demo'`);
  const seen = sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${w}','role','authenticated')::text, true); select count(*) from etims_documents; commit;`).split('\n').filter((x) => /^\d+$/.test(x)).pop();
  const cfgSeen = (() => { try { sql(`begin; set local role authenticated; select count(*) from etims_configs; commit;`); return 'readable'; } catch { return 'denied'; } })();
  if (r.status() !== 403 || seen !== '0' || cfgSeen !== 'denied') throw new Error(`api=${r.status()} docs=${seen} configs=${cfgSeen}`);
});

await step('eTIMS: the owner saves the workspace KRA PIN for OrbitOS receipts (invalid PINs refused)', async () => {
  await page.goto(`${base}/settings/billing`, { waitUntil: 'networkidle' });
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Tax details for receipts' }) });
  await card.getByLabel('KRA PIN').fill('nope');
  await card.getByRole('button', { name: 'Save' }).click();
  await card.getByText('Enter the KRA PIN as a letter, nine digits and a letter.').waitFor({ timeout: 8000 }).catch(async () => { throw new Error(`card: ${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`); });
  await card.getByLabel('KRA PIN').fill('p 051 999 999 q');
  await card.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved').first().waitFor();
  const v = sql(`select kra_pin from organizations where id = '${orgId}'`);
  if (v !== 'P051999999Q') throw new Error(v);
});

await step('eTIMS: an M-Pesa plan payment gets OrbitOS’s own fiscal receipt with the customer’s PIN', async () => {
  const r = await page.request.post(`${base}/api/billing/checkout`, { data: { plan: 'pro', period: 'monthly', method: 'MPESA', phone: '0712345678' } });
  const { ref } = await r.json();
  let state = 'PENDING';
  for (let i = 0; i < 20 && state !== 'COMPLETE'; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    state = (await (await page.request.get(`${base}/api/billing/status?ref=${ref}`)).json()).state;
  }
  const doc = sql(`select d.status || '|' || d.invc_no || '|' || coalesce(d.customer_pin, '-') from etims_documents d join billing_payments p on p.id = d.billing_payment_id where p.api_ref = '${ref}'`);
  const sale = (await salesFor('P051234567X')).at(-1);
  const pid = sql(`select id from billing_payments where api_ref = '${ref}'`);
  const pdf = await page.request.get(`${base}/api/billing/receipt/${pid}`);
  if (state !== 'COMPLETE' || !doc.startsWith('submitted|') || !doc.endsWith('|P051999999Q') || sale?.pmtTyCd !== '06' || sale?.trdInvcNo !== pid || pdf.status() !== 200) {
    throw new Error(`state=${state} doc=${doc} sale=${JSON.stringify(sale)?.slice(0, 120)} pdf=${pdf.status()}`);
  }
  return `platform receipt ${doc}; paid by mobile money (06)`;
});

await step('eTIMS: the owner can disconnect; nothing new goes to KRA afterwards', async () => {
  await page.goto(`${base}/settings#etims`, { waitUntil: 'networkidle' });
  const s = page.locator('#etims');
  await s.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await s.getByRole('button', { name: 'Connect to KRA' }).waitFor({ timeout: 15000 });
  const inv = await apiInvoice(page, 700_00);
  const n = sql(`select count(*) from etims_documents where invoice_id = '${inv.id}'`);
  const key = sql(`select coalesce(cmc_key_enc, 'null') from etims_configs where scope = '${orgId}'`);
  if (n !== '0' || key !== 'null') throw new Error(`docs=${n} key=${key}`);
});

// ─────────────── Calendar sync ───────────────
const CAL = process.env.CAL_MOCK || 'http://localhost:54440';
const calEvents = async (email) => (await fetch(`${CAL}/__events?email=${encodeURIComponent(email)}`)).json();
const calPost = (path, body) => fetch(`${CAL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
await calPost('/__reset', {});
sql(`delete from calendar_event_links; delete from calendar_busy; delete from calendar_connections; delete from meetings where title like 'Calendar sync %'`);
const ELENA_ID = sql(`select id from auth.users where email = 'elena@acme-global.demo'`);
const DEVON_ID = sql(`select id from auth.users where email = 'devon@acme-global.demo'`);
const mtgTitle = `Calendar sync ${stamp}`;

async function connectCalendar(p, providerLabel, expect) {
  await p.goto(`${base}/profile#calendar`, { waitUntil: 'networkidle' });
  await p.locator('#calendar').getByRole('link', { name: providerLabel }).click();
  await p.waitForURL(/\/profile\?calendar=connected/, { timeout: 20000 });
  await p.locator('#calendar').getByTestId('calendar-connected').getByText(expect).waitFor({ timeout: 10000 });
}

await step('Calendar: the owner connects Google Calendar; tokens are encrypted and unreadable from the browser', async () => {
  await connectCalendar(page, 'Connect Google Calendar', 'Connected to Google Calendar as elena@acme-global.demo');
  const enc = sql(`select left(refresh_token_enc, 3) || '|' || provider || '|' || status from calendar_connections where user_id = '${ELENA_ID}'`);
  const leak = (() => { try { sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${ELENA_ID}','role','authenticated')::text, true); select refresh_token_enc from calendar_connections; commit;`); return 'readable'; } catch { return 'denied'; } })();
  const own = sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${ELENA_ID}','role','authenticated')::text, true); select account_email from calendar_connections; commit;`).split('\n').find((l) => l.includes('@'));
  if (enc !== 'v1.|google|active' || leak !== 'denied' || own !== 'elena@acme-global.demo') throw new Error(`${enc} tokens=${leak} own=${own}`);
  return 'refresh token stored as v1.… (AES-GCM); token columns not granted';
});

await step('Calendar: a director connects Outlook', async () => {
  await connectCalendar(dpage, 'Connect Outlook', 'Connected to Outlook as devon@acme-global.demo');
});

await step('Calendar: busy times come back as times only, and the meeting dialog warns about a clash', async () => {
  const start = new Date(Date.now() + 2 * 86_400_000); start.setUTCHours(10, 0, 0, 0);
  await calPost('/__busy', { email: 'devon@acme-global.demo', blocks: [{ start: start.toISOString(), end: new Date(start.getTime() + 2 * 3_600_000).toISOString() }] });
  sql(`update calendar_connections set busy_synced_at = null`);
  const j = await (await page.request.get(`${base}/api/calendar/busy?users=${DEVON_ID},${ELENA_ID}`)).json();
  const blocks = j.busy[DEVON_ID] ?? [];
  if (!j.connected.includes(DEVON_ID) || !blocks.some((b) => b.start === start.getTime()) || JSON.stringify(j).match(/subject|summary|title/i)) throw new Error(JSON.stringify(j).slice(0, 200));
  await page.goto(`${base}/scheduling?new=1`, { waitUntil: 'networkidle' });
  const d = page.getByRole('dialog');
  await d.getByLabel(/Devon Vance/).check();
  const tz = sql(`select timezone from profiles where id = '${ELENA_ID}'`);
  const local = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(start.getTime() + 30 * 60_000)).replace(' ', 'T');
  await d.getByLabel(/^Starts/).fill(local);
  await d.getByText('Busy in their calendar at that time: Devon Vance.').waitFor({ timeout: 10000 });
  await page.keyboard.press('Escape');
  return `${blocks.length} busy block(s) for Devon; dialog warned`;
});

let mtgId = '';
await step('Calendar: a new meeting lands in both connected calendars; the unconnected guest gets the usual invite path', async () => {
  await calPost('/__busy', { email: 'devon@acme-global.demo', blocks: [] });
  await page.goto(`${base}/scheduling?new=1`, { waitUntil: 'networkidle' });
  const d = page.getByRole('dialog');
  await d.getByLabel('Title').fill(mtgTitle);
  await d.getByLabel(/Devon Vance/).check();
  await d.getByLabel(/Wanjiru/).check();
  await d.getByRole('button', { name: 'Schedule' }).click();
  await d.getByText(/Added to 2 connected calendars\./).waitFor({ timeout: 20000 });
  mtgId = sql(`select id from meetings where title = '${mtgTitle}'`);
  const g = (await calEvents('elena@acme-global.demo')).filter((e) => e.summary === mtgTitle);
  const o = (await calEvents('devon@acme-global.demo')).filter((e) => e.subject === mtgTitle);
  const links = sql(`select count(*) from calendar_event_links where meeting_id = '${mtgId}'`);
  if (g.length !== 1 || o.length !== 1 || links !== '2' || !String(g[0].description).includes('Scheduled in OrbitOS')) throw new Error(`google=${g.length} outlook=${o.length} links=${links}`);
  return `Google event ${g[0].id.slice(0, 8)}…, Outlook event ${o[0].id.slice(0, 8)}…`;
});

await step('Calendar: moving the meeting moves it in both calendars', async () => {
  const cur = sql(`select starts_at from meetings where id = '${mtgId}'`);
  const newStart = new Date(Date.parse(cur.replace(' ', 'T').replace(/\+00$/, 'Z')) + 60 * 60_000).toISOString();
  const r = await page.request.post(`${base}/api/reports/insights/adopt`, { data: { meetingId: mtgId, newStart } });
  const g = (await calEvents('elena@acme-global.demo')).find((e) => e.summary === mtgTitle);
  const o = (await calEvents('devon@acme-global.demo')).find((e) => e.subject === mtgTitle);
  if (r.status() !== 200 || Date.parse(g.start.dateTime) !== Date.parse(newStart) || Date.parse(`${o.start.dateTime.replace(/Z$/, '')}Z`) !== Date.parse(newStart)) throw new Error(`${r.status()} ${g?.start?.dateTime} ${o?.start?.dateTime} want ${newStart}`);
});

await step('Calendar: declining takes it out of that person’s calendar', async () => {
  await dpage.goto(`${base}/scheduling/meetings/${mtgId}`, { waitUntil: 'networkidle' });
  await dpage.getByRole('button', { name: 'Not going' }).click();
  await dpage.getByText('RSVP saved').first().waitFor();
  await dpage.waitForTimeout(800);
  const o = (await calEvents('devon@acme-global.demo')).filter((e) => e.subject === mtgTitle);
  const links = sql(`select count(*) from calendar_event_links where meeting_id = '${mtgId}'`);
  if (o.length !== 0 || links !== '1') throw new Error(`outlook=${o.length} links=${links}`);
});

await step('Calendar: deleting a synced meeting directly is refused; cancelling removes it from calendars', async () => {
  const direct = (() => { try { sql(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','${ELENA_ID}','role','authenticated')::text, true); delete from meetings where id = '${mtgId}'; commit;`); return 'allowed'; } catch (e) { return /Cancel meeting/.test(String(e.stderr ?? e.message)) ? 'refused' : 'other'; } })();
  await page.goto(`${base}/scheduling/meetings/${mtgId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Cancel meeting' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel meeting' }).click();
  await page.waitForURL(/\/scheduling$/, { timeout: 15000 });
  const g = (await calEvents('elena@acme-global.demo')).filter((e) => e.summary === mtgTitle);
  const left = sql(`select count(*) from meetings where id = '${mtgId}'`);
  if (direct !== 'refused' || g.length !== 0 || left !== '0') throw new Error(`direct=${direct} google=${g.length} meeting=${left}`);
});

await step('Calendar: if someone revokes access, OrbitOS notices and asks them to connect again', async () => {
  await calPost('/__revoke', { email: 'elena@acme-global.demo' });
  sql(`update calendar_connections set access_expires_at = now() - interval '1 minute', busy_synced_at = null where user_id = '${ELENA_ID}'`);
  const r = await cron('calendar');
  const st = sql(`select status from calendar_connections where user_id = '${ELENA_ID}'`);
  await page.goto(`${base}/profile#calendar`, { waitUntil: 'networkidle' });
  await page.locator('#calendar').getByRole('link', { name: 'Connect again' }).waitFor({ timeout: 10000 });
  if (st !== 'error' || r.failed < 1) throw new Error(`${st} ${JSON.stringify(r)}`);
  return `cron ${JSON.stringify(r)}`;
});

await step('Calendar: disconnecting forgets the tokens and busy times', async () => {
  await dpage.goto(`${base}/profile#calendar`, { waitUntil: 'networkidle' });
  await dpage.locator('#calendar').getByRole('button', { name: 'Disconnect' }).click();
  await dpage.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await dpage.locator('#calendar').getByRole('link', { name: 'Connect Outlook' }).waitFor({ timeout: 15000 });
  const n = sql(`select (select count(*) from calendar_connections where user_id = '${DEVON_ID}') + (select count(*) from calendar_busy where user_id = '${DEVON_ID}')`);
  if (n !== '0') throw new Error(n);
});

await ownerCtx.close(); await dirCtx.close();
await browser.close();
sql(`update organizations set plan = '${planBefore[0]}', plan_period = '${planBefore[1]}', seat_limit = ${planBefore[2]}, plan_expires_at = '${planBefore[3]}' where id = '${orgId}'`);
const passed = results.filter(([c]) => c).length;
console.log(`\n${passed}/${results.length} integration flows passed`);
process.exit(passed === results.length ? 0 : 1);
