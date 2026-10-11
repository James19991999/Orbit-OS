// Real-browser accessibility check: Playwright (pre-installed Chromium) + axe-core, in BOTH themes.
// Public pages always; app pages too when the demo login (or E2E_EMAIL/E2E_PASSWORD) can sign in.
// Usage: node scripts/a11y-check.mjs [baseUrl]   ·   A11Y_LANG=sw|fr checks the Kiswahili/French UI (longer words → overflow).
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const LANG = ['sw', 'fr'].includes(process.env.A11Y_LANG) ? process.env.A11Y_LANG : 'en';
const pre = LANG === 'en' ? '' : `/${LANG}`;
const PUBLIC = [pre || '/', `${pre}/pricing`, '/login', '/signup', '/forgot-password', `${pre}/security`, `${pre}/trust`, '/legal/privacy', '/legal/terms', '/this-page-does-not-exist'];
const EMAIL = process.env.E2E_EMAIL || 'elena@acme-global.demo';
/** The signed-in UI language comes from the profile; set it for the run (local stack only). */
function setProfileLang(l) {
  try { execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-qc', `update profiles set language = '${l}' where email = '${EMAIL}'`]); } catch { /* not the local stack */ }
}
setProfileLang(LANG);
const APP = ['/dashboard', '/operations', '/operations?tab=finance', '/operations?tab=activity', '/scheduling', '/culture', '/culture?tab=channels',
  '/culture?tab=kudos', '/culture/channels/general', '/compliance', '/reports', '/people', '/settings', '/settings/billing', '/settings/audit-log',
  '/profile', '/notifications'];
const withApp = process.env.A11Y_APP !== '0';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let total = 0;
for (const [theme, width] of [['dark', 1280], ['light', 1280], ['dark', 375]]) {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 812 : 900 }, colorScheme: theme, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: 'orbit_theme', value: theme, url: base }, { name: 'orbit_lang', value: LANG, url: base }]);
  const page = await ctx.newPage();
  const pages = [...PUBLIC];
  if (withApp) {
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill(EMAIL);
    await page.locator('input[type=password]').first().fill(process.env.E2E_PASSWORD || 'OrbitOS-demo-2026');
    await page.locator('input[type=password]').first().press('Enter');
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 }).then(() => pages.push(...APP)).catch(() => console.log('(could not sign in — app pages skipped)'));
  }
  for (const p of pages) {
    await page.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 60000 });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) { total++; console.log(`FAIL [${LANG} ${theme}${mobile ? ' 375px' : ''}] ${p} — horizontal overflow ${overflow}px`); }
    total += r.violations.length;
    console.log(`${r.violations.length ? 'FAIL' : 'ok  '} [${theme}${mobile ? ' 375px' : ''}] ${p}`);
    for (const v of r.violations) {
      console.log(`     - ${v.id} (${v.impact}): ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`         ${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join(' ').slice(0, 160)}`);
    }
  }
  await ctx.close();
}
await browser.close();
if (LANG !== 'en') setProfileLang('en');
console.log(`\n${total} violation group(s) total`);
process.exit(total ? 1 : 0);
