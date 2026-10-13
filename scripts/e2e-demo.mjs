// Demo mode (founders only) in real Chromium against the local stack. The browser's speech engine is replaced by a
// recorder with Kenyan/UK/French voices, so the test can check exactly what was said, in which language and voice.
// Usage: node scripts/e2e-demo.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const FOUNDER = 'priya@acme-global.demo';
const results = [];
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 260)); }
}
async function axe(page, label, include) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  const r = await b.analyze();
  if (r.violations.length) fail(`${label}: ${r.violations.map((v) => `${v.id} (${v.nodes[0]?.target})`).join('; ')}`);
}

/** A stand-in speech engine: records each utterance and "finishes speaking" after a short pause. */
const FAKE_SPEECH = () => {
  const voices = [
    { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB', voiceURI: 'sonia', localService: false, default: true },
    { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'google-uk', localService: false, default: false },
    { name: 'Microsoft Zuri Online (Natural) - Kiswahili (Kenya)', lang: 'sw-KE', voiceURI: 'zuri', localService: false, default: false },
    { name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', voiceURI: 'denise', localService: false, default: false },
  ];
  const spoken = []; let current = null; let paused = false;
  window.__spoken = spoken;
  Object.defineProperty(window, '__speechMs', { get: () => Number(sessionStorage.getItem('fake_speech_ms') || 350), set: (v) => sessionStorage.setItem('fake_speech_ms', String(v)), configurable: true });
  const synth = {
    get speaking() { return !!current; },
    getVoices: () => voices,
    speak(u) {
      spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null, rate: u.rate });
      current = u;
      setTimeout(() => { if (current === u && !paused) { current = null; u.onend?.({}); } }, window.__speechMs);
    },
    cancel() { if (current) { const u = current; current = null; u.onerror?.({ error: 'interrupted' }); } },
    pause() { paused = true; }, resume() { paused = false; },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; } };
};

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}
const spoken = (p) => p.evaluate(() => window.__spoken.slice());
const caption = (p) => p.getByTestId('demo-caption').first().textContent();
async function openSearch(p, text) {
  await p.locator('[data-tour="search"]').first().click();
  await p.keyboard.type(text);
}

const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
// A founder demos as a manager of their own workspace (the demo company's founder account is an auditor by default).
const ROLE = sql(`select role from memberships where user_id = (select id from auth.users where email = '${FOUNDER}') limit 1`);
sql(`update memberships set role = 'director' where user_id = (select id from auth.users where email = '${FOUNDER}')`);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];

await step('only founders have demo mode: customers see no command and ?demo=1 does nothing', async () => {
  const s = await login(browser, 'elena@acme-global.demo');
  await openSearch(s.page, 'demo');
  await s.page.waitForTimeout(600);
  const cmd = await s.page.getByRole('option', { name: /demo mode/i }).count();
  await s.page.keyboard.press('Escape');
  await s.page.goto(`${base}/dashboard?demo=1`, { waitUntil: 'networkidle' });
  await s.page.waitForTimeout(800);
  const region = await s.page.getByTestId('demo').count();
  const said = (await spoken(s.page)).length;
  await s.ctx.close();
  return (cmd === 0 && region === 0 && said === 0) || fail(`command ${cmd}, region ${region}, spoken ${said}`);
});

const f = await login(browser, FOUNDER);
const p = f.page;
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });

await step('“Start demo mode” from search: the voice introduces OrbitOS and the caption matches what is said', async () => {
  await openSearch(p, 'demo');
  await p.getByRole('option', { name: 'Start demo mode' }).click();
  await p.getByTestId('demo').waitFor();
  const first = await caption(p);
  if (!/^Welcome to OrbitOS/.test(first)) fail(`caption: ${first}`);
  await p.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 8000 });   // moves on by itself
  const s = await spoken(p);
  if (s[0].text !== first || s[0].lang !== 'en-GB' || !/Sonia/.test(s[0].voice)) fail(JSON.stringify(s[0]));
  await axe(p, 'demo panel', '[data-testid="demo"]');
  return `${s.length} lines so far, voice “${s[0].voice.split(' - ')[0]}”`;
});
await step('Space pauses (nothing more is said), → and ← move between points', async () => {
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press(' ');
  const pausedAt = (await spoken(p)).length;
  await p.waitForTimeout(1500);
  if ((await spoken(p)).length !== pausedAt) fail('kept talking while paused');
  if ((await p.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')) !== 'true') fail('play button state');
  const before = await caption(p);
  await p.evaluate(() => { window.__speechMs = 60000; });   // long lines from here, so captions stay put while checked
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(300);
  const after = await caption(p);
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(300);
  const back = await caption(p);
  if (after === before || back !== before) fail(`${before} → ${after} → ${back}`);
  return 'paused, next, back';
});
await step('each screen has its own narration and a highlight on what is being described', async () => {
  await p.goto(`${base}/operations?tab=finance`, { waitUntil: 'networkidle' });
  await p.getByText(/^Finance shows cash, burn and runway/).waitFor();
  await p.waitForTimeout(800);
  const ring = await p.getByTestId('demo-highlight').count();
  if (!ring) fail(`no highlight; caption “${await caption(p)}”; approvals ${await p.locator('#approvals').count()}; spoken ${JSON.stringify((await spoken(p)).slice(-2).map((x) => x.text.slice(0, 30)))}`);
  const approvals = await p.locator('#approvals').boundingBox();
  const box = await p.getByTestId('demo-highlight').first().boundingBox();
  if (!ring || !approvals || !box || Math.abs(box.y - approvals.y) > 20) fail(`highlight ${JSON.stringify(box)} vs ${JSON.stringify(approvals)}`);
  const last = (await spoken(p)).at(-1);
  return last.text.startsWith('Finance shows') ? 'Finance narrated; approvals highlighted' : fail(last.text);
});
await step('switching to Kiswahili speaks with the Kenyan Kiswahili voice', async () => {
  await p.getByLabel('Narration language').selectOption('sw');
  await p.getByText(/^Fedha inaonyesha pesa taslimu/).waitFor();
  const last = (await spoken(p)).at(-1);
  if (last.lang !== 'sw-KE' || !/Zuri/.test(last.voice)) fail(JSON.stringify(last));
  await axe(p, 'demo panel (sw)', '[data-testid="demo"]');
  return last.voice.split(' - ')[0];
});
await step('the narration follows you to the next screen, and offers the next one at the end', async () => {
  await p.getByLabel('Narration language').selectOption('en');
  await p.evaluate(() => { window.__speechMs = 120; });
  await p.goto(`${base}/scheduling`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__spoken.some((x) => x.text.startsWith('Scheduling finds meeting times')), null, { timeout: 8000 });
  const next = p.getByRole('button', { name: 'Next: Culture' });
  await next.waitFor({ timeout: 8000 });
  await next.click();
  await p.waitForURL((u) => u.pathname === '/culture');
  await p.waitForFunction(() => window.__spoken.some((x) => x.text.startsWith('Culture keeps a remote team connected')), null, { timeout: 8000 });
  return 'Scheduling → Culture';
});
await step('M mutes the voice but captions keep going; H hides the controls for a clean recording', async () => {
  await p.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await p.getByTestId('demo-caption').first().waitFor();
  await p.keyboard.press('m');
  const n = (await spoken(p)).length;
  const c1 = await caption(p);
  await p.waitForFunction((c) => document.querySelector('[data-testid="demo-caption"]')?.textContent !== c, c1, { timeout: 9000 });
  if ((await spoken(p)).length !== n) fail('spoke while muted');
  await p.keyboard.press('h');
  const controls = await p.getByRole('button', { name: 'End demo' }).count();
  await p.keyboard.press('h');
  await p.keyboard.press('m');
  return controls === 0 || fail('controls still shown');
});
await step('Shift+Esc ends the demo, and it stays off after a reload', async () => {
  await p.keyboard.press('Shift+Escape');
  await p.getByTestId('demo').waitFor({ state: 'detached' });
  const n = (await spoken(p)).length;
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  return ((await p.getByTestId('demo').count()) === 0) || fail(`still on (${n})`);
});
await step('typing in a field is never hijacked by the demo keys', async () => {
  await p.evaluate(() => window.dispatchEvent(new Event('orbit:demo')));
  await p.getByTestId('demo').waitFor();
  await p.goto(`${base}/help`, { waitUntil: 'networkidle' });
  const box = p.getByRole('textbox', { name: 'Ask a question' });
  await box.fill('');
  await box.type('hm m ');
  const v = await box.inputValue();
  const stillOn = await p.getByTestId('demo').count();
  await p.keyboard.press('Shift+Escape');
  return (v === 'hm m ' && stillOn === 1) || fail(`typed “${v}”`);
});
await step('no JavaScript errors', async () => (errors.length ? fail(errors.slice(0, 3).join(' | ')) : true));

await f.ctx.close();
await browser.close();
sql(`update memberships set role = '${ROLE}' where user_id = (select id from auth.users where email = '${FOUNDER}')`);
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} demo checks passed`);
process.exit(failed ? 1 : 0);
