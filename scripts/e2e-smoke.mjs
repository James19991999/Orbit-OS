// End-to-end smoke test against the local stack: real sign-in through the UI, then visits pages.
// Usage: node scripts/e2e-smoke.mjs [baseUrl] [outDir] [path ...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:3000';
const out = process.argv[3] || '/tmp/e2e';
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ['/dashboard'];
const email = process.env.E2E_EMAIL || 'elena@acme-global.demo';
const password = process.env.E2E_PASSWORD || 'OrbitOS-demo-2026';
const width = Number(process.env.E2E_WIDTH || 1440);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width, height: 1000 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Work email').fill(email);
await page.getByLabel('Password', { exact: true }).fill(password);
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
await page.waitForURL(/\/dashboard/, { timeout: 30000 });
let failed = 0;
for (const p of paths) {
  const res = await page.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 60000 });
  const status = res?.status();
  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  const errBox = await page.locator('text=This page couldn').count();
  const name = p.replace(/[^a-z0-9]+/gi, '_') || 'root';
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const ok = status === 200 && !errBox;
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'ERR'} ${status} ${p} — h1: ${h1?.trim()}${errBox ? ' [error boundary]' : ''}`);
  if (errBox) console.log('   ', (await page.locator('[role=alert]').first().textContent().catch(() => ''))?.slice(0, 300));
}
if (problems.length) console.log('Browser problems:\n  ' + [...new Set(problems)].slice(0, 15).join('\n  '));
await browser.close();
process.exit(failed ? 1 : 0);
