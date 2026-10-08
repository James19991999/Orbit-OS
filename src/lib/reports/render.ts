import type { Report } from './load';
import type { PdfDoc } from './pdf';
import { formatMoney, signed } from '@/lib/format';
import { formatRunway } from '@/lib/metrics/finance';
import { formatInTimeZone } from 'date-fns-tz';

const pc = (v: number | null, d = 0) => (v === null ? '-' : `${(v * 100).toFixed(d)}%`);
const chg = (v: number | null) => (v === null ? 'n/a' : signed(v, 1, '%'));

export function reportHeadline(r: Report) {
  const cur = r.org.currency;
  return [
    ['Velocity index', r.eng.velocityIndex === null ? 'No sprints closed' : `${r.eng.velocityIndex} / 100`],
    ['Points completed', `${r.eng.donePoints} (${chg(r.eng.pointsChangePct)} vs previous period)`],
    ['Meeting hours (person-hours)', `${r.sync.meetingHours.toFixed(1)} (${r.sync.hoursSaved >= 0 ? `${r.sync.hoursSaved.toFixed(1)} fewer` : `${(-r.sync.hoursSaved).toFixed(1)} more`} than previous)`],
    ['Sync cost difference', formatMoney(Math.abs(r.sync.costDiffMinor), cur) + (r.sync.costDiffMinor >= 0 ? ' saved' : ' added')],
    ['Async-first meetings', pc(r.sync.asyncRate)],
    ['Burn this period', `${formatMoney(r.finance.periodBurn, cur)} (${chg(r.finance.burnChangePct)})`],
    ['Runway', formatRunway(r.finance.runwayMonths)],
    ['Check-in completion', pc(r.people.checkinRate)],
    ['Controls passing', r.infosec.controls.total ? `${r.infosec.controls.passing}/${r.infosec.controls.total} (${r.infosec.controls.pct}%)` : 'No frameworks'],
  ] as [string, string][];
}

export function reportToPdf(r: Report): PdfDoc {
  const cur = r.org.currency;
  return {
    title: `${r.org.name} — Executive intelligence`,
    subtitle: `${r.period.label} · generated ${r.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    footer: `${r.org.name} · board & exec`,
    sections: [
      { heading: 'Headline metrics', kv: reportHeadline(r) },
      { heading: 'Engineering & product', kv: [
        ['Sprints closed', `${r.eng.sprintsClosed} (${r.eng.onTarget} on target)`],
        ['Average task cycle time', r.eng.avgCycleDays === null ? '-' : `${r.eng.avgCycleDays.toFixed(1)} days`],
      ] },
      { heading: 'Finance & treasury', kv: [
        ['Cash balance', r.finance.cashBalance === null ? '-' : formatMoney(r.finance.cashBalance, cur)],
        ['Average monthly burn (3 mo)', formatMoney(r.finance.monthlyBurn, cur)],
        ['Revenue this period', formatMoney(r.finance.periodRevenue, cur)],
        ['Payroll territories', r.finance.payrollTerritories === null ? '-' : String(r.finance.payrollTerritories)],
      ], table: r.finance.months.length ? { head: ['Month', 'Burn', 'Revenue', 'Net'], widths: [120, 125, 125, 129],
        rows: r.finance.months.map((m) => [m.month, formatMoney(m.burn, cur), formatMoney(m.revenue, cur), formatMoney(m.net, cur)]) } : undefined },
      { heading: 'People & culture', kv: [
        ['Members', String(r.people.members)], ['eNPS', r.people.enps === null ? 'No eNPS poll' : signed(r.people.enps, 0)],
        ['Average mood', r.people.mood === null ? '-' : `${r.people.mood.toFixed(1)} / 5`], ['Burnout risk', pc(r.people.burnoutRisk, 1)],
        ['Meetings inside working hours', pc(r.people.tzHarmony)],
      ] },
      { heading: 'Infosec & audit', kv: [
        ['Controls passing', `${r.infosec.controls.passing}/${r.infosec.controls.total}`],
        ['Devices compliant', `${r.infosec.devices.compliant}/${r.infosec.devices.total}`],
        ['Security training', r.infosec.training ? `${r.infosec.training.done}/${r.infosec.training.total}` : 'No campaign'],
      ] },
      ...(r.insights.length ? [{ heading: 'Scheduling insights', lines: r.insights.map((i) => `Move "${i.title}" ${Math.abs(i.shiftMin)} min ${i.shiftMin < 0 ? 'earlier' : 'later'} (${formatInTimeZone(i.newStart, 'UTC', 'EEE HH:mm')} UTC): ${i.insideAfter}/${i.total} attendees inside working hours instead of ${i.insideBefore}.`) }] : []),
    ],
  };
}

export function reportToCsv(r: Report): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [['section', 'metric', 'value']];
  for (const [k, v] of reportHeadline(r)) rows.push(['headline', k, v]);
  rows.push(['eng', 'sprints_closed', r.eng.sprintsClosed], ['eng', 'sprints_on_target', r.eng.onTarget], ['eng', 'points_done', r.eng.donePoints],
    ['eng', 'avg_cycle_days', r.eng.avgCycleDays === null ? null : r.eng.avgCycleDays.toFixed(2)],
    ['sync', 'meeting_person_hours', r.sync.meetingHours.toFixed(2)], ['sync', 'prev_meeting_person_hours', r.sync.prevMeetingHours.toFixed(2)],
    ['finance', 'cash_balance_minor', r.finance.cashBalance], ['finance', 'period_burn_minor', r.finance.periodBurn], ['finance', 'period_revenue_minor', r.finance.periodRevenue],
    ['people', 'checkin_rate', r.people.checkinRate], ['people', 'burnout_risk', r.people.burnoutRisk], ['people', 'tz_harmony', r.people.tzHarmony], ['people', 'enps', r.people.enps],
    ['infosec', 'controls_passing', r.infosec.controls.passing], ['infosec', 'controls_total', r.infosec.controls.total],
    ['infosec', 'devices_compliant', r.infosec.devices.compliant], ['infosec', 'devices_total', r.infosec.devices.total]);
  for (const m of r.finance.months) rows.push(['finance_month', m.month, `burn=${m.burn};revenue=${m.revenue};net=${m.net}`]);
  return rows;
}

export function reportToSlack(r: Report, link: string) {
  const lines = reportHeadline(r).map(([k, v]) => `• *${k}:* ${v}`);
  return { text: `*${r.org.name} — ${r.period.label} executive summary*\n${lines.join('\n')}\n<${link}|Open Reports in OrbitOS>` };
}
