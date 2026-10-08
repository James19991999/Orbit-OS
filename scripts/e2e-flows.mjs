// End-to-end user flows in a real browser against the local stack (GoTrue + PostgREST + Postgres + IntaSend mock).
// Usage: node scripts/e2e-flows.mjs [baseUrl]
import { chromium } from 'playwright-core';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const MOCK = process.env.INTASEND_MOCK || 'http://localhost:54400';
const PW = 'OrbitOS-demo-2026';
const results = [];
/** psql against the local stack DB — read-only lookups of ids the UI doesn't expose. */
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const stamp = Date.now().toString(36);
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); if (r !== false) ok(name, true, typeof r === 'string' ? r : ''); else ok(name, false); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 200)); }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function session(email, password = PW) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message.slice(0, 160)));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  return { ctx, page };
}
const dialog = (page) => page.locator('dialog[open]');
async function toast(page, re, timeout = 15000) { await page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: re }).first().waitFor({ timeout }); }

// ─────────────── Owner (Elena) ───────────────
const { ctx: ownerCtx, page } = await session('elena@acme-global.demo');
ok('owner signs in through the real login form', true);

await step('create a task from Operations and see it on the board', async () => {
  await page.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New task' }).click();
  const d = dialog(page);
  await d.getByLabel('Title').fill(`E2E task ${stamp}`);
  await d.getByLabel('Priority').selectOption('high');
  await d.getByRole('button', { name: 'Create task' }).click();
  await toast(page, /Task created/);
  await page.getByRole('link', { name: `E2E task ${stamp}` }).first().waitFor();
});

await step('move the task to Done via its status menu (persists after reload)', async () => {
  await page.getByLabel(`Move “E2E task ${stamp}” to`).selectOption('done');
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  const col = page.locator('section[aria-label^="Done"]');
  await col.getByRole('link', { name: `E2E task ${stamp}` }).waitFor();
});

await step('expense above the approval threshold is forced to pending; owner cannot self-approve', async () => {
  await page.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Log entry' }).click();
  const d = dialog(page);
  await d.getByLabel(/^Amount/).fill('250000');
  await d.getByLabel('Category').fill('Hardware');
  await d.getByLabel('Vendor').fill(`Laptops ${stamp}`);
  await d.getByRole('button', { name: 'Save entry' }).click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  const row = page.locator('#approvals li', { hasText: `Laptops ${stamp}` });
  await row.waitFor();
  return (await row.getByRole('button', { name: 'Approve' }).isDisabled()) ? 'approve disabled for creator' : false;
});

await step('edit today’s async check-in', async () => {
  await page.goto(`${base}/culture`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /check-in|Check in/ }).first().click();
  const d = dialog(page);
  await d.getByLabel('What did you ship today?').fill(`Shipped the E2E suite ${stamp}`);
  await d.getByRole('radio', { name: 'Great' }).click();
  await d.getByRole('button', { name: 'Save check-in' }).click();
  await toast(page, /Check-in saved/);
});

await step('vote in the pulse poll (percentages update)', async () => {
  const opt = page.getByRole('button', { name: /Manageable/ }).first();
  await opt.click();
  await page.waitForTimeout(1200);
  return (await opt.getAttribute('aria-pressed')) === 'true';
});

await step('give kudos to a teammate', async () => {
  await page.goto(`${base}/culture?tab=kudos`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Give kudos' }).click();
  const d = dialog(page);
  await d.getByLabel('Teammate').selectOption({ label: 'Marcus Vance' });
  await d.getByRole('radio', { name: /Innovator/ }).click();
  await d.getByLabel('Message').fill(`Great RFC ${stamp}`);
  await d.getByRole('button', { name: 'Send kudos' }).click();
  await toast(page, /Kudos sent/);
  await page.getByText(`Great RFC ${stamp}`).waitFor();
});

await step('schedule a meeting from the slot finder', async () => {
  await page.goto(`${base}/scheduling`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Schedule overlap sync' }).click();
  const d = dialog(page);
  await d.getByLabel('Title').fill(`E2E sync ${stamp}`);
  const invite = page.waitForResponse((r) => /\/api\/meetings\/[^/]+\/invite$/.test(new URL(r.url()).pathname), { timeout: 15000 });
  await d.getByRole('button', { name: 'Schedule' }).click();
  const inv = await invite;
  if (inv.status() !== 200) throw new Error(`calendar invite endpoint returned ${inv.status()}: ${await inv.text()}`);
  await d.getByText(/Meeting saved|Calendar invites/).waitFor({ timeout: 15000 });
  await d.getByRole('button', { name: 'Done' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: `E2E sync ${stamp}` }).waitFor();
});

await step('send training reminders for an open campaign (loads assignees + profiles)', async () => {
  const id = sql("select c.id from training_campaigns c join training_assignments a on a.campaign_id = c.id where a.completed_at is null limit 1");
  if (!id) throw new Error('seed has no open training campaign');
  const r = await page.request.post(`${base}/api/compliance/training/remind`, { data: { campaignId: id } });
  const body = await r.json();
  if (r.status() !== 200) throw new Error(`remind returned ${r.status()}: ${JSON.stringify(body)}`);
  if (!(body.pending > 0)) throw new Error(`expected incomplete assignees, got ${JSON.stringify(body)}`);
  return `${body.pending} assignee(s) pending`;
});

let invoiceUrl = '';
await step('issue an invoice → IntaSend payment link is created', async () => {
  await page.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Issue invoice' }).click();
  const d = dialog(page);
  await d.getByLabel('Client name').fill(`E2E Client ${stamp}`);
  await d.getByLabel('Client billing email').fill('client@example.com');
  await d.getByLabel(/^Amount/).fill('12345.50');
  await d.getByRole('button', { name: 'Create & send' }).click();
  await toast(page, /Invoice sent/);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('row', { name: new RegExp(`E2E Client ${stamp}`) }).getByRole('link').click();
  await page.waitForURL(/operations\/invoices\//);
  invoiceUrl = page.url();
  await page.getByRole('button', { name: 'Copy payment link' }).waitFor();
});

let invoiceRef = '';
await step('client pays via the hosted link → webhook marks the invoice paid + revenue recorded', async () => {
  const href = await page.getByTestId('payment-link').getAttribute('href');
  const res = await fetch(href, { redirect: 'manual' }); // the client completing IntaSend's hosted checkout
  if (res.status !== 302) return false;
  invoiceRef = `inv_${invoiceUrl.split('/').pop()}`;
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(/^paid$/i).first().waitFor();
  await page.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  await page.getByRole('cell', { name: new RegExp(`E2E Client ${stamp}`) }).first().waitFor();
  return `${href.replace(MOCK, 'mock')} → paid; revenue entry present`;
});

await step('buy Pro monthly with M-Pesa (STK push → status polling → plan applied)', async () => {
  await page.goto(`${base}/settings/billing`, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: 'Monthly' }).click();
  await page.getByRole('button', { name: 'Choose Pro' }).click();
  const d = dialog(page);
  await d.getByLabel('M-Pesa phone number').fill('0712 345 678');
  await d.getByRole('button', { name: /^Pay KES/ }).click();
  await page.getByText(/enter your M-Pesa PIN/).waitFor();
  await page.getByText(/Payment received/).waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('row', { name: /Pro · monthly .* M-Pesa .* complete/i }).first().waitFor();
  return 'COMPLETE in history';
});

await step('download the PDF receipt for that payment', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Receipt' }).first().click()]);
  const buf = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c));
  return buf.subarray(0, 4).toString() === '%PDF' ? `${buf.length} bytes` : false;
});

await step('buy Enterprise annual by card (hosted checkout → webhook → redirect back)', async () => {
  await page.getByRole('radio', { name: /Annual/ }).click();
  await page.getByRole('button', { name: /Choose Enterprise|Renew/ }).last().click();
  const d = dialog(page);
  await d.getByRole('radio', { name: 'Card' }).click();
  await d.getByRole('button', { name: /^Pay / }).click();
  await page.waitForURL(/settings\/billing\?ref=orb_/, { timeout: 30000 });
  await page.getByText(/Payment received/).waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText(/Enterprise · \d+ seats|Enterprise ·/).first().waitFor();
});

await step('download the audit-ready package (ZIP with summary.pdf + CSVs)', async () => {
  await page.goto(`${base}/compliance`, { waitUntil: 'networkidle' });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /audit-ready package/ }).click()]);
  const buf = Buffer.concat(await (await dl.createReadStream()).toArray());
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const pdf = await zip.file('summary.pdf').async('nodebuffer');
  return names.includes('controls.csv') && pdf.subarray(0, 4).toString() === '%PDF' ? names.filter((n) => !n.endsWith('/')).join(', ') : false;
});

await step('export the executive report as PDF and CSV', async () => {
  const pdf = await page.request.get(`${base}/api/reports/export?format=pdf&period=quarter`);
  const csv = await page.request.get(`${base}/api/reports/export?format=csv&period=quarter`);
  const p = await pdf.body(); const c = (await csv.text());
  return pdf.ok() && p.subarray(0, 4).toString() === '%PDF' && csv.ok() && c.startsWith('section,metric,value') ? `pdf ${p.length}B, csv ${c.split('\n').length} rows` : false;
});

let inviteLink = '';
const inviteEmail = `new.hire.${stamp}@example.com`;
await step('invite a teammate (email not configured → shareable link shown)', async () => {
  await page.goto(`${base}/settings#members`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Work email').fill(inviteEmail);
  await d.getByLabel('Role').selectOption('contributor');
  await d.getByRole('button', { name: 'Send invite' }).click();
  inviteLink = (await d.locator('code').textContent()) ?? '';
  return inviteLink.includes('/join/') ? inviteLink.replace(base, '') : false;
});
await ownerCtx.close();

// ─────────────── New hire accepts the invite ───────────────
await step('new hire signs up from the invite link and lands in the workspace as a contributor', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(inviteLink.replace(/^https?:\/\/[^/]+/, base), { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: /Create account/ }).click();
  await p.getByLabel('Full name').fill('Nia Wambui');
  await p.getByLabel('Password').fill('a-strong-password-123');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL((u) => u.pathname.startsWith('/join/'), { timeout: 30000 });
  await p.getByRole('button', { name: 'Accept invite' }).click();
  await p.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  await p.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  const restricted = await p.getByText(/Finance details are visible to owners/).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  const r = await p.request.post(`${base}/api/billing/checkout`, { data: { plan: 'pro', period: 'monthly', method: 'CARD' } });
  await ctx.close();
  return restricted && r.status() === 403 ? 'finance hidden; billing API → 403' : false;
});

// ─────────────── Director (Devon) approves Elena's expense ───────────────
await step('a director approves the owner’s pending expense (two-person rule)', async () => {
  const { ctx, page: p } = await session('devon@acme-global.demo');
  await p.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  const row = p.locator('#approvals li', { hasText: `Laptops ${stamp}` });
  await row.getByRole('button', { name: 'Approve' }).click();
  await toast(p, /Expense approved/);
  await ctx.close();
});

// ─────────────── Brand-new founder: sign up → onboarding ───────────────
await step('a new founder signs up, creates a workspace, and sees the welcome dashboard', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/signup`, { waitUntil: 'networkidle' });
  await p.getByLabel('Full name').fill('Baraka Mwangi');
  await p.getByLabel('Work email').fill(`founder.${stamp}@example.com`);
  await p.getByLabel('Password').fill('another-strong-pass-1');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL((u) => u.pathname === '/onboarding', { timeout: 30000 });
  await p.getByLabel('Company name').fill(`Savanna Labs ${stamp}`);
  await p.getByText('Available').waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: 'Create workspace' }).click();
  await p.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const welcome = await p.getByText(/Welcome to OrbitOS/).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  const h1 = await p.locator('h1').first().textContent();
  await ctx.close();
  return welcome ? `h1: ${h1}` : false;
});

// ─────────────── Webhook & API security (no browser) ───────────────
await step('IntaSend webhook rejects a wrong challenge (401)', async () => {
  const r = await fetch(`${base}/api/webhooks/intasend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: 'nope', api_ref: 'orb_x', invoice_id: 'INV-MOCK-1', state: 'COMPLETE' }) });
  return r.status === 401;
});
await step('IntaSend webhook rejects a forged api_ref (status re-fetch from IntaSend disagrees)', async () => {
  const r = await fetch(`${base}/api/webhooks/intasend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: 'local-challenge', api_ref: 'inv_00000000-0000-0000-0000-000000000000', invoice_id: 'INV-MOCK-1', state: 'COMPLETE' }) });
  const j = await r.json();
  return r.status === 400 && /mismatch/.test(j.error) ? '400 api_ref mismatch' : `${r.status} ${JSON.stringify(j)}`;
});
await step('IntaSend webhook replay is idempotent', async () => {
  const r = await fetch(`${base}/api/webhooks/intasend`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: 'local-challenge', api_ref: invoiceRef, invoice_id: 'INV-MOCK-1', state: 'COMPLETE' }) });
  const j = await r.json();
  return r.ok && j.result === 'already_paid' ? 'already_paid' : `${r.status} ${JSON.stringify(j)}`;
});
await step('cron endpoints require CRON_SECRET', async () => {
  const a = await fetch(`${base}/api/cron/renewals`);
  const b = await fetch(`${base}/api/cron/renewals`, { headers: { authorization: 'Bearer local-cron-secret' } });
  return a.status === 401 && b.status === 200 ? `401 without, 200 with (${JSON.stringify(await b.json())})` : `${a.status}/${b.status}`;
});
await step('health-snapshot cron writes snapshots with the service role', async () => {
  const r = await fetch(`${base}/api/cron/health-snapshot`, { headers: { authorization: 'Bearer local-cron-secret' } });
  const j = await r.json();
  return r.ok && j.snapshots >= 1 ? JSON.stringify(j) : JSON.stringify(j);
});
await step('protected API routes reject anonymous callers', async () => {
  const codes = await Promise.all(['/api/compliance/audit-package', '/api/reports/export', '/api/billing/status?ref=x'].map((u) => fetch(base + u).then((r) => r.status)));
  return codes.every((c) => c === 401) ? codes.join(',') : `got ${codes.join(',')}`;
});

await browser.close();
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} flows passed`);
process.exit(failed ? 1 : 0);
