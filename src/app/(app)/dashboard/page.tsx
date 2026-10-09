import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAppContext } from '@/lib/context';
import { loadDashboard } from '@/lib/data/dashboard';
import { HEALTH_FORMULA } from '@/lib/metrics/health';
import { formatRunway } from '@/lib/metrics/finance';
import { firstName, signed } from '@/lib/format';
import { greeting, quarterDay, fmtUtcTime } from '@/lib/time-of-day';
import { can } from '@/lib/roles';
import { planAllows } from '@/lib/billing/plans';
import { Card, CardHeader, Icon, Pill, KpiTile, LinkButton, EmptyState, Banner, ProgressBar } from '@/components/ui';
import { LiveSync } from '@/components/dashboard/LiveSync';
import { getFormat } from '@/lib/locale/server';
import { getT } from '@/i18n/server';
import { ChiefOfStaff, type BriefView } from '@/components/dashboard/ChiefOfStaff';

export const metadata: Metadata = { title: 'Dashboard' };

const statusTone = { optimal: 'healthy', watch: 'warning', at_risk: 'alert' } as const;
const statusText = { optimal: 'Optimal', watch: 'Watch', at_risk: 'At risk' } as const;

export default async function DashboardPage(props: { searchParams: Promise<{ welcome?: string }> }) {
  const fmt = await getFormat();
  const searchParams = await props.searchParams;
  const ctx = await requireAppContext();
  const d = await loadDashboard(ctx.supabase, ctx.org, ctx.role, ctx.user.id);
  const t = await getT();
  // RLS limits briefs to owners/directors; the latest of either kind for this person.
  const brief = ctx.org.ai_enabled && (ctx.role === 'owner' || ctx.role === 'director')
    ? ((await ctx.supabase.from('ai_briefs').select('id, kind, content, source, created_at').eq('org_id', ctx.org.id).eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(1)).data?.[0] as BriefView | undefined) ?? null
    : null;
  const now = new Date();
  const qd = quarterDay(now);
  const cur = ctx.org.currency;
  const delta = d.prevScore !== null ? d.health.score - d.prevScore : null;
  const remainingMs = d.overlap.best ? d.overlap.best.end - now.getTime() : 0;
  const inWindow = d.overlap.best && now.getTime() >= d.overlap.best.start && now.getTime() < d.overlap.best.end;
  const moodDelta = d.mood7 !== null && d.mood30 !== null ? d.mood7 - d.mood30 : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
          <LiveSync orgId={ctx.org.id} />
          <span className="tnum">Q{qd.quarter} · Day {qd.day}</span>
        </div>
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{greeting(ctx.profile.timezone, now)}, {firstName(ctx.profile.full_name)}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-body-md text-on-surface-variant">
            <Icon name="public" className="text-[18px]" />
            {ctx.org.name} · {d.members.length} {d.members.length === 1 ? 'member' : 'members'} across {d.timezones} time {d.timezones === 1 ? 'zone' : 'zones'}
          </p>
        </div>
      </div>

      {(searchParams.welcome || d.members.length === 1) && can.manage(ctx.role) && (
        <Banner tone="info" icon="waving_hand">
          <strong>Welcome to OrbitOS.</strong> Invite your team so scheduling, culture and health metrics have data to work with.{' '}
          <Link href="/settings?section=members" className="text-primary underline">Invite teammates</Link>
        </Banner>
      )}

      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        {/* Health index */}
        <Card glow className="xl:col-span-7" aria-labelledby="health-h">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-label-xs uppercase text-on-surface-variant">Executive overview</p>
              <h2 id="health-h" className="mt-1 text-headline-sm">Company Health Index</h2>
            </div>
            <Pill tone={statusTone[d.health.status]} pulse>{statusText[d.health.status]}</Pill>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className="text-headline-xl tnum leading-none">{d.health.score}<span className="text-headline-md text-on-surface-variant">/100</span></p>
            {delta !== null && (
              <p className={`flex items-center gap-1 pb-1 text-label-md tnum ${delta >= 0 ? 'text-healthy' : 'text-alert'}`}>
                <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} />{signed(delta, 0)} pts vs 2 weeks ago
              </p>
            )}
          </div>
          <details className="mt-3 text-body-sm text-on-surface-variant">
            <summary className="cursor-pointer text-primary">How is this calculated?</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {HEALTH_FORMULA.map((f) => <li key={f.key}><strong className="text-on-surface">{f.label} ({f.weight}%)</strong> — {f.detail}</li>)}
              <li>Pillars with no data yet are left out rather than counted as zero.</li>
            </ul>
          </details>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Velocity" icon="speed" href="/operations"
              value={d.sprintInfo ? `${d.sprintInfo.pct}%` : '—'}
              sub={d.sprintInfo ? `${d.sprintInfo.done}/${d.sprintInfo.committed} pts · day ${d.sprintInfo.day}/${d.sprintInfo.totalDays}` : 'No active sprint'} />
            <KpiTile label="Runway" icon="account_balance" href={can.seeFinance(ctx.role) ? '/operations?tab=finance' : undefined}
              value={formatRunway(d.finance.runwayMonths)}
              sub={d.finance.cashBalance !== null ? `Burn ${fmt.money(d.finance.monthlyBurn, cur, { compact: true })}/mo` : 'Add a cash balance'} />
            <KpiTile label="Culture pulse" icon="favorite" href="/culture"
              value={d.health.components.culture !== null ? `${d.health.components.culture}%` : '—'}
              sub={d.rate14 !== null ? `${Math.round(d.rate14 * 100)}% check-in rate` : 'No check-ins yet'} />
            <KpiTile label="Compliance" icon="verified_user" href="/compliance"
              value={d.ready.total ? `${d.ready.pct}%` : '—'}
              sub={d.ready.total ? `${d.ready.passing}/${d.ready.total} controls passing` : 'No frameworks enabled'} />
          </div>
        </Card>

        {/* Urgent actions */}
        <Card className="xl:col-span-5" aria-labelledby="urgent-h">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id="urgent-h" className="flex items-center gap-2 text-headline-sm"><Icon name="notification_important" className="text-warning" />Urgent actions</h2>
            <Pill tone={d.urgent.length ? 'warning' : 'healthy'}>{d.urgent.length ? `${d.urgent.length} pending` : 'All clear'}</Pill>
          </div>
          {d.urgent.length === 0 ? (
            <EmptyState icon="task_alt" title="Nothing needs your attention" body="Blocked work, overdue items, failing controls and cost spikes will show up here." />
          ) : (
            <ul className="flex flex-col divide-y divide-outline-variant">
              {d.urgent.slice(0, 6).map((u) => (
                <li key={u.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${u.tone === 'alert' ? 'bg-alert' : u.tone === 'warning' ? 'bg-warning' : 'bg-secondary'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-label-xs uppercase text-on-surface-variant">{u.area} · {u.when}</p>
                    <h3 className="truncate text-label-md text-on-surface">{u.title}</h3>
                    <p className="line-clamp-2 text-body-sm text-on-surface-variant">{u.body}</p>
                  </div>
                  <LinkButton href={u.href} variant="secondary" size="sm" aria-label={`${u.cta}: ${u.title}`}>{u.cta}</LinkButton>
                </li>
              ))}
            </ul>
          )}
          {d.urgent.length > 6 && <p className="mt-3 text-body-sm text-on-surface-variant">+{d.urgent.length - 6} more</p>}
        </Card>
      </div>

      {(ctx.role === 'owner' || ctx.role === 'director') && (
        <Card id="chief-of-staff" aria-labelledby="cos-h">
          <CardHeader title={<span id="cos-h">{t('ai.title')}</span>} icon="auto_awesome" />
          <ChiefOfStaff enabled={ctx.org.ai_enabled} isOwner={ctx.role === 'owner'} brief={brief} />
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" aria-labelledby="pulse-h">
          <CardHeader title={<span id="pulse-h">Distributed pulse</span>} icon="monitor_heart" subtitle="Real-time core" />
          <ul className="grid gap-4 md:grid-cols-3">
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="alt_route" className="text-[18px]" />Engineering delivery</p>
              {d.sprintInfo ? (
                <>
                  <p className="mt-2 text-headline-md tnum">{d.sprintInfo.pct}%</p>
                  <ProgressBar value={d.sprintInfo.done} max={d.sprintInfo.committed} label="Sprint completion" tone={d.sprintInfo.status === 'on_track' ? 'healthy' : d.sprintInfo.status === 'at_risk' ? 'warning' : 'alert'} />
                  <p className="mt-2 text-body-sm text-on-surface-variant">{d.sprintInfo.status === 'on_track' ? 'On track' : d.sprintInfo.status === 'at_risk' ? 'At risk' : 'Behind plan'} · {d.blockedCount} blocked</p>
                </>
              ) : <p className="mt-2 text-body-sm text-on-surface-variant">No active sprint. <Link href="/operations" className="text-primary underline">Plan one</Link></p>}
            </li>
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="hourglass_top" className="text-[18px]" />Global sync window</p>
              {d.overlap.best ? (
                <>
                  <p className="mt-2 text-headline-md tnum">{fmtUtcTime(d.overlap.best.start)}–{fmtUtcTime(d.overlap.best.end)} <span className="text-body-sm text-on-surface-variant">UTC</span></p>
                  <p className="mt-1 text-body-sm text-on-surface-variant tnum">
                    {d.overlap.coveragePct}% of team overlap · {inWindow ? `${Math.max(0, Math.round(remainingMs / 60_000))} min left` : `${d.overlap.hours.toFixed(1)} h today`}
                  </p>
                </>
              ) : <p className="mt-2 text-body-sm text-on-surface-variant">No shared working hours today.</p>}
            </li>
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="sentiment_satisfied" className="text-[18px]" />Weekly morale</p>
              <p className="mt-2 text-headline-md tnum">{d.mood7 !== null ? d.mood7.toFixed(1) : '—'} <span className="text-body-sm text-on-surface-variant">/ 5.0</span></p>
              {moodDelta !== null && (
                <p className={`mt-1 flex items-center gap-1 text-body-sm tnum ${moodDelta >= 0 ? 'text-healthy' : 'text-alert'}`}>
                  <Icon name={moodDelta >= 0 ? 'arrow_upward' : 'arrow_downward'} className="text-[16px]" />{signed(moodDelta, 1)} vs 30-day average
                </p>
              )}
            </li>
          </ul>
        </Card>

        <Card className="xl:col-span-4" aria-labelledby="sc-h">
          <CardHeader title={<span id="sc-h">Executive console</span>} icon="bolt" />
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href="/scheduling?new=1" variant="secondary" icon="group_add">Instant 1:1</LinkButton>
            {can.manage(ctx.role)
              ? <LinkButton href="/operations?tab=finance&new=expense" variant="secondary" icon="receipt_long">Log spend</LinkButton>
              : <LinkButton href="/culture?tab=roll-call" variant="secondary" icon="edit_note">Check in</LinkButton>}
            <LinkButton href="/culture?tab=kudos&give=1" variant="secondary" icon="workspace_premium">Shoutout</LinkButton>
            {planAllows(ctx.org.plan, 'auditPackage') && (can.manage(ctx.role) || ctx.role === 'auditor')
              ? <a href="/api/compliance/audit-package" className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-surface-container-high px-4 text-label-md text-on-surface hover:bg-surface-container-highest md:h-10"><Icon name="ios_share" className="text-[18px]" />Audit pack</a>
              : <LinkButton href="/compliance" variant="secondary" icon="verified_user">Compliance</LinkButton>}
          </div>
          {can.seeFinance(ctx.role) && d.unpaid.count > 0 && (
            <p className="mt-4 text-body-sm text-on-surface-variant">
              <Icon name="receipt_long" className="mr-1 align-middle text-[16px]" />
              {d.unpaid.count} unpaid invoices · {fmt.money(d.unpaid.total, cur, { compact: true })}{d.unpaid.dueToday ? ` · ${d.unpaid.dueToday} due today` : ''}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
