import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadDashboard } from '@/lib/data/dashboard';
import { HEALTH_FORMULA } from '@/lib/metrics/health';
import { firstName, signed } from '@/lib/format';
import type { MessageKey } from '@/i18n/shared';
import { greetingKey, quarterDay, fmtUtcTime } from '@/lib/time-of-day';
import { can } from '@/lib/roles';
import { planAllows } from '@/lib/billing/plans';
import { Card, CardHeader, Icon, Pill, KpiTile, LinkButton, EmptyState, Banner, ProgressBar } from '@/components/ui';
import { LiveSync } from '@/components/dashboard/LiveSync';
import { getFormat } from '@/lib/locale/server';
import { getT } from '@/i18n/server';
import { ChiefOfStaff, type BriefView } from '@/components/dashboard/ChiefOfStaff';
import { GettingStarted, GS_COOKIE } from '@/components/dashboard/GettingStarted';
import { cookies } from 'next/headers';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.dash.title') };
}

const statusTone = { optimal: 'healthy', watch: 'warning', at_risk: 'alert' } as const;

export default async function DashboardPage(props: { searchParams: Promise<{ welcome?: string }> }) {
  const [fmt, t] = await Promise.all([getFormat(), getT()]);
  const searchParams = await props.searchParams;
  const ctx = await requireAppContext();
  const d = await loadDashboard(ctx.supabase, ctx.org, ctx.role, ctx.user.id, { t, fmt });
  // RLS limits briefs to owners/directors; the latest of either kind for this person.
  const brief = ctx.org.ai_enabled && (ctx.role === 'owner' || ctx.role === 'director')
    ? ((await ctx.supabase.from('ai_briefs').select('id, kind, content, source, created_at').eq('org_id', ctx.org.id).eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(1)).data?.[0] as BriefView | undefined) ?? null
    : null;
  const gsHidden = decodeURIComponent((await cookies()).get(GS_COOKIE)?.value ?? '').split(',').includes(ctx.org.id);
  const now = new Date();
  const qd = quarterDay(now);
  const cur = ctx.org.currency;
  const delta = d.prevScore !== null ? d.health.score - d.prevScore : null;
  const remainingMs = d.overlap.best ? d.overlap.best.end - now.getTime() : 0;
  const inWindow = d.overlap.best && now.getTime() >= d.overlap.best.start && now.getTime() < d.overlap.best.end;
  const moodDelta = d.mood7 !== null && d.mood30 !== null ? d.mood7 - d.mood30 : null;
  const runway = (m: number | null) => (m === null ? '—' : !Number.isFinite(m) ? t('p.dash.runway_positive') : m >= 24 ? t('p.dash.runway_24') : t('p.dash.runway_mo', { n: m.toFixed(1) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
          <LiveSync orgId={ctx.org.id} />
          <span className="tnum">{t('p.dash.qday', { q: qd.quarter, day: qd.day })}</span>
        </div>
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{t(greetingKey(ctx.profile.timezone, now))}, {firstName(ctx.profile.full_name)}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-body-md text-on-surface-variant">
            <Icon name="public" className="text-[18px]" />
            {t('p.dash.members_zones', { org: ctx.org.name, members: t('p.dash.n_members', { count: d.members.length }), zones: t('p.dash.n_zones', { count: d.timezones }) })}
          </p>
        </div>
      </div>

      {can.manage(ctx.role) && !gsHidden && (
        <GettingStarted supabase={ctx.supabase} orgId={ctx.org.id} members={d.members.length} isOwner={ctx.role === 'owner'}
          onTrial={ctx.org.plan_period === 'trial'} hasTwoFactor={ctx.aal.next === 'aal2' || ctx.aal.current === 'aal2'} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
        {/* Health index */}
        <Card glow className="xl:col-span-7" aria-labelledby="health-h">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-label-xs uppercase text-on-surface-variant">{t('p.dash.overview')}</p>
              <h2 id="health-h" className="mt-1 text-headline-sm">{t('p.dash.health')}</h2>
            </div>
            <Pill tone={statusTone[d.health.status]} pulse>{t(`p.dash.status.${d.health.status}` as MessageKey)}</Pill>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className="text-headline-xl tnum leading-none">{d.health.score}<span className="text-headline-md text-on-surface-variant">/100</span></p>
            {delta !== null && (
              <p className={`flex items-center gap-1 pb-1 text-label-md tnum ${delta >= 0 ? 'text-healthy' : 'text-alert'}`}>
                <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} />{t('p.dash.vs_2w', { delta: signed(delta, 0) })}
              </p>
            )}
          </div>
          <details className="mt-3 text-body-sm text-on-surface-variant">
            <summary className="cursor-pointer text-primary">{t('p.dash.how')}</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {HEALTH_FORMULA.map((f) => <li key={f.key}><strong className="text-on-surface">{t(`p.dash.f.${f.key}` as MessageKey)} ({f.weight}%)</strong> — {t(`p.dash.f.${f.key}_d` as MessageKey)}</li>)}
              <li>{t('p.dash.f.missing')}</li>
            </ul>
          </details>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label={t('p.dash.kpi.velocity')} icon="speed" href="/operations"
              value={d.sprintInfo ? `${d.sprintInfo.pct}%` : '—'}
              sub={d.sprintInfo ? t('p.dash.kpi.velocity_sub', { done: d.sprintInfo.done, committed: d.sprintInfo.committed, day: d.sprintInfo.day, total: d.sprintInfo.totalDays }) : t('p.dash.kpi.no_sprint')} />
            <KpiTile label={t('p.dash.kpi.runway')} icon="account_balance" href={can.seeFinance(ctx.role) ? '/operations?tab=finance' : undefined}
              value={runway(d.finance.runwayMonths)}
              sub={d.finance.cashBalance !== null ? t('p.dash.kpi.burn', { amount: fmt.money(d.finance.monthlyBurn, cur, { compact: true }) }) : t('p.dash.kpi.add_cash')} />
            <KpiTile label={t('p.dash.kpi.culture')} icon="favorite" href="/culture"
              value={d.health.components.culture !== null ? `${d.health.components.culture}%` : '—'}
              sub={d.rate14 !== null ? t('p.dash.kpi.checkin_rate', { pct: Math.round(d.rate14 * 100) }) : t('p.dash.kpi.no_checkins')} />
            <KpiTile label={t('p.dash.kpi.compliance')} icon="verified_user" href="/compliance"
              value={d.ready.total ? `${d.ready.pct}%` : '—'}
              sub={d.ready.total ? t('p.dash.kpi.controls', { passing: d.ready.passing, total: d.ready.total }) : t('p.dash.kpi.no_frameworks')} />
          </div>
        </Card>

        {/* Urgent actions */}
        <Card className="xl:col-span-5" aria-labelledby="urgent-h">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id="urgent-h" className="flex items-center gap-2 text-headline-sm"><Icon name="notification_important" className="text-warning" />{t('p.dash.urgent')}</h2>
            <Pill tone={d.urgent.length ? 'warning' : 'healthy'}>{d.urgent.length ? t('p.dash.pending', { count: d.urgent.length }) : t('p.dash.all_clear')}</Pill>
          </div>
          {d.urgent.length === 0 ? (
            <EmptyState icon="task_alt" title={t('p.dash.nothing')} body={t('p.dash.nothing_body')} />
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
          {d.urgent.length > 6 && <p className="mt-3 text-body-sm text-on-surface-variant">{t('p.dash.more', { count: d.urgent.length - 6 })}</p>}
        </Card>
      </div>

      {(ctx.role === 'owner' || ctx.role === 'director') && (
        <Card id="chief-of-staff" aria-labelledby="cos-h">
          <CardHeader title={<span id="cos-h">{t('ai.title')}</span>} icon="auto_awesome" />
          <ChiefOfStaff enabled={ctx.org.ai_enabled} isOwner={ctx.role === 'owner'} brief={brief} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8" aria-labelledby="pulse-h">
          <CardHeader title={<span id="pulse-h">{t('p.dash.pulse')}</span>} icon="monitor_heart" subtitle={t('p.dash.pulse_sub')} />
          <ul className="grid gap-4 md:grid-cols-3">
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="alt_route" className="text-[18px]" />{t('p.dash.delivery')}</p>
              {d.sprintInfo ? (
                <>
                  <p className="mt-2 text-headline-md tnum">{d.sprintInfo.pct}%</p>
                  <ProgressBar value={d.sprintInfo.done} max={d.sprintInfo.committed} label={t('p.dash.sprint_completion')} tone={d.sprintInfo.status === 'on_track' ? 'healthy' : d.sprintInfo.status === 'at_risk' ? 'warning' : 'alert'} />
                  <p className="mt-2 text-body-sm text-on-surface-variant">{t(d.sprintInfo.status === 'on_track' ? 'p.dash.on_track' : d.sprintInfo.status === 'at_risk' ? 'p.dash.at_risk' : 'p.dash.behind')} · {t('p.dash.n_blocked', { n: d.blockedCount })}</p>
                </>
              ) : <p className="mt-2 text-body-sm text-on-surface-variant">{t('p.dash.no_sprint')} <Link href="/operations" className="text-primary underline">{t('p.dash.plan_one')}</Link></p>}
            </li>
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="hourglass_top" className="text-[18px]" />{t('p.dash.overlap')}</p>
              {d.overlap.best ? (
                <>
                  <p className="mt-2 text-headline-md tnum">{fmtUtcTime(d.overlap.best.start)}–{fmtUtcTime(d.overlap.best.end)} <span className="text-body-sm text-on-surface-variant">UTC</span></p>
                  <p className="mt-1 text-body-sm text-on-surface-variant tnum">
                    {t('p.dash.overlap_people', { n: d.overlap.best.count, total: d.members.length })} · {inWindow ? t('p.dash.min_left', { n: Math.max(0, Math.round(remainingMs / 60_000)) }) : d.overlap.hours >= 1 ? t('p.dash.h_today', { n: Number(d.overlap.hours.toFixed(1)) }) : t('p.dash.min_today', { n: Math.round(d.overlap.hours * 60) })}
                  </p>
                </>
              ) : <p className="mt-2 text-body-sm text-on-surface-variant">{t('p.dash.no_overlap')}</p>}
            </li>
            <li className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <p className="flex items-center gap-2 text-label-sm text-on-surface-variant"><Icon name="sentiment_satisfied" className="text-[18px]" />{t('p.dash.morale')}</p>
              <p className="mt-2 text-headline-md tnum">{d.mood7 !== null ? d.mood7.toFixed(1) : '—'} <span className="text-body-sm text-on-surface-variant">/ 5.0</span></p>
              {moodDelta !== null && (Math.abs(moodDelta) < 0.05
                ? <p className="mt-1 text-body-sm text-on-surface-variant">{t('p.dash.same_avg')}</p>
                : <p className={`mt-1 flex items-center gap-1 text-body-sm tnum ${moodDelta > 0 ? 'text-healthy' : 'text-alert'}`}>
                    <Icon name={moodDelta > 0 ? 'arrow_upward' : 'arrow_downward'} className="text-[16px]" />{t('p.dash.vs_avg', { delta: signed(moodDelta, 1) })}
                  </p>)}
            </li>
          </ul>
        </Card>

        <Card className="xl:col-span-4" aria-labelledby="sc-h">
          <CardHeader title={<span id="sc-h">{t('p.dash.console')}</span>} icon="bolt" />
          <div className="grid grid-cols-2 gap-2">
            <LinkButton href="/scheduling?new=1" variant="secondary" icon="group_add">{t('p.dash.one_on_one')}</LinkButton>
            {can.manage(ctx.role)
              ? <LinkButton href="/operations?tab=finance&new=expense" variant="secondary" icon="receipt_long">{t('p.dash.log_spend')}</LinkButton>
              : <LinkButton href="/culture?tab=roll-call" variant="secondary" icon="edit_note">{t('p.dash.check_in')}</LinkButton>}
            <LinkButton href="/culture?tab=kudos&give=1" variant="secondary" icon="workspace_premium">{t('p.dash.shoutout')}</LinkButton>
            {planAllows(ctx.org.plan, 'auditPackage') && (can.manage(ctx.role) || ctx.role === 'auditor')
              ? <a href="/api/compliance/audit-package" className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-surface-container-high px-4 text-label-md text-on-surface hover:bg-surface-container-highest md:h-10"><Icon name="ios_share" className="text-[18px]" />{t('p.dash.audit_pack')}</a>
              : <LinkButton href="/compliance" variant="secondary" icon="verified_user">{t('p.dash.compliance')}</LinkButton>}
          </div>
          {can.seeFinance(ctx.role) && d.unpaid.count > 0 && (
            <p className="mt-4 text-body-sm text-on-surface-variant">
              <Icon name="receipt_long" className="mr-1 align-middle text-[16px]" />
              {t('p.dash.unpaid', { count: d.unpaid.count, total: fmt.money(d.unpaid.total, cur, { compact: true }) })}{d.unpaid.dueToday ? ` · ${t('p.dash.due_today_n', { n: d.unpaid.dueToday })}` : ''}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
