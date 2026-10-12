// Product tour, templates, swipe actions and workspace branding, in real Chromium against the local stack
// (scripts/local-stack/start.sh, which includes a storage stand-in that enforces the real storage policies).
// Usage: node scripts/e2e-polish.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';

const base = process.argv[2] || 'http://localhost:3000';
const GATEWAY = 'http://localhost:54321';
const PW = 'OrbitOS-demo-2026';
const results = [];
const sqlRaw = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q])
  .toString().trim();
// First line only: psql adds a command tag (e.g. INSERT 0 1) after RETURNING rows.
const sql = (q) => sqlRaw(q).split('\n')[0];
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) {
    ok(name, false, process.env.SHOTS ? e.message.split('\n').slice(0, 14).join(' / ').slice(0, 1500) : e.message.split('\n')[0].slice(0, 220));
    if (process.env.SHOTS && lastPage) await lastPage.screenshot({ path: `${process.env.SHOTS}/fail-${results.length}.png`, fullPage: true }).catch(() => {});
  }
}
let lastPage = null;
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  lastPage = page;
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
/** A real finger swipe (Chromium touch events → pointer events with pointerType "touch"). */
async function swipe(page, locator, dx) {
  // Centre the row first so the finger lands on it, not on the bottom navigation bar.
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const box = await locator.boundingBox();
  if (!box) fail('row not visible');
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2; const x0 = box.x + box.width / 2 - dx / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 12, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** A tiny valid PNG (solid colour), built here so the test needs no files. */
function png(w = 32, h = 32) {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([15, 118, 110], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parseRgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

// ── Known starting point ──
const id = (email) => sql(`select id from auth.users where email = '${email}'`);
const ORG = sql(`select id from organizations order by created_at limit 1`);
const SAM = id('sam@acme-global.demo'); const DEVON = id('devon@acme-global.demo'); const ELENA = id('elena@acme-global.demo');
sql(`update organizations set brand_color = null, brand_logo_path = null; delete from storage.objects where bucket_id = 'branding';
     update profiles set language = 'en'; update profiles set tour_done_at = null where id = '${SAM}';
     delete from tasks where tags @> array['e2e-polish'];
     delete from finance_entries where note like 'e2e-polish%'; delete from leave_requests;`);
const mine = sql(`insert into tasks (org_id, title, status, priority, assignee_id, due_on, tags) values
  ('${ORG}', 'e2e-polish swipe me', 'in_progress', 'high', '${SAM}', current_date, array['e2e-polish']) returning id`);
const exp1 = sql(`insert into finance_entries (org_id, kind, amount_minor, currency, vendor, note, approval_status, created_by) values
  ('${ORG}', 'expense', 450000, 'KES', 'e2e-polish Taxi', 'e2e-polish approve', 'pending', '${SAM}') returning id`);
const exp2 = sql(`insert into finance_entries (org_id, kind, amount_minor, currency, vendor, note, approval_status, created_by) values
  ('${ORG}', 'expense', 990000, 'KES', 'e2e-polish Hotel', 'e2e-polish reject', 'pending', '${SAM}') returning id`);
const own = sql(`insert into finance_entries (org_id, kind, amount_minor, currency, vendor, note, approval_status, created_by) values
  ('${ORG}', 'expense', 120000, 'KES', 'e2e-polish Mine', 'e2e-polish own', 'pending', '${DEVON}') returning id`);

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

// ── 11. Product tour ──
const sam = await login(browser, 'sam@acme-global.demo');
watch(sam.page);
await step('first sign-in: a small, non-blocking invitation to take the tour', async () => {
  const p = sam.page;
  if (!/\/(dashboard|my-day)/.test(p.url())) await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const prompt = p.getByRole('region', { name: /30-second tour/ });
  await prompt.waitFor({ timeout: 8000 });
  await axe(p, 'tour prompt', '[role=region]');
  // The page still works underneath: the search button is clickable.
  await p.locator('[data-tour="search"]').first().click({ trial: true });
  return 'prompt shown; page usable';
});
await step('the tour walks through 6 steps, highlights each area, keeps focus inside, and finishing remembers it', async () => {
  const p = sam.page;
  await p.getByRole('button', { name: 'Start tour' }).click();
  const dlg = p.getByRole('dialog');
  await dlg.getByText('Step 1 of 6').waitFor();
  await axe(p, 'tour dialog', '[role=dialog]');
  if (!(await dlg.getByRole('button', { name: 'Next' }).evaluate((b) => b === document.activeElement))) fail('focus not on Next');
  await p.keyboard.press('ArrowRight');
  await dlg.getByText('Step 2 of 6').waitFor();
  await dlg.getByRole('heading', { name: 'Everything in one place' }).waitFor();
  for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
  if (!(await dlg.evaluate((d) => d.contains(document.activeElement)))) fail('focus escaped the tour');
  await dlg.getByRole('button', { name: 'Back' }).click();
  await dlg.getByText('Step 1 of 6').waitFor();
  for (let i = 0; i < 5; i++) await dlg.getByRole('button', { name: 'Next' }).click();
  await dlg.getByRole('heading', { name: 'You’re all set' }).waitFor();
  await dlg.getByRole('button', { name: 'Finish' }).click();
  await dlg.waitFor({ state: 'detached' });
  await p.waitForTimeout(500);
  if (sql(`select tour_done_at is not null from profiles where id = '${SAM}'`) !== 't') fail('tour_done_at not saved');
  return 'saved to profile';
});
await step('after finishing, no prompt on the next visit (also in a fresh browser)', async () => {
  const fresh = await login(browser, 'sam@acme-global.demo');
  await fresh.page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await fresh.page.waitForTimeout(2000);
  const n = await fresh.page.getByRole('region', { name: /30-second tour/ }).count();
  await fresh.ctx.close();
  return n === 0 || fail('prompt shown again');
});
await step('"Take the tour" in search replays it; Esc leaves', async () => {
  const p = sam.page;
  await p.keyboard.press('Control+k');
  await p.getByRole('combobox', { name: 'Search OrbitOS' }).fill('tour');
  await p.getByRole('option', { name: 'Take the tour' }).click();
  const dlg = p.getByRole('dialog');
  await dlg.getByText('Step 1 of 6').waitFor();
  await p.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  return true;
});
await step('the tour speaks Kiswahili and French', async () => {
  const out = [];
  for (const [lang, start, step1] of [['sw', 'Anza ziara', 'Hatua 1 kati ya 6'], ['fr', 'Commencer la visite', 'Étape 1 sur 6']]) {
    sql(`update profiles set language = '${lang}', tour_done_at = null where id = '${SAM}'`);
    const s = await login(browser, 'sam@acme-global.demo');
    await s.page.evaluate(() => localStorage.removeItem('orbit_tour_done'));
    await s.page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
    await s.page.getByRole('button', { name: start }).click({ timeout: 8000 });
    await s.page.getByRole('dialog').getByText(step1).waitFor();
    await axe(s.page, `tour ${lang}`, '[role=dialog]');
    await s.page.keyboard.press('Escape');
    await s.ctx.close();
    out.push(lang);
  }
  sql(`update profiles set language = 'en', tour_done_at = now() where id = '${SAM}'`);
  return out.join(', ');
});

// ── 12. Templates ──
await step('Kiswahili: "Kufunga mwezi" creates the month-end tasks, dated from the start date, in Kiswahili', async () => {
  sql(`update profiles set language = 'sw' where id = '${ELENA}'`);
  const e = await login(browser, 'elena@acme-global.demo');
  watch(e.page);
  const p = e.page;
  await p.goto(`${base}/operations`, { waitUntil: 'networkidle' });
  const before = Number(sql(`select count(*) from tasks where org_id = '${ORG}'`));
  await p.getByRole('button', { name: 'Tumia kiolezo' }).click();
  const dlg = p.getByRole('dialog');
  await dlg.getByText('Kufunga mwezi').click();
  await dlg.getByLabel('Tarehe ya kuanza', { exact: true }).fill('2026-11-02');
  await dlg.getByLabel('Mpe zote', { exact: true }).selectOption({ label: 'Sam Okafor' }).catch(async () => {
    const opts = await dlg.getByLabel('Mpe zote', { exact: true }).locator('option').allTextContents();
    await dlg.getByLabel('Mpe zote', { exact: true }).selectOption({ label: opts.find((o) => o.startsWith('Sam')) });
  });
  await axe(p, 'template dialog', 'dialog[open]');
  const btn = dlg.getByRole('button', { name: /^Unda kazi \d+$/ });
  const n = Number((await btn.textContent()).match(/\d+/)[0]);
  await btn.click();
  await dlg.waitFor({ state: 'detached' });
  await p.waitForTimeout(500);
  const after = Number(sql(`select count(*) from tasks where org_id = '${ORG}'`));
  const first = sql(`select due_on || '|' || coalesce(assignee_id::text, '') from tasks where title = 'Linganisha taarifa za M-Pesa na benki' order by created_at desc limit 1`);
  sql(`update tasks set tags = tags || array['e2e-polish'] where created_at > now() - interval '2 minutes' and org_id = '${ORG}'`);
  sql(`update profiles set language = 'en' where id = '${ELENA}'`);
  await e.ctx.close();
  if (after - before !== n) fail(`created ${after - before}, expected ${n}`);
  if (first !== `2026-11-02|${SAM}`) fail(`first task: ${first}`);
  return `${n} tasks, Kiswahili titles, assigned and dated`;
});

// ── 13. Swipe on a phone ──
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
await step('My day on a phone: swipe a task right to finish it; Undo puts it back', async () => {
  const s = await login(browser, 'sam@acme-global.demo', phone);
  watch(s.page);
  const p = s.page;
  await p.goto(`${base}/my-day`, { waitUntil: 'networkidle' });
  await axe(p, 'my day (phone)');
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) fail(`page is ${w}px wide on a 390px phone`);
  const row = p.locator(`[data-task-row="${mine}"]`);
  await swipe(p, row, 260);
  await p.getByText('Marked done: e2e-polish swipe me').waitFor();
  await p.waitForTimeout(400);
  if (sql(`select status from tasks where id = '${mine}'`) !== 'done') fail('not done');
  if (!p.url().endsWith('/my-day')) fail(`swipe also opened the task: ${p.url()}`);
  await p.getByRole('button', { name: 'Undo' }).click();
  await p.getByText('Moved back').waitFor();
  if (sql(`select status from tasks where id = '${mine}'`) !== 'in_progress') fail('not restored');
  // A short drag snaps back and does nothing.
  await row.waitFor();
  await swipe(p, row, 40);
  await p.waitForTimeout(400);
  const st = sql(`select status from tasks where id = '${mine}'`);
  // The tick button does the same for mouse, keyboard and screen readers.
  await p.getByRole('button', { name: 'Mark “e2e-polish swipe me” done' }).click();
  await p.getByText('Marked done: e2e-polish swipe me').waitFor();
  await p.waitForTimeout(300);
  const viaButton = sql(`select status from tasks where id = '${mine}'`);
  await s.ctx.close();
  if (st !== 'in_progress') fail('short drag changed the task');
  return viaButton === 'done' || fail('button did not complete');
});
await step('expense approvals on a phone: swipe right approves, left rejects; your own can’t be swiped to approve', async () => {
  const d = await login(browser, 'devon@acme-global.demo', phone);
  watch(d.page);
  const p = d.page;
  await p.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  const rowOf = (vendor) => p.locator('li', { hasText: vendor }).filter({ has: p.getByRole('button', { name: 'Approve' }) }).first();
  await swipe(p, rowOf('e2e-polish Taxi'), 260);
  await p.waitForTimeout(800);
  await swipe(p, rowOf('e2e-polish Hotel'), -260);
  await p.waitForTimeout(800);
  await swipe(p, rowOf('e2e-polish Mine'), 260);
  await p.waitForTimeout(800);
  const st = sql(`select string_agg(note || '=' || approval_status, ',' order by note) from finance_entries where id in ('${exp1}', '${exp2}', '${own}')`);
  await d.ctx.close();
  return st === 'e2e-polish approve=approved,e2e-polish own=pending,e2e-polish reject=rejected' || fail(st);
});
await step('leave approvals on a phone: swipe right approves (with the optional reply)', async () => {
  const from = sql(`select (date_trunc('week', current_date) + interval '21 days')::date::text`);   // a Monday
  const lv = sql(`insert into leave_requests (org_id, user_id, kind, starts_on, ends_on, status, note) values
    ('${ORG}', '${SAM}', 'annual', '${from}', '${from}', 'pending', 'e2e-polish day off') returning id`);
  const d = await login(browser, 'devon@acme-global.demo', phone);
  const p = d.page;
  await p.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  const li = p.locator('li', { hasText: 'e2e-polish day off' });
  await li.getByLabel(/Message to/).fill('Enjoy!');
  await swipe(p, li.locator('.relative.overflow-hidden').first(), 260);
  await p.waitForTimeout(1000);
  const st = sql(`select status || '|' || coalesce(decision_note, '') from leave_requests where id = '${lv}'`);
  await d.ctx.close();
  return st === 'approved|Enjoy!' || fail(st);
});

// ── 14. Branding ──
let elena;
await step('owner uploads a logo and picks a colour; it shows across the app for everyone', async () => {
  elena = await login(browser, 'elena@acme-global.demo');
  watch(elena.page);
  const p = elena.page;
  await p.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  const sec = p.locator('#branding');
  await sec.scrollIntoViewIfNeeded();
  await sec.locator('input[type=file]').setInputFiles({ name: 'acme.png', mimeType: 'image/png', buffer: png() });
  await p.getByText('Branding saved').first().waitFor();
  await sec.getByTestId('brand-logo-preview').waitFor();
  await sec.getByRole('button', { name: 'Use #0f766e' }).click();
  await sec.getByRole('button', { name: 'Save branding' }).click();
  await p.waitForTimeout(1200);
  const row = sql(`select brand_color || '|' || brand_logo_path from organizations where id = '${ORG}'`);
  if (!new RegExp(`^#0f766e\\|${ORG}/logo-\\d+\\.png$`).test(row)) fail(row);
  await axe(p, 'branding settings', '#branding');
  // Another member sees the logo in the top bar and the colour on buttons.
  const s = await login(browser, 'sam@acme-global.demo');
  await s.page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  const logo = s.page.getByRole('img', { name: /logo/ }).first();
  const src = await logo.getAttribute('src');
  const loaded = await logo.evaluate((img) => img.complete && img.naturalWidth > 0);
  const css = await s.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-primary-container').trim());
  await s.ctx.close();
  if (!src?.includes('/storage/v1/object/public/branding/') || !loaded) fail(`logo ${src} loaded=${loaded}`);
  if (!css || css === '37 99 235') fail(`accent not applied: ${css}`);
  return `logo + accent ${css}`;
});
await step('custom colours stay readable: buttons and links keep 4.5:1 contrast in light and dark', async () => {
  const p = elena.page;
  const out = [];
  for (const hex of ['#fde047', '#0b1326', '#ff00ff']) {
    sql(`update organizations set brand_color = '${hex}' where id = '${ORG}'`);
    for (const theme of ['light', 'dark']) {
      await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
      await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const [btnBg, link, bg] = await p.evaluate(() => {
        const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().split(/\s+/).map(Number);
        return [v('--c-primary-container'), v('--c-primary'), getComputedStyle(document.body).backgroundColor];
      });
      const r1 = ratio(btnBg, [255, 255, 255]); const r2 = ratio(link, parseRgb(bg));
      if (r1 < 4.5 || r2 < 4.5) fail(`${hex} ${theme}: button ${r1.toFixed(2)}, link ${r2.toFixed(2)}`);
      out.push(`${hex}/${theme} ${r1.toFixed(1)}/${r2.toFixed(1)}`);
    }
  }
  sql(`update organizations set brand_color = '#0f766e' where id = '${ORG}'`);
  return out.join('; ');
});
await step('only the owner can change branding (API, storage and screen)', async () => {
  const s = await login(browser, 'sam@acme-global.demo');
  const api = await s.page.evaluate(async () => (await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ color: '#be123c' }) })).status);
  const token = await s.page.evaluate(() => { const c = document.cookie.split('; ').filter((x) => x.startsWith('sb-')).map((x) => decodeURIComponent(x.split('=').slice(1).join('='))).join(''); try { return JSON.parse(c.startsWith('base64-') ? atob(c.slice(7)) : c).access_token; } catch { return null; } });
  let storage = 'skipped';
  if (token) {
    const r = await fetch(`${GATEWAY}/storage/v1/object/branding/${ORG}/logo-1999999999999.png`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: png() });
    storage = String(r.status);
  }
  const d = await login(browser, 'devon@acme-global.demo');
  await d.page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  const note = await d.page.locator('#branding').getByText('Only the workspace owner can change branding.').count();
  const saveBtn = await d.page.locator('#branding').getByRole('button', { name: 'Save branding' }).count();
  await s.ctx.close(); await d.ctx.close();
  if (api !== 403) fail(`contributor API ${api}`);
  if (token && storage !== '403') fail(`contributor storage upload ${storage}`);
  if (!note || saveBtn) fail('director sees edit controls');
  return `API 403, storage ${storage}, director read-only`;
});
await step('bad input is refused: colour that isn’t #rrggbb, another workspace’s logo, a logo never uploaded, CSS injection', async () => {
  const p = elena.page;
  const call = (body) => p.evaluate(async (b) => (await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).status, body);
  const r = [
    await call({ color: 'red' }),
    await call({ color: '#0f766e;}body{display:none' }),
    await call({ logoPath: `00000000-0000-0000-0000-000000000000/logo-1234567890.png` }),
    await call({ logoPath: `${ORG}/logo-1234567890.png` }),
    await call({ logoPath: `${ORG}/../x.png` }),
    await call({ extra: 1 }),
  ];
  const still = sql(`select brand_color from organizations where id = '${ORG}'`);
  if (r.some((x) => x !== 400) || still !== '#0f766e') fail(`${r.join(',')} colour=${still}`);
  return r.join(',');
});
await step('replacing and removing the logo deletes the old file; "Use OrbitOS blue" resets the colour', async () => {
  const p = elena.page;
  const old = sql(`select brand_logo_path from organizations where id = '${ORG}'`);
  await p.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  const sec = p.locator('#branding');
  await sec.locator('input[type=file]').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: png(48, 48) });
  await p.getByText('Branding saved').first().waitFor();
  await p.waitForTimeout(500);
  const now = sql(`select brand_logo_path from organizations where id = '${ORG}'`);
  const oldGone = (await fetch(`${GATEWAY}/storage/v1/object/public/branding/${old}`)).status;
  // Too big and wrong type are caught before upload.
  await sec.locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(1024 * 1024 + 10) });
  await sec.getByText('That image is larger than 1 MB.').waitFor();
  await sec.locator('input[type=file]').setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await sec.getByText('Use a PNG, JPG or WebP image.').waitFor();
  await sec.getByRole('button', { name: 'Remove logo' }).click();
  await sec.getByText('No logo yet').waitFor();
  await sec.getByRole('button', { name: 'Use OrbitOS blue' }).click();
  await p.waitForTimeout(1000);
  const nowGone = (await fetch(`${GATEWAY}/storage/v1/object/public/branding/${now}`)).status;
  const row = sql(`select coalesce(brand_color, '-') || '|' || coalesce(brand_logo_path, '-') from organizations where id = '${ORG}'`);
  const audits = Number(sql(`select count(*) from audit_log where action = 'org.branding_updated' and org_id = '${ORG}'`));
  if (now === old || oldGone !== 404 || nowGone !== 404) fail(`old ${oldGone}, now ${nowGone}`);
  if (row !== '-|-') fail(row);
  return `files cleaned up; ${audits} audit entries`;
});
await step('no JavaScript errors on any page', async () => (errors.length ? fail(errors.slice(0, 3).join(' | ')) : true));

await browser.close();
sql(`delete from tasks where tags @> array['e2e-polish']; delete from finance_entries where note like 'e2e-polish%'; delete from leave_requests;
     update organizations set brand_color = null, brand_logo_path = null; update profiles set language = 'en'`);
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
