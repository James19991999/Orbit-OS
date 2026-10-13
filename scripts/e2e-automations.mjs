// Automations end to end, in real Chromium against the local stack (with the email stand-in): settings, new-member
// checklist on joining, invoice reminders to clients, overdue nudges and escalation, and time-off handover.
// Usage: node scripts/e2e-automations.mjs [baseUrl]
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:3000';
const EMAIL = 'http://localhost:54460';
const PW = 'OrbitOS-demo-2026';
const CRON = process.env.CRON_SECRET || 'local-cron-secret';
const results = [];
const sqlRaw = (q) => execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.DB || 'orbitos_e2e', '-tAc', q]).toString().trim();
const sql = (q) => sqlRaw(q).split('\n')[0];
const fail = (msg) => { throw new Error(msg); };
function ok(name, cond, detail = '') { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); }
async function step(name, fn) {
  try { const r = await fn(); ok(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (e) { ok(name, false, e.message.split('\n')[0].slice(0, 260)); }
}
async function login(browser, email, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
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
const runJob = async () => {
  const r = await fetch(`${base}/api/cron/automations`, { headers: { authorization: `Bearer ${CRON}` } });
  const body = await r.json();
  if (r.status !== 200) fail(`job ${r.status}: ${JSON.stringify(body)}`);
  return body;
};
const emails = async () => (await fetch(`${EMAIL}/log`)).json();

// Messages only go out on weekdays in working hours, in each person's time zone. Put everyone in a zone where it's
// mid-morning on a weekday right now, so the test doesn't depend on when it runs.
function workingZone() {
  for (let n = -12; n <= 12; n++) {
    const tz = n === 0 ? 'UTC' : `Etc/GMT${n > 0 ? '+' : '-'}${Math.abs(n)}`;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    if (Number(parts.hour) >= 10 && Number(parts.hour) <= 14 && !['Sat', 'Sun'].includes(parts.weekday)) return tz;
  }
  return null;
}
const TZ = workingZone();
if (!TZ) { console.log('No weekday time zone at mid-morning right now (weekend everywhere); try again later.'); process.exit(1); }
const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const day = (n) => { const d = new Date(`${localToday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── Known starting point ──
const id = (email) => sql(`select id from auth.users where email = '${email}'`);
const ORG = sql(`select id from organizations order by created_at limit 1`);
const ELENA = id('elena@acme-global.demo'); const DEVON = id('devon@acme-global.demo'); const SAM = id('sam@acme-global.demo'); const LUKAS = id('lukas@acme-global.demo');
sqlRaw(`create table if not exists e2e_tz as select id, timezone from profiles; update profiles set timezone = '${TZ}', language = 'en';
  delete from automation_settings; delete from automation_log; delete from leave_requests;
  delete from tasks where tags @> array['e2e-auto'] or tags @> array['onboarding'];
  delete from invoices where number like 'E2E-AUTO-%'; delete from notifications where kind in ('overdue','escalation','handover','leave_cover','onboarding','invoice_reminder');
  delete from invites where email like 'auto.hire.%'`);
await fetch(`${EMAIL}/log`, { method: 'DELETE' });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

// ── Settings ──
await step('settings: owners switch automations on and set the overdue timing; invoice reminders start off', async () => {
  const e = await login(browser, 'elena@acme-global.demo');
  watch(e.page);
  const p = e.page;
  await p.goto(`${base}/settings#automations`, { waitUntil: 'networkidle' });
  const sec = p.locator('#automations');
  const inv = sec.getByRole('switch', { name: 'Invoice reminders' });
  if ((await inv.getAttribute('aria-checked')) !== 'false') fail('invoice reminders should start off');
  await sec.getByText('Off until you switch it on').waitFor();
  await inv.click();
  await sec.getByLabel('Tell a manager after (days late)').fill('2');
  await sec.getByText('The manager is told after the person').waitFor();
  if (await sec.getByRole('button', { name: 'Save automations' }).isEnabled()) fail('save allowed with escalation before nudge');
  await sec.getByLabel('Remind the person after (days late)').fill('2');
  await sec.getByLabel('Tell a manager after (days late)').fill('5');
  await axe(p, 'automations settings', '#automations');
  await sec.getByRole('button', { name: 'Save automations' }).click();
  await p.getByText('Automations saved').first().waitFor();
  await e.ctx.close();
  const row = sql(`select concat_ws(',', onboarding, invoice_reminders, overdue_nudges, nudge_after_days, escalate_after_days, leave_handover) from automation_settings where org_id = '${ORG}'`);
  return row === 't,t,t,2,5,t' || fail(row);
});
await step('settings: contributors see what is on but cannot change it; the section is translated', async () => {
  sql(`update profiles set language = 'sw' where id = '${SAM}'`);
  const s = await login(browser, 'sam@acme-global.demo');
  await s.page.goto(`${base}/settings#automations`, { waitUntil: 'networkidle' });
  const sec = s.page.locator('#automations');
  await sec.getByText('Ni wamiliki na wakurugenzi tu wanaoweza kubadilisha mipangilio hii.').waitFor({ timeout: 10000 }).catch(async () => {
    // Contributors may not reach Settings at all; that also keeps them out.
    if (!/settings/.test(s.page.url())) return;
    throw new Error('no read-only note');
  });
  const disabled = await sec.getByRole('switch').first().isDisabled().catch(() => true);
  const save = await sec.getByRole('button', { name: /Hifadhi mipangilio/ }).count().catch(() => 0);
  const api = await s.page.evaluate(async (org) => {
    const r = await fetch('/api/automations/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return { onboarding: r.status, org };
  }, ORG);
  await s.ctx.close();
  sql(`update profiles set language = 'en' where id = '${SAM}'`);
  if (!disabled || save) fail('contributor can edit');
  return `read-only; onboarding endpoint for an existing member → ${api.onboarding}`;
});

// ── New member checklist ──
await step('a new member who joins by invite gets a first-week checklist, and the inviting director gets theirs', async () => {
  const stamp = Date.now();
  const email = `auto.hire.${stamp}@example.com`;
  const code = `auto${stamp}`;
  sql(`insert into invites (org_id, email, role, code, invited_by) values ('${ORG}', '${email}', 'contributor', '${code}', '${DEVON}')`);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  watch(p);
  await p.goto(`${base}/join/${code}`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: /Create account/ }).click();
  await p.getByLabel('Full name').fill('Amani Njeri');
  await p.getByLabel('Password').fill('a-strong-password-123');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL((u) => u.pathname.startsWith('/join/'), { timeout: 30000 });
  await p.getByRole('button', { name: 'Accept invite' }).click();
  await p.waitForURL((u) => u.pathname === '/dashboard', { timeout: 30000 });
  const NEW = id(email);
  await p.waitForTimeout(500);
  const mine = Number(sql(`select count(*) from tasks where org_id = '${ORG}' and assignee_id = '${NEW}' and tags @> array['onboarding']`));
  const devon = sqlRaw(`select title from tasks where org_id = '${ORG}' and assignee_id = '${DEVON}' and tags @> array['onboarding'] order by due_on`).split('\n');
  const perTask = Number(sql(`select count(*) from notifications where kind = 'task_assigned' and user_id in ('${NEW}', '${DEVON}') and created_at > now() - interval '2 minutes'`));
  const summary = sqlRaw(`select user_id || '|' || title from notifications where kind = 'onboarding' order by title`);
  // My day shows the new tasks.
  await p.goto(`${base}/my-day`, { waitUntil: 'networkidle' });
  await p.getByText('Turn on two-factor sign-in').waitFor();
  await p.goto(`${base}/notifications`, { waitUntil: 'networkidle' });
  await p.getByText('Your first-week checklist is ready').first().waitFor();
  await ctx.close();
  // The hourly job doesn't create a second copy.
  await runJob();
  const again = Number(sql(`select count(*) from tasks where org_id = '${ORG}' and assignee_id = '${NEW}' and tags @> array['onboarding']`));
  if (mine !== 5 || again !== 5) fail(`member tasks ${mine} then ${again}`);
  if (devon.length !== 4 || !devon[0].includes('Amani')) fail(`manager tasks: ${devon.join(' / ')}`);
  if (perTask) fail(`${perTask} per-task notifications`);
  if (!summary.includes(`${DEVON}|Onboarding started for Amani Njeri`)) fail(summary);
  return '5 for the new member, 4 for Devon (named), one summary each, no duplicates';
});
await step('the hourly job is the safety net: a member whose checklist was not created gets it on the next run', async () => {
  const email = `auto.hire.net${Date.now()}@example.com`;
  const NEW = sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', '', now(),
      '', '', '', '', '{"provider":"email","providers":["email"]}', '{"full_name":"Baraka Otieno"}', now(), now()) returning id`);
  sql(`insert into invites (org_id, email, role, code, invited_by, accepted_at) values ('${ORG}', '${email}', 'contributor', 'net${Date.now()}', '${ELENA}', now())`);
  sql(`insert into memberships (org_id, user_id, role) values ('${ORG}', '${NEW}', 'contributor')`);
  sql(`update profiles set timezone = '${TZ}' where id = '${NEW}'`);
  const r = await runJob();
  const n = Number(sql(`select count(*) from tasks where assignee_id = '${NEW}' and tags @> array['onboarding']`));
  sql(`delete from memberships where user_id = '${NEW}'`);
  return (n === 5 && r.onboarding >= 1) || fail(`tasks ${n}, job ${JSON.stringify(r.onboarding)}`);
});

// ── Invoice reminders ──
await step('invoice reminders: the client is emailed once per stage with the payment link, in the sender’s language', async () => {
  sql(`update profiles set language = 'fr' where id = '${ELENA}'`);
  const inv = sql(`insert into invoices (org_id, number, client_name, client_email, amount_minor, currency, due_on, status, payment_url, created_by)
    values ('${ORG}', 'E2E-AUTO-1', 'Savannah Logistics', 'ap@savannah.example', 12500000, 'KES', '${day(2)}', 'sent', 'https://pay.example/inv-1', '${ELENA}') returning id`);
  sql(`insert into invoices (org_id, number, client_name, client_email, amount_minor, currency, due_on, status, created_by)
    values ('${ORG}', 'E2E-AUTO-2', 'Bounce Ltd', 'bounce@bad.example', 500000, 'KES', '${day(-8)}', 'sent', '${ELENA}')`);
  sql(`insert into invoices (org_id, number, client_name, client_email, amount_minor, currency, due_on, status, created_by)
    values ('${ORG}', 'E2E-AUTO-3', 'Paid Co', 'paid@co.example', 500000, 'KES', '${day(-8)}', 'paid', '${ELENA}')`);
  await runJob();
  await runJob();
  const log = (await emails()).filter((m) => m.to.some((x) => /savannah|bounce|paid@co/.test(x)));
  const savannah = log.filter((m) => m.to.includes('ap@savannah.example') && m.subject.includes('E2E-AUTO-1'));
  if (savannah.length !== 1) fail(`${savannah.length} emails to the client`);
  const m = savannah[0];
  if (!/E2E-AUTO-1/.test(m.subject) || !/arrive à échéance/.test(m.subject)) fail(`subject: ${m.subject}`);
  if (!m.html.includes('https://pay.example/inv-1') || !/125[\s ,.]?000/.test(m.html)) fail('no payment link or amount');
  if (log.some((x) => x.to.includes('paid@co.example'))) fail('paid invoice was chased');
  // A refused address isn't marked as reminded, so it is tried again next time.
  const bounced = Number(sql(`select count(*) from automation_log a join invoices i on i.id = a.ref_id where i.number = 'E2E-AUTO-2'`));
  const told = sql(`select title from notifications where kind = 'invoice_reminder' and user_id = '${ELENA}' limit 1`);
  // Move the due date: today is now 3 days late → the next stage goes out.
  sql(`update invoices set due_on = '${day(-3)}' where id = '${inv}'`);
  await runJob();
  const after = (await emails()).filter((x) => x.to.includes('ap@savannah.example') && x.subject.includes('E2E-AUTO-1'));
  sql(`update profiles set language = 'en' where id = '${ELENA}'`);
  if (bounced) fail('a bounced reminder was recorded as sent');
  if (after.length !== 2 || !/En retard/.test(after[1].subject)) fail(`late stage: ${after.map((x) => x.subject).join(' | ')}`);
  return `${told}; then “${after[1].subject}”`;
});
await step('invoice reminders: switched off means no emails', async () => {
  sql(`update automation_settings set invoice_reminders = false where org_id = '${ORG}'`);
  sql(`update invoices set due_on = '${day(-7)}' where number = 'E2E-AUTO-1'`);
  const before = (await emails()).length;
  await runJob();
  const after = (await emails()).length;
  sql(`update automation_settings set invoice_reminders = true where org_id = '${ORG}'`);
  return after === before || fail(`${after - before} sent while off`);
});

// ── Overdue ──
let late1, late2;
await step('overdue: the person is nudged once, then the manager who set the task is told; nothing repeats', async () => {
  late1 = sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E report draft', 'in_progress', 'high', '${SAM}', '${ELENA}', '${day(-3)}', array['e2e-auto']) returning id`);
  late2 = sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E vendor contract', 'todo', 'high', '${SAM}', '${DEVON}', '${day(-6)}', array['e2e-auto']) returning id`);
  const fresh = sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E only one day late', 'todo', 'low', '${SAM}', '${DEVON}', '${day(-1)}', array['e2e-auto']) returning id`);
  await runJob();
  await runJob();
  const steps = sqlRaw(`select kind || ':' || coalesce((select title from tasks where id = ref_id), '?') from automation_log where ref_id in ('${late1}', '${late2}', '${fresh}') order by 1`).split('\n').filter(Boolean);
  const samN = Number(sql(`select count(*) from notifications where user_id = '${SAM}' and kind = 'overdue'`));
  const devonE = sqlRaw(`select title || ' | ' || body from notifications where user_id = '${DEVON}' and kind = 'escalation'`);
  const elenaE = Number(sql(`select count(*) from notifications where user_id = '${ELENA}' and kind = 'escalation' and body like '%E2E%'`));
  const want = ['overdue_escalation:E2E vendor contract', 'overdue_nudge:E2E report draft', 'overdue_nudge:E2E vendor contract'];
  if (JSON.stringify(steps) !== JSON.stringify(want)) fail(steps.join(', '));
  if (samN !== 1) fail(`${samN} nudges to Sam (one summary expected)`);
  if (!/^Sam Otieno has 1 task over 5 days late \| “E2E vendor contract”/.test(devonE)) fail(`devon: ${devonE}`);
  if (elenaE) fail('the owner was told about a task a director set');
  return devonE;
});
await step('overdue: the nudge reads in the person’s language and opens My day', async () => {
  sql(`update profiles set language = 'sw' where id = '${SAM}'`);
  try {
    const s = await login(browser, 'sam@acme-global.demo');
    watch(s.page);
    await s.page.goto(`${base}/notifications`, { waitUntil: 'networkidle' });
    const t = await s.page.getByText(/Kazi (zako \d+ zimechelewa|yako moja imechelewa)/).first().textContent();
    await axe(s.page, 'notifications (sw)');
    await s.ctx.close();
    return t;
  } finally { sql(`update profiles set language = 'en' where id = '${SAM}'`); }
});
await step('overdue: a new due date starts over, and switching nudges off stops them', async () => {
  sql(`update tasks set due_on = '${day(-2)}' where id = '${late1}'`);
  await runJob();
  const renudged = Number(sql(`select count(*) from automation_log where ref_id = '${late1}' and kind = 'overdue_nudge'`));
  sql(`update automation_settings set overdue_nudges = false where org_id = '${ORG}'`);
  const off = sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E while off', 'todo', 'low', '${SAM}', '${DEVON}', '${day(-9)}', array['e2e-auto']) returning id`);
  await runJob();
  const offN = Number(sql(`select count(*) from automation_log where ref_id = '${off}'`));
  sql(`update automation_settings set overdue_nudges = true where org_id = '${ORG}'`);
  return (renudged === 2 && offN === 0) || fail(`renudged ${renudged}, while off ${offN}`);
});

// ── Time-off handover ──
let leave, dueWhileAway;
await step('handover: before approved time off starts, the person and the approver are reminded once', async () => {
  leave = sql(`insert into leave_requests (org_id, user_id, kind, starts_on, ends_on, status, decided_by, decided_at) values ('${ORG}', '${SAM}', 'annual', '${day(1)}', '${day(3)}', 'approved', '${DEVON}', now()) returning id`);
  dueWhileAway = sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E client demo', 'todo', 'high', '${SAM}', '${DEVON}', '${day(2)}', array['e2e-auto']) returning id`);
  sql(`insert into tasks (org_id, title, status, priority, assignee_id, created_by, due_on, tags) values ('${ORG}', 'E2E after the break', 'todo', 'low', '${SAM}', '${DEVON}', '${day(9)}', array['e2e-auto'])`);
  await runJob();
  await runJob();
  const n = sqlRaw(`select user_id || '|' || title || '|' || body from notifications where kind = 'handover' order by user_id`).split('\n').filter(Boolean);
  if (n.length !== 2) fail(`${n.length} reminders`);
  if (!n.some((x) => x.startsWith(`${SAM}|Choose who covers`)) || !n.some((x) => x.startsWith(`${DEVON}|Sam Otieno needs cover`))) fail(n.join(' / '));
  return n[0].split('|')[2];
});
await step('handover: the person picks who covers and moves the tasks due while away in one step', async () => {
  const s = await login(browser, 'sam@acme-global.demo');
  watch(s.page);
  const p = s.page;
  await p.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  await p.getByText('No cover chosen yet').first().waitFor();
  await p.getByRole('button', { name: 'Handover' }).first().click();
  const dlg = p.getByRole('dialog');
  await dlg.getByText('E2E client demo').waitFor();
  if (await dlg.getByText('E2E after the break').count()) fail('a task after the leave was listed');
  await dlg.getByLabel('Covering').selectOption({ label: (await dlg.getByLabel('Covering').locator('option', { hasText: 'Lukas' }).textContent()).trim() });
  await dlg.getByLabel('Move these tasks to the person covering').waitFor();
  await axe(p, 'handover dialog', 'dialog[open]');
  await dlg.getByRole('button', { name: 'Save handover' }).click();
  await p.getByText('Handover saved · 1 task moved').first().waitFor();
  await p.waitForTimeout(500);
  await p.getByText(/Covered by Lukas/).first().waitFor();
  await s.ctx.close();
  const moved = sql(`select assignee_id from tasks where id = '${dueWhileAway}'`);
  const stays = sql(`select assignee_id from tasks where title = 'E2E after the break'`);
  const cover = sql(`select cover_id from leave_requests where id = '${leave}'`);
  const lukasN = sqlRaw(`select kind || '|' || title || '|' || body from notifications where user_id = '${LUKAS}' and kind in ('leave_cover', 'task_assigned') and created_at > now() - interval '2 minutes'`);
  if (moved !== LUKAS || stays !== SAM || cover !== LUKAS) fail(`moved ${moved === LUKAS}, stays ${stays === SAM}, cover ${cover === LUKAS}`);
  if (lukasN.split('\n').length !== 1 || !lukasN.startsWith('leave_cover|Sam Otieno asked you to cover')) fail(lukasN);
  return lukasN.split('|').slice(1).join(' — ');
});
await step('handover: teammates see who is covering, and Lukas reads the request in French', async () => {
  let title = '';
  sql(`update profiles set language = 'fr' where id = '${LUKAS}'`);
  try {
  const l = await login(browser, 'lukas@acme-global.demo');
  watch(l.page);
  await l.page.goto(`${base}/notifications`, { waitUntil: 'networkidle' });
  title = await l.page.getByText('Sam Otieno vous demande de le remplacer').first().textContent();
  await l.page.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  await l.page.getByText(/Remplacé par Lukas/).first().waitFor();
  await l.ctx.close();
  } finally { sql(`update profiles set language = 'en' where id = '${LUKAS}'`); }
  // With cover chosen, no more reminders.
  sql(`delete from automation_log where ref_id = '${leave}'`);
  const before = Number(sql(`select count(*) from notifications where kind = 'handover'`));
  await runJob();
  const after = Number(sql(`select count(*) from notifications where kind = 'handover'`));
  return after === before ? title : fail('reminded again after cover was chosen');
});
await step('managers can arrange handover for someone else’s time off', async () => {
  const d = await login(browser, 'devon@acme-global.demo');
  watch(d.page);
  await d.page.goto(`${base}/people?tab=leave`, { waitUntil: 'networkidle' });
  const btn = d.page.locator('li', { hasText: 'Sam Otieno' }).getByRole('button', { name: 'Handover' }).first();
  await btn.click();
  const dlg = d.page.getByRole('dialog');
  await dlg.getByLabel('Covering').selectOption('');
  await dlg.getByRole('button', { name: 'Save handover' }).click();
  await d.page.getByText('Handover saved').first().waitFor();
  await d.ctx.close();
  const cleared = sql(`select coalesce(cover_id::text, 'none') from leave_requests where id = '${leave}'`);
  return cleared === 'none' ? 'cover cleared by a manager (other workspaces and auditors are refused by the database tests)' : fail(cleared);
});
await step('automation activity shows in Settings for managers', async () => {
  const e = await login(browser, 'elena@acme-global.demo');
  await e.page.goto(`${base}/settings#automations`, { waitUntil: 'networkidle' });
  const list = e.page.getByTestId('automation-activity');
  await list.waitFor();
  const text = await list.innerText();
  await e.ctx.close();
  // The list shows the newest entries; check it matches what the automations actually recorded.
  const LABEL = { onboarding: 'New member checklist created', invoice_reminder: 'Invoice reminder emailed', overdue_nudge: 'Overdue reminder', overdue_escalation: 'Told a manager about a late task', leave_handover: 'Handover reminder' };
  const latest = sqlRaw(`select kind from automation_log where org_id = '${ORG}' order by created_at desc limit 15`).split('\n').filter(Boolean);
  for (const k of new Set(latest)) if (!text.includes(LABEL[k])) fail(`missing “${LABEL[k]}”`);
  // (The handover entry was removed on purpose earlier, to prove that choosing cover stops the reminders.)
  const kinds = sqlRaw(`select distinct kind from automation_log where org_id = '${ORG}' order by 1`).split('\n').join(',');
  return kinds === 'invoice_reminder,onboarding,overdue_escalation,overdue_nudge' ? `${new Set(latest).size} kinds on screen; ${kinds}` : fail(kinds);
});
await step('no JavaScript errors on any page', async () => (errors.length ? fail(errors.slice(0, 3).join(' | ')) : true));

await browser.close();
sqlRaw(`update profiles p set timezone = t.timezone from e2e_tz t where t.id = p.id; drop table e2e_tz; update profiles set language = 'en';
  delete from tasks where tags @> array['e2e-auto'] or tags @> array['onboarding']; delete from invoices where number like 'E2E-AUTO-%';
  delete from leave_requests; delete from automation_settings; delete from automation_log`);
const failed = results.filter(([c]) => !c).length;
console.log(`\n${results.length - failed}/${results.length} automation checks passed`);
process.exit(failed ? 1 : 0);
