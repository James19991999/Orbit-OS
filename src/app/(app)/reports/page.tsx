import type { Metadata } from 'next';
import { formatInTimeZone } from 'date-fns-tz';
import { requireAppContext } from '@/lib/context';
import { loadReport } from '@/lib/reports/load';
import { isPeriodKey, type PeriodKey } from '@/lib/reports/period';
import { formatRunway } from '@/lib/metrics/finance';
import { signed } from '@/lib/format';
import { can } from '@/lib/roles';
import { planAllows } from '@/lib/billing/plans';
import { must } from '@/lib/data/members';
import { Card, CardHeader, Icon, Pill, Stat, EmptyState, Banner } from '@/components/ui';
import { PeriodPicker, ExportMenu, ModuleTabs, AdoptInsight } from '@/components/reports/ReportControls';
import { DigestSchedules } from '@/components/reports/DigestSchedules';
import type { ReportSchedule } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export const metadata: Metadata = { title: 'Reports & Analytics' };

const pc = (v: number | null, d = 0) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);

export default async function ReportsPage(props: { searchParams: Promise<{ period?: string }> }) {
  const fmt = await getFormat();
  const searchParams = await props.searchParams;
  const { supabase, org, role, profile, user } = await requireAppContext();
  if (!can.seeFinance(role)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Executive intelligence</h1>
        <Banner tone="info">Reports are available to owners, operations directors and auditors.</Banner>
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
      <Stat label="Sprints closed" value={r.eng.sprintsClosed} sub={r.eng.sprintsClosed ? `${Math.round((r.eng.onTarget / r.eng.sprintsClosed) * 100)}% on target` : 'none this period'} />
      <Stat label="Points completed" value={r.eng.donePoints} sub={r.eng.pointsChangePct !== null ? `${signed(r.eng.pointsChangePct, 1, '%')} vs previous` : undefined} />
      <Stat label="Avg cycle time" value={r.eng.avgCycleDays !== null ? `${r.eng.avgCycleDays.toFixed(1)} d` : '—'} sub="created → done" />
      <Stat label="Velocity index" value={r.eng.velocityIndex !== null ? r.eng.velocityIndex : '—'} sub="done ÷ committed points" />
    </div>
  );
  const fin = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Stat label="Burn this period" value={fmt.money(r.finance.periodBurn, cur, { compact: true })} sub={r.finance.burnChangePct !== null ? `${signed(r.finance.burnChangePct, 1, '%')} vs previous` : undefined} />
      <Stat label="Revenue this period" value={fmt.money(r.finance.periodRevenue, cur, { compact: true })} />
      <Stat label="Runway" value={formatRunway(r.finance.runwayMonths)} sub={r.finance.cashBalance !== null ? `Cash ${fmt.money(r.finance.cashBalance, cur, { compact: true })}` : undefined} />
      <Stat label="Payroll territories" value={r.finance.payrollTerritories ?? '—'} sub="latest recorded run" />
    </div>
  );
  const ppl = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Stat label="eNPS" value={r.people.enps !== null ? signed(r.people.enps, 0) : '—'} sub={r.people.enps === null ? 'Run an eNPS poll in Culture' : 'promoters − detractors'} />
      <Stat label="Burnout risk" value={pc(r.people.burnoutRisk, 1)} sub="mood ≤ 2 or > 20 meeting h/wk" />
      <Stat label="TZ harmony" value={pc(r.people.tzHarmony)} sub="attendance inside working hours" />
      <Stat label="Check-in completion" value={pc(r.people.checkinRate)} sub={r.people.mood !== null ? `avg mood ${r.people.mood.toFixed(1)}/5` : undefined} />
    </div>
  );
  const sec = (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <Stat label="Controls passing" value={r.infosec.controls.total ? `${r.infosec.controls.pct}%` : '—'} sub={`${r.infosec.controls.passing}/${r.infosec.controls.total}`} />
      <Stat label="Devices compliant" value={`${r.infosec.devices.compliant}/${r.infosec.devices.total}`} />
      <Stat label="Security training" value={r.infosec.training ? `${r.infosec.training.done}/${r.infosec.training.total}` : '—'} sub={r.infosec.training ? 'completed' : 'no campaign'} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label-xs uppercase text-on-surface-variant">Reports & analytics · audience: board & exec</p>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Executive intelligence</h1>
        </div>
        <div className="flex items-end gap-2">
          <PeriodPicker value={period} />
          <ExportMenu period={period} slackConnected={slackConnected} canDispatch={can.manage(role)} />
        </div>
      </div>

      <Card glow>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="bolt" className="text-secondary" />Distributed velocity · {r.period.label}</h2>
          {r.eng.pointsChangePct !== null && <Pill tone={r.eng.pointsChangePct >= 0 ? 'healthy' : 'warning'}>{signed(r.eng.pointsChangePct, 1, '%')} vs previous period</Pill>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <p className="text-label-xs uppercase text-on-surface-variant">Velocity index</p>
            <p className="mt-1 text-headline-xl leading-none tnum">{r.eng.velocityIndex ?? '—'}<span className="text-headline-md text-on-surface-variant">{r.eng.velocityIndex !== null ? ' / 100' : ''}</span></p>
            <p className="mt-1 text-body-sm text-on-surface-variant">Completed ÷ committed points for sprints that ended in the period. Compared with your own history, not other companies.</p>
          </div>
          <Stat label="Sync load" value={`${r.sync.meetingHours.toFixed(0)} h`} sub={`${r.sync.hoursSaved >= 0 ? `${r.sync.hoursSaved.toFixed(0)} h fewer` : `${(-r.sync.hoursSaved).toFixed(0)} h more`} than previous · ${fmt.money(Math.abs(r.sync.costDiffMinor), cur, { compact: true })} ${r.sync.costDiffMinor >= 0 ? 'saved' : 'added'}`} />
          <Stat label="Async decision rate" value={pc(r.sync.asyncRate)} sub={`${r.sync.meetings} meetings · async-first share`} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Domain modules" icon="dashboard" />
        <ModuleTabs modules={[{ id: 'eng', label: 'Eng & Product', content: eng }, { id: 'fin', label: 'Finance & Treasury', content: fin }, { id: 'ppl', label: 'People & Culture', content: ppl }, { id: 'sec', label: 'Infosec & Audit', content: sec }]} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader title="Chrono-optimizer insights" icon="auto_awesome" subtitle="Rule-based suggestions from the next 14 days of meetings. Nothing changes until you adopt it." />
          {r.insights.length === 0 ? <EmptyState icon="event_available" title="No improvements found" body="Upcoming meetings already sit inside everyone's working hours, or no shift within ±2h would help." /> : (
            <ul className="divide-y divide-outline-variant">
              {r.insights.map((i) => {
                const label = `Move “${i.title}” ${Math.abs(i.shiftMin)} min ${i.shiftMin < 0 ? 'earlier' : 'later'} to ${formatInTimeZone(i.newStart, profile.timezone, 'EEE HH:mm')} your time`;
                return (
                  <li key={i.meetingId} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div>
                      <h3 className="text-label-md">{label}</h3>
                      <p className="text-body-sm text-on-surface-variant">{i.insideAfter} of {i.total} attendees inside working hours instead of {i.insideBefore}.</p>
                    </div>
                    <AdoptInsight meetingId={i.meetingId} newStart={new Date(i.newStart).toISOString()} label={label} canAdopt={can.write(role)} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Scheduled digests" icon="schedule_send" />
          <DigestSchedules orgId={org.id} items={must(schedRes, 'schedules') as ReportSchedule[]} canManage={can.manage(role)} defaultEmail={user.email ?? ''} allowed={planAllows(org.plan, 'scheduledDigests')} />
        </Card>
      </div>
    </div>
  );
}
