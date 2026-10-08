import { buildIcs, fold, icsEscape, googleCalendarUrl, jitsiUrl } from '@/lib/ics';
import { winAnsi, toCsv, buildPdf } from '@/lib/reports/pdf';
import { verifyGithubSignature, githubToActivity } from '@/lib/github';
import { createHmac } from 'node:crypto';
import { safeNext } from '@/lib/auth/redirect';
import { serializeCookie, readRemember } from '@/lib/supabase/client';
import { isIdleExpired, tenantFromHost, isProtected } from '@/lib/supabase/session-rules';
import { applyRemember } from '@/lib/supabase/cookies';
import { shiftInsights } from '@/lib/scheduling/insights';
import { focusState, mmss } from '@/components/culture/focus';
import { streakFrom } from '@/lib/streak';
import { periodRange } from '@/lib/reports/period';
import { monthlyFromEntries } from '@/lib/metrics/finance';
import { auditLabel } from '@/lib/audit-labels';
import { parsePayrollCsv } from '@/components/operations/FinanceDialogs';
import { parseDevicesCsv } from '@/components/compliance/ComplianceActions';
import { slugify } from '@/components/auth/OnboardingForm';
import { dueLabel } from '@/lib/tasks';


describe('calendar invites (.ics)', () => {
  const ev = { uid: 'abc', title: 'Sync, with; commas', description: 'Line 1\nLine 2', start: new Date('2026-10-12T14:00:00Z'), durationMin: 45, url: 'https://meet.jit.si/x',
    organizer: { name: 'Elena', email: 'e@x.io' }, attendees: [{ name: 'Marcus', email: 'm@x.io' }] };
  it('produces a valid VEVENT with escaped text, UTC times and CRLF endings', () => {
    const ics = buildIcs(ev, new Date('2026-10-01T00:00:00Z'));
    const unfolded = ics.replace(/\r\n /g, '');
    expect(ics).toContain('DTSTART:20261012T140000Z');
    expect(ics).toContain('DTEND:20261012T144500Z');
    expect(unfolded).toContain('SUMMARY:Sync\\, with\\; commas');
    expect(unfolded).toContain('ATTENDEE;CN=Marcus;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:m@x.io');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
  it('folds long lines and escapes newlines', () => {
    expect(fold('x'.repeat(160)).split('\r\n')[1].startsWith(' ')).toBe(true);
    expect(icsEscape('a\nb')).toBe('a\\nb');
    expect(icsEscape('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
  });
  it('builds Google Calendar and Jitsi links', () => {
    expect(googleCalendarUrl(ev)).toContain('dates=20261012T140000Z%2F20261012T144500Z');
    expect(jitsiUrl('acme', '12345678-aaaa')).toBe('https://meet.jit.si/orbitos-acme-12345678');
  });
});

describe('exports', () => {
  it('maps unicode punctuation to WinAnsi for standard PDF fonts', () => {
    expect(winAnsi('“Ship it” — now → 🚀')).toBe('"Ship it" - now -> ');
  });
  it('CSV quotes cells and neutralises spreadsheet formula injection', () => {
    expect(toCsv([['a,b', '=HYPERLINK("x")', '-2', 'ok']])).toBe('"a,b","\'=HYPERLINK(""x"")",\'-2,ok\r\n');
  });
  it('builds a multi-page PDF', async () => {
    const bytes = await buildPdf({ title: 'T', sections: [{ heading: 'Rows', table: { head: ['a', 'b'], rows: Array.from({ length: 120 }, (_, i) => [`row ${i}`, '—']) } }] });
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('GitHub webhook helpers', () => {
  const secret = 's3cret'; const body = JSON.stringify({ a: 1 });
  const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  it('verifies HMAC-SHA256 signatures in constant time', () => {
    expect(verifyGithubSignature(body, sig, secret)).toBe(true);
    expect(verifyGithubSignature(body + ' ', sig, secret)).toBe(false);
    expect(verifyGithubSignature(body, null, secret)).toBe(false);
    expect(verifyGithubSignature(body, sig, '')).toBe(false);
  });
  it('maps merged PRs and pushes; ignores unmerged PRs', () => {
    expect(githubToActivity('pull_request', { action: 'closed', pull_request: { merged: true, number: 7, title: 'Fix', html_url: 'u', user: { login: 'amara' } }, repository: { full_name: 'acme/api' } })?.title).toBe('Merged PR #7 in acme/api: Fix');
    expect(githubToActivity('pull_request', { action: 'closed', pull_request: { merged: false } })).toBeNull();
    expect(githubToActivity('push', { commits: [{}, {}], ref: 'refs/heads/main', repository: { full_name: 'acme/api' } })?.title).toBe('Pushed 2 commits to acme/api@main');
  });
});

describe('auth & session helpers', () => {
  it('safeNext blocks open redirects', () => {
    expect(safeNext('/operations?tab=finance')).toBe('/operations?tab=finance');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', null]) expect(safeNext(bad as string)).toBe('/dashboard');
  });
  it('inactivity timeout', () => {
    const now = 10 * 3_600_000;
    expect(isIdleExpired(String(now - 9 * 3_600_000), '8', now)).toBe(true);
    expect(isIdleExpired(String(now - 7 * 3_600_000), '8', now)).toBe(false);
    expect(isIdleExpired(undefined, '8', now)).toBe(false);
    // no timeout cookie yet → the 8h default still applies (the check is never skipped)
    expect(isIdleExpired(String(now - 9 * 3_600_000), undefined, now)).toBe(true);
    expect(isIdleExpired(String(now - 7 * 3_600_000), undefined, now)).toBe(false);
  });
  it('resolves tenants from subdomains only under the root domain', () => {
    expect(tenantFromHost('acme-global.orbitos.io', 'orbitos.io')).toBe('acme-global');
    expect(tenantFromHost('orbitos.io', 'orbitos.io')).toBeNull();
    expect(tenantFromHost('www.orbitos.io', 'orbitos.io')).toBeNull();
    expect(tenantFromHost('evil.com', 'orbitos.io')).toBeNull();
    expect(tenantFromHost('acme.orbitos.io:3000', undefined)).toBeNull();
  });
  it('protects app routes but not public ones', () => {
    expect(isProtected('/settings/billing')).toBe(true);
    expect(isProtected('/pricing')).toBe(false);
    expect(isProtected('/dashboardx')).toBe(false);
  });
  it('browser cookie writer: session cookie when not remembered, Max-Age when remembered', () => {
    expect(serializeCookie('sb-x', 'a b', { path: '/', sameSite: 'lax' })).toBe('sb-x=a%20b; Path=/; SameSite=lax');
    expect(serializeCookie('sb-x', 'v', { path: '/', maxAge: 2592000 })).toContain('Max-Age=2592000');
    expect(readRemember('a=1; orbit_remember=0')).toBe(false);
    expect(readRemember('a=1')).toBe(true);
  });
  it('remember-device controls cookie lifetime', () => {
    expect(applyRemember({ maxAge: 400 * 86400, path: '/' }, true).maxAge).toBe(30 * 86400);
    expect(applyRemember({ maxAge: 400 * 86400, path: '/' }, false).maxAge).toBeUndefined();
    expect(applyRemember({ maxAge: 0 }, false).maxAge).toBe(0); // deletions stay deletions
  });
});

describe('chrono-optimizer', () => {
  const w = (userId: string, timezone: string) => ({ userId, timezone, workStart: '09:00', workEnd: '17:00' });
  it('suggests the smallest shift that brings more attendees inside working hours', () => {
    const wins = new Map([['lon', w('lon', 'Europe/London')], ['nbo', w('nbo', 'Africa/Nairobi')]]);
    // 06:00 UTC Monday: Nairobi 09:00 (inside), London 07:00 (outside) → +120 min puts both inside
    const r = shiftInsights([{ id: 'm', title: 'Sync', starts_at: '2026-10-12T06:00:00Z', duration_min: 30, participantIds: ['lon', 'nbo'] }], wins);
    expect(r[0]).toMatchObject({ insideBefore: 1, insideAfter: 2, shiftMin: 120 });
  });
  it('returns nothing when everyone is already inside', () => {
    const wins = new Map([['a', w('a', 'UTC')], ['b', w('b', 'UTC')]]);
    expect(shiftInsights([{ id: 'm', title: 'x', starts_at: '2026-10-12T10:00:00Z', duration_min: 30, participantIds: ['a', 'b'] }], wins)).toEqual([]);
  });
});

describe('misc', () => {
  it('shared focus timer state', () => {
    const start = new Date('2026-10-12T10:00:00Z').toISOString();
    const at = (m: number) => Date.parse(start) + m * 60_000;
    expect(focusState(start, 25, 5, 4, at(10))).toMatchObject({ active: true, round: 1, inFocus: true });
    expect(focusState(start, 25, 5, 4, at(27))).toMatchObject({ active: true, round: 1, inFocus: false });
    expect(focusState(start, 25, 5, 4, at(121))).toMatchObject({ active: false, finished: true });
    expect(focusState(null, 25, 5, 4)).toEqual({ active: false });
    expect(mmss(125_000)).toBe('02:05');
  });
  it('check-in streaks', () => {
    expect(streakFrom(['2026-10-08', '2026-10-07', '2026-10-05'], '2026-10-08')).toBe(2);
    expect(streakFrom(['2026-10-07', '2026-10-06'], '2026-10-08')).toBe(2);
    expect(streakFrom([], '2026-10-08')).toBe(0);
  });
  it('report periods are contiguous and comparable', () => {
    const p = periodRange('last_quarter', new Date('2026-10-08T00:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(p.prevEnd.getTime()).toBe(p.start.getTime());
    expect(p.label).toBe('Q3 2026');
  });
  it('monthlyFromEntries matches the RPC shape and skips unapproved / other-currency rows', () => {
    const rows = monthlyFromEntries([
      { kind: 'expense', amount_minor: 100, occurred_on: '2026-09-03', currency: 'KES', approval_status: 'approved' },
      { kind: 'expense', amount_minor: 999, occurred_on: '2026-09-04', currency: 'KES', approval_status: 'pending' },
      { kind: 'expense', amount_minor: 999, occurred_on: '2026-09-04', currency: 'USD', approval_status: 'approved' },
      { kind: 'cash_balance', amount_minor: 5, occurred_on: '2026-09-01', currency: 'KES', created_at: '1' },
      { kind: 'cash_balance', amount_minor: 7, occurred_on: '2026-09-30', currency: 'KES', created_at: '2' },
    ], 'KES');
    expect(rows).toEqual([{ month: '2026-09-01', kind: 'expense', total_minor: 100 }, { month: '2026-09-30', kind: 'cash_balance', total_minor: 7 }]);
  });
  it('audit labels', () => {
    expect(auditLabel('auth.login_failed')).toBe('Failed sign-in attempt');
    expect(auditLabel('compliance_controls.status_changed')).toBe('compliance controls status changed');
  });
  it('CSV importers validate rows', () => {
    const p = parsePayrollCsv('period,countries,total,provider\n2026-09,9,12500000.00,Deel\nbad,1,1,x');
    expect(p.rows).toEqual([{ period: '2026-09', country_count: 9, total_minor: 1250000000, provider_label: 'Deel' }]);
    expect(p.errors[0]).toMatch(/Line 3/);
    const d = parseDevicesCsv('name,os,owner,enc,agent\nMac,macOS,ANA@x.io,yes,no', { 'ana@x.io': 'u1' });
    expect(d.rows[0]).toEqual({ name: 'Mac', os: 'macOS', owner_id: 'u1', encrypted: true, agent_installed: false });
  });
  it('slugify and due labels', () => {
    expect(slugify('  Ácme Global Ltd. ')).toBe('acme-global-ltd');
    expect(dueLabel('2026-10-06', new Date('2026-10-08T12:00:00Z'))).toBe('2d overdue');
    expect(dueLabel('2026-10-08', new Date('2026-10-08T12:00:00Z'))).toBe('Due today');
  });
});
