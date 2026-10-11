import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from '@/components/ui/SmartLink';
import { Card, CardHeader, Icon, Pill, Stat, Banner, EmptyState } from '@/components/ui';
import { requireFounder } from '@/lib/founder/access';
import { loadFounderData, logConsoleView, configChecklist, JOBS, type Metrics } from '@/lib/founder/metrics';
import { hasServiceRole } from '@/lib/supabase/admin';
import { getFormat } from '@/lib/locale/server';
import { formatMoney, type Currency } from '@/lib/format';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { AutoRefresh } from '@/components/founder/AutoRefresh';
import { RevenueChart } from '@/components/founder/RevenueChart';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Founder console', robots: { index: false, follow: false } };

const money = (minor: number, currency: string) => formatMoney(minor, currency as Currency, { decimals: false });
const planName = (p: string) => PLANS[p as PlanId]?.name ?? p;

type JobState = 'ok' | 'late' | 'failing' | 'never';
function jobState(j: Metrics['jobs'][number] | undefined, everyHours: number, now: number): JobState {
  if (!j) return 'never';
  if (j.last_status !== null && j.last_status >= 400) return 'failing';
  const okAt = j.last_ok_at ? Date.parse(j.last_ok_at) : 0;
  return now - okAt > (everyHours * 1.5 + 0.25) * 3_600_000 ? 'late' : 'ok';
}
const JOB_PILL: Record<JobState, { tone: 'healthy' | 'warning' | 'alert' | 'neutral'; label: string }> = {
  ok: { tone: 'healthy', label: 'On time' }, late: { tone: 'warning', label: 'Late' }, failing: { tone: 'alert', label: 'Failing' }, never: { tone: 'neutral', label: 'No run yet' },
};

export default async function FounderConsole(props: { searchParams: Promise<{ q?: string }> }) {
  const [ctx, fmt, searchParams] = await Promise.all([requireFounder(), getFormat(), props.searchParams]);
  if (!hasServiceRole()) {
    return <Shell><Banner tone="alert">SUPABASE_SERVICE_ROLE_KEY is not set on this deployment, so the console can’t read across workspaces.</Banner></Shell>;
  }
  const q = (searchParams.q ?? '').slice(0, 80);
  const h = await headers();
  const [data] = await Promise.all([
    loadFounderData(q),
    logConsoleView(ctx.user.id, ctx.user.email, h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null),
  ]);
  const m = data.metrics;
  const now = Date.parse(m.generated_at);

  // Revenue: last 12 months per currency, empty months included so gaps are visible.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 11 + i, 1));
    return { month: d.toISOString().slice(0, 7), label: fmt.date(d, 'month') };
  });
  const currencies = [...new Set(m.revenue_by_month.map((r) => r.currency))].sort();
  const thisMonth = months[11].month;
  const revenueThisMonth = currencies.map((c) => ({ currency: c, amount: m.revenue_by_month.filter((r) => r.currency === c && r.month === thisMonth).reduce((s, r) => s + r.amount_minor, 0) }));
  const lastMonth = months[10].month;
  const revenueLastMonth = Object.fromEntries(currencies.map((c) => [c, m.revenue_by_month.filter((r) => r.currency === c && r.month === lastMonth).reduce((s, r) => s + r.amount_minor, 0)]));

  const jobs = JOBS.map((j) => { const run = m.jobs.find((x) => x.job === j.job); return { ...j, run, state: jobState(run, j.everyHours, now) }; });
  const jobsBad = jobs.filter((j) => j.state === 'failing' || j.state === 'late').length;
  const deliveryFailures = (m.delivery_failures_24h.email ?? 0) + (m.delivery_failures_24h.whatsapp ?? 0);
  const checklist = configChecklist();

  return (
    <Shell right={<AutoRefresh generatedAt={m.generated_at} />}>
      {/* ───────── Health at a glance ───────── */}
      <section aria-labelledby="glance-h" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <h2 id="glance-h" className="sr-only">Health at a glance</h2>
        <Signal icon="database" label="Database" ok={data.db.ok} value={data.db.ok ? `${data.db.ms} ms` : 'Down'} sub={data.db.ok ? 'Responding' : data.db.error} />
        <Signal icon="schedule" label="Background jobs" ok={jobsBad === 0} warn={jobs.every((j) => j.state === 'never')} value={jobsBad ? `${jobsBad} need attention` : jobs.every((j) => j.state === 'never') ? 'No runs yet' : 'All on time'} sub={`${jobs.length} jobs`} />
        <Signal icon="mail" label="Undelivered (24 h)" ok={deliveryFailures === 0} value={String(deliveryFailures)} sub={`Email ${m.delivery_failures_24h.email ?? 0} · WhatsApp ${m.delivery_failures_24h.whatsapp ?? 0}`} />
        <Signal icon="receipt_long" label="KRA eTIMS" ok={m.etims.queued === 0 && m.etims.rejected_7d === 0}
          value={m.etims.queued ? `${m.etims.queued} waiting for KRA` : m.etims.rejected_7d ? `${m.etims.rejected_7d} rejected this week` : 'All sent'}
          sub={`${m.etims.submitted_24h} accepted today${m.etims.queued && m.etims.rejected_7d ? ` · ${m.etims.rejected_7d} rejected this week` : ''}${m.etims.oldest_queued ? ` · oldest waiting since ${fmt.relative(m.etims.oldest_queued)}` : ''}`} />
        <Signal icon="bug_report" label="Errors (Sentry, 24 h)" ok={data.sentry.status === 'ok' && data.sentry.issues.length === 0} warn={data.sentry.status === 'off'}
          value={data.sentry.status === 'off' ? 'Not connected' : data.sentry.status === 'error' ? 'Unavailable' : `${data.sentry.issues.length} open`} sub={data.sentry.status === 'off' ? 'Add SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT' : data.sentry.error ?? 'Unresolved issues'} />
      </section>

      {/* ───────── People ───────── */}
      <Card aria-labelledby="people-h">
        <CardHeader title={<span id="people-h">People</span>} icon="group" subtitle="Across every workspace. “Online” = had OrbitOS open in the last 5 minutes." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Online now" value={<span className="flex items-center gap-2">{m.online_now}{m.online_now > 0 && <span className="h-2 w-2 rounded-full bg-healthy pulse-dot" aria-hidden />}</span>} />
          <Stat label="Active today" value={m.active_24h} sub={`${m.signins_today} signed in today`} />
          <Stat label="Active this week" value={m.active_7d} />
          <Stat label="Active this month" value={m.active_30d} />
          <Stat label="People" value={m.users} sub={`+${m.new_users_7d} this week · +${m.new_users_30d} this month`} />
          <Stat label="Workspaces" value={m.workspaces} sub={`+${m.new_workspaces_7d} this week · +${m.new_workspaces_30d} this month`} />
        </div>
        <h3 className="mt-5 text-label-xs uppercase text-on-surface-variant">Online now</h3>
        {m.online.length === 0 ? <p className="mt-1 text-body-md text-on-surface-variant">Nobody right now.</p> : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {m.online.map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-full border border-outline-variant px-3 py-1 text-body-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-healthy" aria-hidden />{p.name ?? 'Someone'}<span className="text-on-surface-variant">· {p.workspace ?? '—'} · {fmt.relative(p.last_seen_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ───────── Money ───────── */}
      <Card aria-labelledby="money-h">
        <CardHeader title={<span id="money-h">Money</span>} icon="payments" subtitle="Completed IntaSend plan payments. Recurring revenue = each paying workspace’s latest payment per month (annual ÷ 12)." />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Monthly recurring revenue" value={m.mrr.length ? m.mrr.map((r) => money(r.amount_minor, r.currency)).join(' + ') : '—'} sub={`${m.paying} paying workspaces`} />
          <Stat label="Revenue this month" value={revenueThisMonth.length ? revenueThisMonth.map((r) => money(r.amount, r.currency)).join(' + ') : '—'}
            sub={currencies.length ? `Last month ${currencies.map((c) => money(revenueLastMonth[c] ?? 0, c)).join(' + ')}` : 'No payments yet'} />
          <Stat label="On free trial" value={m.on_trial} sub={`${m.trials_ending.length} ending within 7 days`} />
          <Stat label="Lapsed (read-only)" value={m.lapsed} sub={m.offboarding ? `${m.offboarding} closing down` : 'Plan ended, not renewed'} />
        </div>
        {currencies.length > 0 && (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {currencies.map((c) => (
              <div key={c}>
                <h3 className="text-label-xs uppercase text-on-surface-variant">Revenue per month · {c}</h3>
                <RevenueChart currency={c} months={months.map((mo) => ({ ...mo, amount_minor: m.revenue_by_month.find((r) => r.currency === c && r.month === mo.month)?.amount_minor ?? 0 }))} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <MiniTable title="Plan mix (active)" empty="No active plans" head={['Plan', 'Billing', 'Workspaces']}
            rows={m.plan_mix.map((p) => [planName(p.plan), p.period === 'trial' ? 'Trial' : p.period === 'annual' ? 'Annual' : 'Monthly', String(p.n)])} />
          <MiniTable title="Trials ending in 7 days" empty="None" head={['Workspace', 'Ends']}
            rows={m.trials_ending.map((t) => [t.name, fmt.date(t.plan_expires_at)])} />
          <MiniTable title="Renewals due" empty="None due" head={['Workspace', 'Plan', 'Ends']}
            rows={m.renewals_due.map((r) => [r.name, `${planName(r.plan)} ${r.plan_period}`, fmt.date(r.plan_expires_at)])} />
        </div>
        <div className="mt-5">
          <MiniTable title="Failed payments (7 days)" empty="No failed payments" head={['When', 'Workspace', 'Method', 'Amount']}
            rows={m.failed_payments_7d.map((p) => [fmt.relative(p.created_at), p.workspace, p.method === 'MPESA' ? 'M-Pesa' : 'Card', money(p.amount_minor, p.currency)])} />
        </div>
      </Card>

      {/* ───────── Health ───────── */}
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card aria-labelledby="jobs-h" className="min-w-0">
          <CardHeader title={<span id="jobs-h">Background jobs</span>} icon="schedule" subtitle="Run by GitHub Actions (hourly) and Vercel (daily). “Late” = no successful run when one was due." />
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Background jobs table">
            <table className="w-full min-w-[34rem] text-left text-body-md">
              <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant">
                <th scope="col" className="py-2 pr-3">Job</th><th scope="col" className="py-2 pr-3">Status</th><th scope="col" className="py-2 pr-3">Last run</th><th scope="col" className="py-2">Result</th>
              </tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.job} className="border-b border-outline-variant align-top last:border-0">
                    <td className="py-2 pr-3">{j.label}<span className="block font-mono text-body-sm text-on-surface-variant">{j.job} · every {j.everyHours === 24 ? 'day' : 'hour'}</span></td>
                    <td className="py-2 pr-3"><Pill tone={JOB_PILL[j.state].tone}>{JOB_PILL[j.state].label}</Pill></td>
                    <td className="py-2 pr-3 text-body-sm text-on-surface-variant">{j.run?.last_finished_at ? fmt.relative(j.run.last_finished_at) : '—'}{j.run?.last_duration_ms != null && <span className="block tnum">{(j.run.last_duration_ms / 1000).toFixed(1)} s · {j.run.runs} runs, {j.run.failures} failed</span>}</td>
                    <td className="max-w-[16rem] py-2 text-body-sm"><span className={j.state === 'failing' ? 'text-alert' : 'text-on-surface-variant'}>{j.run?.last_error ? j.run.last_error.slice(0, 140) : readable(j.run?.last_summary)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card aria-labelledby="svc-h" className="min-w-0">
          <CardHeader title={<span id="svc-h">Services and settings</span>} icon="tune" subtitle="What this deployment has switched on (Vercel environment variables)." />
          <ul className="divide-y divide-outline-variant">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 py-2 text-body-md">
                <span className="flex items-center gap-2"><Icon name={c.ok ? 'check_circle' : 'radio_button_unchecked'} className={c.ok ? 'text-healthy' : 'text-on-surface-variant'} label={c.ok ? 'On' : 'Off'} />{c.label}</span>
                <span className="text-right text-body-sm text-on-surface-variant">{c.note}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2 text-body-md">
              <span className="flex items-center gap-2"><Icon name="calendar_month" className="text-on-surface-variant" />Calendars connected</span>
              <span className="text-body-sm text-on-surface-variant tnum">{m.calendar_connections} people · eTIMS: {m.etims.connected_workspaces} workspaces</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card aria-labelledby="del-h" className="min-w-0">
          <CardHeader title={<span id="del-h">Undelivered messages</span>} icon="mark_email_unread" subtitle="Emails and WhatsApp messages the provider refused (kept 90 days)." />
          {m.recent_delivery_failures.length === 0 ? <EmptyState icon="mark_email_read" title="Everything delivered" /> : (
            <ul className="divide-y divide-outline-variant">
              {m.recent_delivery_failures.map((d, i) => (
                <li key={i} className="py-2 text-body-sm">
                  <span className="font-medium">{d.channel === 'email' ? 'Email' : 'WhatsApp'}</span>{d.context ? ` · ${d.context}` : ''} <span className="text-on-surface-variant">· {fmt.relative(d.created_at)}</span>
                  <span className="block text-alert">{d.error}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="err-h" className="min-w-0">
          <CardHeader title={<span id="err-h">Errors</span>} icon="bug_report" subtitle="Unresolved Sentry issues seen in the last 24 hours." />
          {data.sentry.status === 'off' ? <p className="text-body-md text-on-surface-variant">Not connected. Set <code>SENTRY_AUTH_TOKEN</code> (with the <code>project:read</code> scope), <code>SENTRY_ORG</code> and <code>SENTRY_PROJECT</code> in Vercel to list errors here.</p>
            : data.sentry.status === 'error' ? <Banner tone="warning">Couldn’t reach Sentry: {data.sentry.error}</Banner>
            : data.sentry.issues.length === 0 ? <EmptyState icon="verified" title="No open errors in the last 24 hours" /> : (
              <ul className="divide-y divide-outline-variant">
                {data.sentry.issues.map((i) => (
                  <li key={i.permalink} className="flex items-start justify-between gap-3 py-2 text-body-sm">
                    <a href={i.permalink} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary hover:underline">{i.title}</a>
                    <span className="shrink-0 text-on-surface-variant tnum">{i.count}× · {fmt.relative(i.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>

      {/* ───────── Workspaces ───────── */}
      <Card aria-labelledby="ws-h" className="min-w-0">
        <CardHeader title={<span id="ws-h">Workspaces</span>} icon="apartment" subtitle={q ? `${data.workspaces.length} matching “${q}”` : `Newest first · showing ${data.workspaces.length} of ${m.workspaces}`} />
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2" role="search">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-label-sm text-on-surface-variant">Search by name or address
            <input name="q" defaultValue={q} className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface" /></label>
          <button type="submit" className="h-10 rounded bg-primary-container px-4 text-label-md text-white">Search</button>
          {q && <Link href="/founder" className="h-10 rounded border border-outline-variant px-4 py-2 text-label-md">Clear</Link>}
        </form>
        <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Workspaces table">
          <table className="w-full min-w-[46rem] text-left text-body-md">
            <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant">
              <th scope="col" className="py-2 pr-3">Workspace</th><th scope="col" className="py-2 pr-3">Plan</th><th scope="col" className="py-2 pr-3">Paid until</th>
              <th scope="col" className="py-2 pr-3 text-right">People</th><th scope="col" className="py-2 pr-3">Last active</th><th scope="col" className="py-2 pr-3 text-right">Lifetime revenue</th><th scope="col" className="py-2">Created</th>
            </tr></thead>
            <tbody>
              {data.workspaces.map((w) => {
                const expired = Date.parse(w.plan_expires_at) < now;
                return (
                  <tr key={w.id} className="border-b border-outline-variant align-top last:border-0">
                    <td className="py-2 pr-3">{w.name}<span className="block font-mono text-body-sm text-on-surface-variant">{w.slug} · {w.currency}</span></td>
                    <td className="py-2 pr-3">{planName(w.plan)}<span className="block text-body-sm text-on-surface-variant">{w.status !== 'active' ? w.status : w.plan_period}</span></td>
                    <td className="py-2 pr-3 text-body-sm"><span className={expired ? 'text-alert' : ''}>{fmt.date(w.plan_expires_at)}</span>{expired && <span className="block text-alert">Lapsed</span>}</td>
                    <td className="py-2 pr-3 text-right tnum">{w.members}<span className="block text-body-sm text-on-surface-variant">of {w.seat_limit}</span></td>
                    <td className="py-2 pr-3 text-body-sm text-on-surface-variant">{w.last_active ? fmt.relative(w.last_active) : 'Not yet seen'}</td>
                    <td className="py-2 pr-3 text-right text-body-sm tnum">{Object.keys(w.revenue).length ? Object.entries(w.revenue).map(([c, v]) => money(v, c)).join(' + ') : '—'}</td>
                    <td className="py-2 text-body-sm text-on-surface-variant">{fmt.date(w.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.workspaces.length === 0 && <EmptyState icon="search_off" title="No workspaces match" />}
        </div>
      </Card>

      <p className="text-body-sm text-on-surface-variant">Read-only. Visits to this page are recorded in the platform access log. Access: <code>FOUNDER_EMAILS</code> plus two-factor sign-in.</p>
    </Shell>
  );
}

/** A job's JSON result as words: {"reminders":0,"seatAlerts":2} → "reminders 0 · seat alerts 2". */
function readable(summary: string | null | undefined): string {
  if (!summary) return '—';
  try {
    const o = JSON.parse(summary) as Record<string, unknown>;
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const parts = Object.entries(o).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v) || Array.isArray(v))
        .map(([k, v]) => `${k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()} ${Array.isArray(v) ? v.length : String(v)}`);
      return parts.join(' · ').slice(0, 140) || '—';
    }
  } catch { /* plain text */ }
  return summary.slice(0, 140);
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-canvas flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />App</Link>
            <h1 className="text-headline-sm">Founder console</h1>
            <Pill tone="info">All workspaces</Pill>
          </div>
          {right}
        </div>
      </header>
      <main id="main" className="mx-auto flex max-w-canvas flex-col gap-5 px-4 py-5 lg:px-8">{children}</main>
    </div>
  );
}

function Signal({ icon, label, ok, warn, value, sub }: { icon: string; label: string; ok: boolean; warn?: boolean; value: string; sub?: string }) {
  const tone = ok ? 'text-healthy' : warn ? 'text-on-surface-variant' : 'text-alert';
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-label-xs uppercase text-on-surface-variant"><Icon name={icon} className="text-[16px]" />{label}</p>
      <p className={`mt-1 flex items-center gap-2 text-headline-sm ${tone}`}><Icon name={ok ? 'check_circle' : warn ? 'radio_button_unchecked' : 'error'} className="text-[20px]" label={ok ? 'OK' : warn ? 'Not set up' : 'Needs attention'} />{value}</p>
      {sub && <p className="mt-0.5 text-body-sm text-on-surface-variant">{sub}</p>}
    </div>
  );
}

function MiniTable({ title, head, rows, empty }: { title: string; head: string[]; rows: string[][]; empty: string }) {
  return (
    <div>
      <h3 className="text-label-xs uppercase text-on-surface-variant">{title}</h3>
      {rows.length === 0 ? <p className="mt-1 text-body-md text-on-surface-variant">{empty}</p> : (
        <table className="mt-1 w-full text-left text-body-md">
          <thead><tr className="border-b border-outline-variant text-label-xs text-on-surface-variant">{head.map((h, i) => <th key={h} scope="col" className={`py-1.5 pr-2 font-medium ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-outline-variant last:border-0">{r.map((c, j) => <td key={j} className={`py-1.5 pr-2 ${j === r.length - 1 ? 'text-right tnum' : ''}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
