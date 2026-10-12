// Language coverage check in a real browser: signs in as the same person in English, Kiswahili and French, opens
// every screen, and reports UI text that is identical in English and the other language (i.e. not translated).
// Usage: node scripts/e2e-i18n.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const PW = 'OrbitOS-demo-2026';
const EMAIL = 'elena@acme-global.demo';
const sql = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();

const one = (q) => sql(q).split('\n')[0];
const ids = {
  task: one("select id from tasks order by created_at limit 1"),
  invoice: one("select id from invoices order by created_at limit 1"),
  meeting: one("select id from meetings order by starts_at desc limit 1"),
  framework: one("select id from compliance_frameworks order by created_at limit 1"),
  channel: one("select slug from channels order by name limit 1"),
};
const PAGES = ['/dashboard', '/operations', '/scheduling', '/culture', '/culture?tab=channels', '/culture?tab=kudos', '/compliance',
  '/reports', '/people', '/people?tab=leave', '/my-day', '/settings', '/settings/audit-log', '/settings/billing', '/profile', '/notifications',
  ids.task && `/operations/tasks/${ids.task}`, ids.invoice && `/operations/invoices/${ids.invoice}`, ids.meeting && `/scheduling/meetings/${ids.meeting}`,
  ids.framework && `/compliance/frameworks/${ids.framework}`, ids.channel && `/culture/channels/${ids.channel}`].filter(Boolean);
const PUBLIC = { en: ['/', '/pricing', '/security', '/trust'], sw: ['/sw', '/sw/pricing', '/sw/security', '/sw/trust'], fr: ['/fr', '/fr/pricing', '/fr/security', '/fr/trust'] };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/** Visible text lines plus accessible names/placeholders/titles, per page. */
async function harvest(page) {
  return page.evaluate(() => {
    const out = new Set();
    // Material Symbols render icon names as text ("settings", "send"); they are not words people read.
    for (const ic of document.querySelectorAll('.ms, .material-symbols-outlined')) ic.textContent = '';
    for (const l of document.body.innerText.split('\n')) { const s = l.trim(); if (s) out.add(s); }
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
      for (const a of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(a); if (v) out.add(v.trim()); }
    }
    out.add(`<title> ${document.title}`);
    return [...out];
  });
}

async function collect(lang) {
  sql(`update profiles set language = '${lang}' where email = '${EMAIL}'`);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx.addCookies([{ name: 'orbit_lang', value: lang, url: base }]);
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').first().fill(PW);
  await page.locator('input[type=password]').first().press('Enter');
  await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const byPage = {};
  for (const p of PAGES) {
    await page.goto(`${base}${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    byPage[p] = await harvest(page);
  }
  for (const [i, p] of PUBLIC[lang].entries()) {
    await page.goto(`${base}${p}`, { waitUntil: 'networkidle' });
    byPage[`public:${PUBLIC.en[i]}`] = await harvest(page);
  }
  await ctx.close();
  return byPage;
}

// English words that only show up in sentences/labels, not in names or numbers.
const ENGLISH = /\b(the|and|your|you|with|for|to|of|in|is|no|not|yet|this|from|all|add|new|save|cancel|delete|open|show|send|edit|remove|connect|loading|settings|members?|days?|hours?|ago|today|due|overdue)\b/i;

try {
  const en = await collect('en');
  const results = {};
  for (const lang of ['sw', 'fr']) {
    const other = await collect(lang);
    results[lang] = {};
    for (const p of Object.keys(en)) {
      const set = new Set(other[p] ?? []);
      const same = (en[p] ?? []).filter((s) => set.has(s) && ENGLISH.test(s) && s.length > 3);
      if (same.length) results[lang][p] = same;
    }
  }
  sql(`update profiles set language = 'en' where email = '${EMAIL}'`);
  let total = 0;
  for (const [lang, pages] of Object.entries(results)) {
    for (const [p, lines] of Object.entries(pages)) { total += lines.length; console.log(`\n[${lang}] ${p}`); for (const l of lines) console.log(`   ${JSON.stringify(l.slice(0, 160))}`); }
  }
  console.log(`\n${total} identical English-looking strings across ${PAGES.length + 4} screens × 2 languages (review: user data such as task titles is expected).`);
} finally {
  sql(`update profiles set language = 'en' where email = '${EMAIL}'`);
  await browser.close();
}
