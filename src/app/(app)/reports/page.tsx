import type { Metadata } from 'next';
import { requireAppContext } from '@/lib/context';
import { loadReport } from '@/lib/reports/load';
import { isPeriodKey, type PeriodKey } from '@/lib/reports/period';
import { signed } from '@/lib/format';
import { can } from '@/lib/roles';
import { planAllows } from '@/lib/billing/plans';
import { must } from '@/lib/data/members';
import { Card, CardHeader, Icon, Pill, Stat, EmptyState, Banner } from '@/components/ui';
import { PeriodPicker, ExportMenu, ModuleTabs, AdoptInsight } from '@/components/reports/ReportControls';
import { DigestSchedules } from '@/components/reports/DigestSchedules';
import type { ReportSchedule } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';
import { getT } from '@/i18n/server';
import type { T } from '@/i18n/shared';
import type { Period } from '@/lib/reports/period';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.rep.title') };
}

function runway(t: T, months: number | null) {
  if (months === null) return '—';
  if (!Number.isFinite(months)) return t('p.dash.runway_positive');
  return months >= 24 ? t('p.dash.runway_24') : t('p.dash.runway_mo', { n: months.toFixed(1) });
}
function periodLabel(t: T, p: Period) {
  if (p.key === 'quarter' || p.key === 'last_quarter') return t('rep.q', { q: Math.floor(p.start.getUTCMonth() / 3) + 1, y: p.start.getUTCFullYear() });
  return p.key === 'ytd' ? t('rep.ytd', { y: p.start.getUTCFullYear() }) : t('rep.period.last_30');
}

const pc = (v: number | null, d = 0) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);

export default async function ReportsPage(props: { searchParams: Promise<{ period?: string }> }) {
  const searchParams = await props.searchParams;
  const [fmt, t, { supabase, org, role, profile, user }] = await Promise.all([getFormat(), getT(), requireAppContext()]);
  if (!can.seeFinance(role)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.rep.h1')}</h1>
        <Banner tone="info">{t('p.rep.denied')}</Banner>
      </div>
    );
  }
  const period: PeriodKey = isPeriodKey(searchParams.period) ? searchParams.period : 'quarter';
  const [r, schedRes, slackRes] = await Promise.all([
    loadReport(supabase, org, period),
    supabase.from('report_schedules').select('*').eq('org_id', org.id).order('created_at'),
    can.manage(role) ? supabase.from('integrations').select('enabled').eq('org_id', org.id).eq('kind', 'slack_webhook').maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const cur = org.currency;
  const slackConnected = Boolean(slackRes.data?.enabled);

  const eng = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Stat label={t('p.rep.sprints')} value={r.eng.sprintsClosed} sub={r.eng.sprintsClosed ? t('p.rep.on_target', { pct: Math.round((r.eng.onTarget / r.eng.sprintsClosed) * 100) }) : t('p.rep.none_period')} />
      <Stat label={t('p.rep.points')} value={r.eng.donePoints} sub={r.eng.pointsChangePct !== null ? t('p.rep.vs_prev', { v: signed(r.eng.pointsChangePct, 1, '%') }) : undefined} />
      <Stat label={t('p.rep.cycle')} value={r.eng.avgCycleDays !== null ? t('p.rep.days_short', { n: r.eng.avgCycleDays.toFixed(1) }) : '—'} sub={t('p.rep.created_done')} />
      <Stat label={t('p.rep.velocity')} value={r.eng.velocityIndex !== null ? r.eng.velocityIndex : '—'} sub={t('p.rep.velocity_sub')} />
    </div>
  );
  const fin = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Stat label={t('p.rep.burn')} value={fmt.money(r.finance.periodBurn, cur, { compact: true })} sub={r.finance.burnChangePct !== null ? t('p.rep.vs_prev', { v: signed(r.finance.burnChangePct, 1, '%') }) : undefined} />
      <Stat label={t('p.rep.revenue')} value={fmt.money(r.finance.periodRevenue, cur, { compact: true })} />
      <Stat label={t('p.rep.runway')} value={runway(t, r.finance.runwayMonths)} sub={r.finance.cashBalance !== null ? t('p.rep.cash', { amount: fmt.money(r.finance.cashBalance, cur, { compact: true }) }) : undefined} />
      <Stat label={t('p.rep.territories')} value={r.finance.payrollTerritories ?? '—'} sub={t('p.rep.latest_run')} />
    </div>
  );
  const ppl = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Stat label={t('p.rep.enps')} value={r.people.enps !== null ? signed(r.people.enps, 0) : '—'} sub={r.people.enps === null ? t('p.rep.enps_none') : t('p.rep.enps_sub')} />
      <Stat label={t('p.rep.burnout')} value={pc(r.people.burnoutRisk, 1)} sub={t('p.rep.burnout_sub')} />
      <Stat label={t('p.rep.tz')} value={pc(r.people.tzHarmony)} sub={t('p.rep.tz_sub')} />
      <Stat label={t('p.rep.checkins')} value={pc(r.people.checkinRate)} sub={r.people.mood !== null ? t('p.rep.mood', { n: r.people.mood.toFixed(1) }) : undefined} />
    </div>
  );
  const sec = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Stat label={t('p.rep.controls')} value={r.infosec.controls.total ? `${r.infosec.controls.pct}%` : '—'} sub={`${r.infosec.controls.passing}/${r.infosec.controls.total}`} />
      <Stat label={t('p.rep.devices')} value={`${r.infosec.devices.compliant}/${r.infosec.devices.total}`} />
      <Stat label={t('p.rep.training')} value={r.infosec.training ? `${r.infosec.training.done}/${r.infosec.training.total}` : '—'} sub={r.infosec.training ? t('p.rep.completed') : t('p.rep.no_campaign')} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label-xs uppercase text-on-surface-variant">{t('p.rep.kicker')}</p>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.rep.h1')}</h1>
        </div>
        <div className="flex items-end gap-2">
          <PeriodPicker value={period} />
          <ExportMenu period={period} slackConnected={slackConnected} canDispatch={can.manage(role)} />
        </div>
      </div>

      <Card glow>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="bolt" className="text-secondary" />{t('p.rep.velocity_h', { period: periodLabel(t, r.period) })}</h2>
          {r.eng.pointsChangePct !== null && <Pill tone={r.eng.pointsChangePct >= 0 ? 'healthy' : 'warning'}>{t('p.rep.points_pill', { v: signed(r.eng.pointsChangePct, 1, '%') })}</Pill>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <p className="text-label-xs uppercase text-on-surface-variant">{t('p.rep.velocity')}</p>
            <p className="mt-1 text-headline-xl leading-none tnum">{r.eng.velocityIndex ?? '—'}<span className="text-headline-md text-on-surface-variant">{r.eng.velocityIndex !== null ? ' / 100' : ''}</span></p>
            <p className="mt-1 text-body-sm text-on-surface-variant">{t('p.rep.velocity_desc')}</p>
          </div>
          <Stat label={t('p.rep.sync')} value={`${r.sync.meetingHours.toFixed(0)} h`} sub={t('p.rep.sync_sub', { diff: r.sync.hoursSaved >= 0 ? t('p.rep.fewer', { n: r.sync.hoursSaved.toFixed(0) }) : t('p.rep.more', { n: (-r.sync.hoursSaved).toFixed(0) }), amount: fmt.money(Math.abs(r.sync.costDiffMinor), cur, { compact: true }), verb: r.sync.costDiffMinor >= 0 ? t('p.rep.saved') : t('p.rep.added') })} />
          <Stat label={t('p.rep.async')} value={pc(r.sync.asyncRate)} sub={t('p.rep.of_meetings', { n: r.sync.meetings })} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t('rep.modules')} icon="dashboard" />
        <ModuleTabs modules={[{ id: 'eng', label: t('p.rep.m.eng'), content: eng }, { id: 'fin', label: t('p.rep.m.fin'), content: fin }, { id: 'ppl', label: t('p.rep.m.ppl'), content: ppl }, { id: 'sec', label: t('p.rep.m.sec'), content: sec }]} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader title={t('p.rep.insights')} icon="auto_awesome" subtitle={t('p.rep.insights_sub')} />
          {r.insights.length === 0 ? <EmptyState icon="event_available" title={t('p.rep.no_insights')} body={t('p.rep.no_insights_body')} /> : (
            <ul className="divide-y divide-outline-variant">
              {r.insights.map((i) => {
                const label = t(i.shiftMin < 0 ? 'p.rep.move_earlier' : 'p.rep.move_later', { title: i.title, n: Math.abs(i.shiftMin), when: fmt.slot(i.newStart, profile.timezone, false) });
                return (
                  <li key={i.meetingId} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div>
                      <h3 className="text-label-md">{label}</h3>
                      <p className="text-body-sm text-on-surface-variant">{t('p.rep.puts', { after: i.insideAfter, total: i.total, before: i.insideBefore })}</p>
                    </div>
                    <AdoptInsight meetingId={i.meetingId} newStart={new Date(i.newStart).toISOString()} label={label} canAdopt={can.write(role)} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t('p.rep.digests')} icon="schedule_send" />
          <DigestSchedules orgId={org.id} items={must(schedRes, 'schedules') as ReportSchedule[]} canManage={can.manage(role)} defaultEmail={user.email ?? ''} allowed={planAllows(org.plan, 'scheduledDigests')} />
        </Card>
      </div>
    </div>
  );
}
