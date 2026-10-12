import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { sprintProgress } from '@/lib/metrics/sprint';
import { summarizeFinance, type MonthlyRow } from '@/lib/metrics/finance';
import { unpaidSummary, invoiceDisplayStatus } from '@/lib/metrics/invoices';
import { signed, type Currency } from '@/lib/format';
import { can } from '@/lib/roles';
import { Card, CardHeader, Icon, Pill, ProgressBar, EmptyState, LinkTabs, Stat, Banner, type Tone } from '@/components/ui';
import { TaskBoard } from '@/components/operations/TaskBoard';
import { PRIORITY_TONE, dueInfo } from '@/lib/tasks';
import { getT } from '@/i18n/server';
import type { MessageKey, T } from '@/i18n/shared';
import { OpsActions } from '@/components/operations/OpsActions';
import { Approvals } from '@/components/operations/Approvals';
import { Payouts, type PayoutBatchView } from '@/components/operations/Payouts';
import { FinanceChart } from '@/components/operations/FinanceChart';
import { ActivityStream, type ActivityEvent } from '@/components/operations/ActivityStream';
import type { Sprint, Task, FinanceEntry, Invoice, PayrollRun } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.ops.title') };
}

const runwayText = (t: T, m: number | null) => (m === null ? '—' : !Number.isFinite(m) ? t('p.dash.runway_positive') : m >= 24 ? t('p.dash.runway_24') : t('p.dash.runway_mo', { n: m.toFixed(1) }));

const INVOICE_TONE: Record<string, Tone> = { draft: 'neutral', sent: 'info', due_today: 'warning', overdue: 'alert', paid: 'healthy', void: 'neutral' };

export default async function OperationsPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const [ctx, t] = await Promise.all([requireAppContext(), getT()]);
  const { supabase, org, role, user, aal } = ctx;
  const tab = searchParams.tab === 'finance' || searchParams.tab === 'activity' ? searchParams.tab : 'sprints';
  const today = new Date().toISOString().slice(0, 10);
  // One round trip for everything the header and tabs share.
  const [members, sprintsRes, invoicesRes] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('sprints').select('*').eq('org_id', org.id).order('starts_on', { ascending: false }).limit(20),
    can.seeFinance(role) ? supabase.from('invoices').select('*').eq('org_id', org.id).order('issued_on', { ascending: false }).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  const people = nameMap(members);
  const sprints = must(sprintsRes, 'sprints') as Sprint[];
  const active = sprints.find((s) => s.starts_on <= today && s.ends_on >= today) ?? null;
  const invoices = must(invoicesRes, 'invoices') as Invoice[];

  const actions = (
    <OpsActions orgId={org.id} userId={user.id} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name }))}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name }))} activeSprintId={active?.id ?? null} currency={org.currency}
      thresholdMinor={Number(org.expense_approval_threshold_minor)} invoiceNumbers={invoices.map((i) => i.number)}
      canManage={can.manage(role)} canWrite={can.write(role)} memberEmails={members.map((m) => m.profile.email ?? '').filter(Boolean)}
      show={tab === 'sprints' ? ['task', 'sprint'] : tab === 'finance' ? ['finance', 'payroll', 'invoice'] : ['task']} />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.ops.title')}</h1>
          <p className="text-body-md text-on-surface-variant">{t('p.ops.sub')}</p>
        </div>
        {actions}
      </div>
      <LinkTabs label={t('p.ops.sections')} tabs={[{ id: 'sprints', label: t('p.ops.tab.sprints') }, { id: 'finance', label: t('p.ops.tab.finance') }, { id: 'activity', label: t('p.ops.tab.activity') }]} />
      {tab === 'sprints' && <SprintsTab t={t} ctxOrgId={org.id} active={active} sprints={sprints} people={people} canManage={can.manage(role)} userId={user.id} supabase={supabase} />}
      {tab === 'finance' && (can.seeFinance(role)
        ? <FinanceTab t={t} supabase={supabase} orgId={org.id} currency={org.currency} invoices={invoices} people={people} userId={user.id} canApprove={can.manage(role)} aal={aal.current} />
        : <Banner tone="info">{t('p.ops.finance_only')}</Banner>)}
      {tab === 'activity' && <ActivityTab t={t} supabase={supabase} orgId={org.id} cities={Object.fromEntries(members.map((m) => [m.user_id, m.profile.city]))} />}
    </div>
  );
}

async function SprintsTab({ t, ctxOrgId, active, sprints, people, canManage, userId, supabase }:
  { t: T; ctxOrgId: string; active: Sprint | null; sprints: Sprint[]; people: ReturnType<typeof nameMap>; canManage: boolean; userId: string; supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase'] }) {
  const tasks = must(await (active
    ? supabase.from('tasks').select('*').eq('org_id', ctxOrgId).or(`sprint_id.eq.${active.id},sprint_id.is.null`).order('created_at', { ascending: false })
    : supabase.from('tasks').select('*').eq('org_id', ctxOrgId).is('sprint_id', null).order('created_at', { ascending: false })).limit(200), 'tasks') as Task[];
  const fmt = await getFormat();
  const sprintTasks = active ? tasks.filter((x) => x.sprint_id === active.id) : [];
  const prog = active ? sprintProgress(active, sprintTasks) : null;
  const highPriority = sprintTasks.filter((x) => (x.priority === 'high' || x.priority === 'critical') && x.status !== 'done');
  const statusTone = prog?.status === 'on_track' ? 'healthy' : prog?.status === 'at_risk' ? 'warning' : 'alert';
  return (
    <div className="flex flex-col gap-4">
      {active && prog ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
          <Card glow className="xl:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-label-xs uppercase text-on-surface-variant">{t('p.ops.active', { day: prog.day, total: prog.totalDays })}</p>
              <Pill tone={statusTone} pulse>{t(prog.status === 'on_track' ? 'p.ops.on_track' : prog.status === 'at_risk' ? 'p.ops.at_risk' : 'p.ops.behind')}</Pill>
            </div>
            <h2 className="mt-2 text-headline-md">{active.name}</h2>
            {active.goal && <p className="mt-1 text-body-md text-on-surface-variant">{active.goal}</p>}
            <p className="mt-4 text-headline-xl leading-none tnum">{prog.pct}%</p>
            <div className="mt-3"><ProgressBar value={prog.done} max={prog.committed} label={t('p.ops.points_done')} tone={statusTone} /></div>
            <p className="mt-2 text-body-sm text-on-surface-variant tnum">{t('p.ops.sprint_line', { done: prog.done, committed: prog.committed, delta: signed(prog.velocityDeltaPct, 0, '%'), blocked: prog.blocked })}</p>
          </Card>
          <Card className="xl:col-span-7">
            <CardHeader title={t('p.ops.high')} subtitle={t('p.ops.in_flight', { n: highPriority.length })} icon="priority_high" />
            {highPriority.length === 0 ? <EmptyState icon="done_all" title={t('p.ops.no_high')} /> : (
              <ul className="divide-y divide-outline-variant">
                {highPriority.map((task) => { const due = dueInfo(task.due_on); return (
                  <li key={task.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={PRIORITY_TONE[task.priority]}>{t(`task.pr.${task.priority}` as MessageKey)}</Pill>
                        <Pill tone={task.status === 'blocked' ? 'alert' : 'info'}>{t(`task.st.${task.status}` as MessageKey)}</Pill>
                        {due && <span className="flex items-center gap-1 text-body-sm text-on-surface-variant tnum"><Icon name="alarm" className="text-[14px]" />{t(due.key, { n: due.n })}</span>}
                      </div>
                      <h3 className="mt-1 text-label-md"><Link href={`/operations/tasks/${task.id}`} className="hover:underline">{task.title}</Link></h3>
                      {task.status === 'blocked' && <p className="text-body-sm text-alert">{task.blocked_reason}</p>}
                      {task.description && task.status !== 'blocked' && <p className="line-clamp-1 text-body-sm text-on-surface-variant">{task.description}</p>}
                    </div>
                    <span className="shrink-0 text-body-sm text-on-surface-variant">{task.assignee_id ? people[task.assignee_id]?.name : t('p.ops.unassigned')}</span>
                  </li>
                ); })}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState icon="date_range" title={t('p.ops.no_sprint')} body={canManage ? t('p.ops.no_sprint_mgr') : t('p.ops.no_sprint_member')} />
      )}
      <Card>
        <CardHeader title={active ? t('p.ops.board', { name: active.name }) : t('p.ops.backlog')} subtitle={t('p.ops.board_sub')} icon="view_kanban" />
        {tasks.length === 0 ? <EmptyState icon="add_task" title={t('p.ops.no_tasks')} body={t('p.ops.no_tasks_body')} /> :
          <TaskBoard initial={tasks} people={people} canEditAll={canManage} userId={userId} />}
      </Card>
      {sprints.length > 1 && (
        <Card>
          <CardHeader title={t('p.ops.history')} icon="history" />
          <ul className="divide-y divide-outline-variant text-body-md">
            {sprints.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{s.name}</span>
                <span className="text-on-surface-variant tnum">{fmt.date(s.starts_on)} → {fmt.date(s.ends_on)} · {t('p.ops.pts', { n: s.committed_points })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function FinanceTab({ t, supabase, orgId, currency, invoices, people, userId, canApprove, aal }:
  { t: T; supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase']; orgId: string; currency: Currency; invoices: Invoice[]; people: ReturnType<typeof nameMap>; userId: string; canApprove: boolean; aal: string | null }) {
  const fmt = await getFormat();
  const [monthly, entries, pending, payroll, payoutRes] = await Promise.all([
    supabase.rpc('finance_monthly', { p_org: orgId, p_months: 6 }),
    supabase.from('finance_entries').select('*').eq('org_id', orgId).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(25),
    supabase.from('finance_entries').select('*').eq('org_id', orgId).eq('approval_status', 'pending').order('created_at'),
    supabase.from('payroll_runs').select('*').eq('org_id', orgId).order('period', { ascending: false }).limit(12),
    supabase.from('payout_batches').select('id, title, status, total_minor, line_count, created_at, created_by, approved_by, failure_reason, lines:payout_lines(id, name, phone, amount_minor, status, failure_reason)').eq('org_id', orgId).order('created_at', { ascending: false }).limit(20),
  ]);
  const payouts: PayoutBatchView[] = ((must(payoutRes, 'payouts') ?? []) as unknown as (Omit<PayoutBatchView, 'creator' | 'approver'> & { approved_by: string | null })[]).map((b) => ({
    ...b, total_minor: Number(b.total_minor), lines: b.lines.map((l) => ({ ...l, amount_minor: Number(l.amount_minor) })),
    creator: people[b.created_by]?.name ?? 'member', approver: b.approved_by ? people[b.approved_by]?.name ?? 'member' : null,
  }));
  const s = summarizeFinance(must(monthly, 'finance summary') as MonthlyRow[]);
  const ledger = must(entries, 'ledger') as FinanceEntry[];
  const runs = must(payroll, 'payroll') as PayrollRun[];
  const unpaid = unpaidSummary(invoices);
  const lastRun = runs[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
        <Card glow className="xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="account_balance" className="text-secondary" />{t('p.ops.cash')}</h2>
            <Pill tone={s.runwayMonths === null ? 'neutral' : !Number.isFinite(s.runwayMonths) || s.runwayMonths >= 18 ? 'healthy' : s.runwayMonths >= 9 ? 'warning' : 'alert'}>{t('p.ops.runway', { runway: runwayText(t, s.runwayMonths) })}</Pill>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label={t('p.ops.cash_balance')} value={s.cashBalance !== null ? fmt.money(s.cashBalance, currency, { compact: true }) : '—'} sub={s.cashBalance === null ? t('p.ops.log_balance') : t('p.ops.latest')} />
            <Stat label={t('p.ops.burn')} value={fmt.money(s.monthlyBurn, currency, { compact: true })} sub={s.burnChangePct !== null ? t('p.ops.vs_prior', { delta: signed(s.burnChangePct, 1, '%') }) : t('p.ops.avg3')} />
            <Stat label={t('p.ops.net')} value={fmt.money(s.netCashFlow, currency, { compact: true })} sub={s.netCashFlowChangePct !== null ? t('p.ops.vs_last', { delta: signed(s.netCashFlowChangePct, 1, '%') }) : undefined} />
            <Stat label={t('p.ops.unpaid')} value={fmt.money(unpaid.total, currency, { compact: true })} sub={t('p.ops.unpaid_sub', { open: unpaid.count, today: unpaid.dueToday, overdue: unpaid.overdue })} />
          </div>
          {s.months.length > 0 ? <div className="mt-5"><FinanceChart months={s.months} currency={currency} /></div>
            : <EmptyState className="mt-5" icon="bar_chart" title={t('p.ops.no_fin')} body={t('p.ops.no_fin_body')} />}
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader title={t('p.ops.payroll')} icon="public" subtitle={t('p.ops.payroll_sub')} />
          {lastRun ? (
            <>
              <p className="text-headline-md tnum">{fmt.money(lastRun.total_minor, lastRun.currency)}</p>
              <p className="text-body-sm text-on-surface-variant">{t('p.ops.payroll_line', { period: fmt.date(lastRun.period, 'month') + ' ' + lastRun.period.slice(0, 4), countries: t('p.ops.n_countries', { count: lastRun.country_count }), provider: lastRun.provider_label })}</p>
              <ul className="mt-3 divide-y divide-outline-variant text-body-sm">
                {runs.slice(1, 6).map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.period} · {r.provider_label}</span><span className="tnum">{fmt.money(r.total_minor, r.currency, { compact: true })}</span></li>)}
              </ul>
            </>
          ) : <EmptyState icon="payments" title={t('p.ops.no_payroll')} />}
        </Card>
      </div>

      <Card id="approvals">
        <CardHeader title={t('p.ops.approvals')} icon="fact_check" subtitle={t('p.ops.approvals_sub')} />
        <Approvals items={must(pending, 'approvals') as FinanceEntry[]} people={people} userId={userId} canApprove={canApprove} />
      </Card>

      <Card id="payouts">
        <CardHeader title={t('p.ops.payouts')} icon="send_money" subtitle={t('p.ops.payouts_sub')} />
        <Payouts batches={payouts} canManage={canApprove} userId={userId} aal={aal} memberNames={Object.values(people).map((p) => p.name).filter(Boolean).sort()} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader title={t('p.ops.invoices')} icon="request_quote" subtitle={t('p.ops.invoices_sub')} />
          {invoices.length === 0 ? <EmptyState icon="request_quote" title={t('p.ops.no_invoices')} /> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-2 pr-3">{t('p.ops.col.invoice')}</th><th scope="col" className="py-2 pr-3">{t('p.ops.col.client')}</th><th scope="col" className="py-2 pr-3 text-right">{t('p.ops.col.amount')}</th><th scope="col" className="py-2">{t('p.ops.col.status')}</th></tr></thead>
                <tbody>
                  {invoices.slice(0, 12).map((i) => {
                    const st = invoiceDisplayStatus(i);
                    return (
                      <tr key={i.id} className="border-b border-outline-variant last:border-0 hover:bg-on-surface/[0.03]">
                        <td className="py-2 pr-3"><Link href={`/operations/invoices/${i.id}`} className="text-primary hover:underline">{i.number}</Link></td>
                        <td className="py-2 pr-3">{i.client_name}</td>
                        <td className="py-2 pr-3 text-right tnum">{fmt.money(i.amount_minor, i.currency)}</td>
                        <td className="py-2"><Pill tone={INVOICE_TONE[st]}>{t(`inv.st.${st}` as MessageKey)}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t('p.ops.ledger')} icon="receipt_long" subtitle={t('p.ops.ledger_sub')} />
          {ledger.length === 0 ? <EmptyState icon="receipt_long" title={t('p.ops.no_entries')} /> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-2 pr-3">{t('p.ops.col.date')}</th><th scope="col" className="py-2 pr-3">{t('p.ops.col.entry')}</th><th scope="col" className="py-2 text-right">{t('p.ops.col.amount')}</th></tr></thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b border-outline-variant last:border-0">
                      <td className="py-2 pr-3 tnum text-on-surface-variant">{fmt.date(e.occurred_on)}</td>
                      <td className="py-2 pr-3">
                        <span>{t(`fin.kind.${e.kind}` as MessageKey)}</span> · {e.vendor ?? e.category ?? '—'}
                        {e.approval_status !== 'approved' && <Pill tone={e.approval_status === 'pending' ? 'warning' : 'alert'} className="ml-2">{t(e.approval_status === 'pending' ? 'p.ops.pending' : 'p.ops.rejected')}</Pill>}
                      </td>
                      <td className={`py-2 text-right tnum ${e.kind === 'revenue' ? 'text-healthy' : ''}`}>{e.kind === 'revenue' ? '+' : e.kind === 'cash_balance' ? '' : '−'}{fmt.money(e.amount_minor, e.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

async function ActivityTab({ t, supabase, orgId, cities }: { t: T; supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase']; orgId: string; cities: Record<string, string | null> }) {
  const events = must(await supabase.from('activity_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(50), 'activity') as ActivityEvent[];
  return (
    <Card>
      <CardHeader title={t('p.ops.stream')} icon="dynamic_feed" />
      <ActivityStream orgId={orgId} initial={events} cities={cities} />
    </Card>
  );
}
