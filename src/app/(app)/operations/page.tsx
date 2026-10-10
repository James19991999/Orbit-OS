import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { sprintProgress } from '@/lib/metrics/sprint';
import { summarizeFinance, formatRunway, type MonthlyRow } from '@/lib/metrics/finance';
import { unpaidSummary, invoiceDisplayStatus } from '@/lib/metrics/invoices';
import { signed, type Currency } from '@/lib/format';
import { can } from '@/lib/roles';
import { Card, CardHeader, Icon, Pill, ProgressBar, EmptyState, LinkTabs, Stat, Banner, type Tone } from '@/components/ui';
import { TaskBoard } from '@/components/operations/TaskBoard';
import { PRIORITY_TONE, dueLabel } from '@/lib/tasks';
import { OpsActions } from '@/components/operations/OpsActions';
import { Approvals } from '@/components/operations/Approvals';
import { Payouts, type PayoutBatchView } from '@/components/operations/Payouts';
import { FinanceChart } from '@/components/operations/FinanceChart';
import { ActivityStream, type ActivityEvent } from '@/components/operations/ActivityStream';
import type { Sprint, Task, FinanceEntry, Invoice, PayrollRun } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export const metadata: Metadata = { title: 'Operations' };

const INVOICE_TONE: Record<string, Tone> = { draft: 'neutral', sent: 'info', due_today: 'warning', overdue: 'alert', paid: 'healthy', void: 'neutral' };

export default async function OperationsPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const ctx = await requireAppContext();
  const { supabase, org, role, user, aal } = ctx;
  const tab = searchParams.tab === 'finance' || searchParams.tab === 'activity' ? searchParams.tab : 'sprints';
  const today = new Date().toISOString().slice(0, 10);
  const members = await loadMembers(supabase, org.id);
  const people = nameMap(members);
  const sprints = must(await supabase.from('sprints').select('*').eq('org_id', org.id).order('starts_on', { ascending: false }).limit(20), 'sprints') as Sprint[];
  const active = sprints.find((s) => s.starts_on <= today && s.ends_on >= today) ?? null;
  const invoices = can.seeFinance(role) ? must(await supabase.from('invoices').select('*').eq('org_id', org.id).order('issued_on', { ascending: false }).limit(100), 'invoices') as Invoice[] : [];

  const actions = (
    <OpsActions orgId={org.id} userId={user.id} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name }))}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name }))} activeSprintId={active?.id ?? null} currency={org.currency}
      thresholdMinor={Number(org.expense_approval_threshold_minor)} invoiceNumbers={invoices.map((i) => i.number)}
      canManage={can.manage(role)} canWrite={can.write(role)}
      show={tab === 'sprints' ? ['task', 'sprint'] : tab === 'finance' ? ['finance', 'payroll', 'invoice'] : ['task']} />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">Operations</h1>
          <p className="text-body-md text-on-surface-variant">Projects & sprints, finance & runway, and what the team is shipping.</p>
        </div>
        {actions}
      </div>
      <LinkTabs label="Operations sections" tabs={[{ id: 'sprints', label: 'Projects & Sprints' }, { id: 'finance', label: 'Finance & Runway' }, { id: 'activity', label: 'Team Activity' }]} />
      {tab === 'sprints' && <SprintsTab ctxOrgId={org.id} active={active} sprints={sprints} people={people} canManage={can.manage(role)} userId={user.id} supabase={supabase} />}
      {tab === 'finance' && (can.seeFinance(role)
        ? <FinanceTab supabase={supabase} orgId={org.id} currency={org.currency} invoices={invoices} people={people} userId={user.id} canApprove={can.manage(role)} aal={aal.current} />
        : <Banner tone="info">Finance details are visible to owners, operations directors and auditors. Your dashboard shows the runway summary.</Banner>)}
      {tab === 'activity' && <ActivityTab supabase={supabase} orgId={org.id} cities={Object.fromEntries(members.map((m) => [m.user_id, m.profile.city]))} />}
    </div>
  );
}

async function SprintsTab({ ctxOrgId, active, sprints, people, canManage, userId, supabase }:
  { ctxOrgId: string; active: Sprint | null; sprints: Sprint[]; people: ReturnType<typeof nameMap>; canManage: boolean; userId: string; supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase'] }) {
  const tasks = must(await (active
    ? supabase.from('tasks').select('*').eq('org_id', ctxOrgId).or(`sprint_id.eq.${active.id},sprint_id.is.null`).order('created_at', { ascending: false })
    : supabase.from('tasks').select('*').eq('org_id', ctxOrgId).is('sprint_id', null).order('created_at', { ascending: false })).limit(200), 'tasks') as Task[];
  const sprintTasks = active ? tasks.filter((t) => t.sprint_id === active.id) : [];
  const prog = active ? sprintProgress(active, sprintTasks) : null;
  const highPriority = sprintTasks.filter((t) => (t.priority === 'high' || t.priority === 'critical') && t.status !== 'done');
  const statusTone = prog?.status === 'on_track' ? 'healthy' : prog?.status === 'at_risk' ? 'warning' : 'alert';
  return (
    <div className="flex flex-col gap-4">
      {active && prog ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Card glow className="xl:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-label-xs uppercase text-on-surface-variant">Active sprint · Day {prog.day} of {prog.totalDays}</p>
              <Pill tone={statusTone} pulse>{prog.status === 'on_track' ? 'On track' : prog.status === 'at_risk' ? 'At risk' : 'Behind'}</Pill>
            </div>
            <h2 className="mt-2 text-headline-md">{active.name}</h2>
            {active.goal && <p className="mt-1 text-body-md text-on-surface-variant">{active.goal}</p>}
            <p className="mt-4 text-headline-xl leading-none tnum">{prog.pct}%</p>
            <div className="mt-3"><ProgressBar value={prog.done} max={prog.committed} label="Points completed" tone={statusTone} /></div>
            <p className="mt-2 text-body-sm text-on-surface-variant tnum">{prog.done} / {prog.committed} story points · {signed(prog.velocityDeltaPct, 0, '%')} vs ideal burndown · {prog.blocked} blocked</p>
          </Card>
          <Card className="xl:col-span-7">
            <CardHeader title="High-priority tasks" subtitle={`${highPriority.length} in flight`} icon="priority_high" />
            {highPriority.length === 0 ? <EmptyState icon="done_all" title="No high-priority work in flight" /> : (
              <ul className="divide-y divide-outline-variant">
                {highPriority.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                        <Pill tone={t.status === 'blocked' ? 'alert' : 'info'}>{t.status.replace('_', ' ')}</Pill>
                        {dueLabel(t.due_on) && <span className="flex items-center gap-1 text-body-sm text-on-surface-variant tnum"><Icon name="alarm" className="text-[14px]" />{dueLabel(t.due_on)}</span>}
                      </div>
                      <h3 className="mt-1 text-label-md"><Link href={`/operations/tasks/${t.id}`} className="hover:underline">{t.title}</Link></h3>
                      {t.status === 'blocked' && <p className="text-body-sm text-alert">{t.blocked_reason}</p>}
                      {t.description && t.status !== 'blocked' && <p className="line-clamp-1 text-body-sm text-on-surface-variant">{t.description}</p>}
                    </div>
                    <span className="shrink-0 text-body-sm text-on-surface-variant">{t.assignee_id ? people[t.assignee_id]?.name : 'Unassigned'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState icon="date_range" title="No active sprint" body={canManage ? 'Plan a sprint to track velocity and burndown.' : 'An owner or director can plan the next sprint.'} />
      )}
      <Card>
        <CardHeader title={active ? `${active.name} board` : 'Backlog'} subtitle="Drag cards between columns, or use each card's status menu." icon="view_kanban" />
        {tasks.length === 0 ? <EmptyState icon="add_task" title="No tasks yet" body="Create the first task to start tracking work." /> :
          <TaskBoard initial={tasks} people={people} canEditAll={canManage} userId={userId} />}
      </Card>
      {sprints.length > 1 && (
        <Card>
          <CardHeader title="Sprint history" icon="history" />
          <ul className="divide-y divide-outline-variant text-body-md">
            {sprints.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{s.name}</span>
                <span className="text-on-surface-variant tnum">{s.starts_on} → {s.ends_on} · {s.committed_points} pts</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function FinanceTab({ supabase, orgId, currency, invoices, people, userId, canApprove, aal }:
  { supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase']; orgId: string; currency: Currency; invoices: Invoice[]; people: ReturnType<typeof nameMap>; userId: string; canApprove: boolean; aal: string | null }) {
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
      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <Card glow className="xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-headline-sm"><Icon name="account_balance" className="text-secondary" />Cash & treasury</h2>
            <Pill tone={s.runwayMonths === null ? 'neutral' : !Number.isFinite(s.runwayMonths) || s.runwayMonths >= 18 ? 'healthy' : s.runwayMonths >= 9 ? 'warning' : 'alert'}>{formatRunway(s.runwayMonths)} runway</Pill>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Cash balance" value={s.cashBalance !== null ? fmt.money(s.cashBalance, currency, { compact: true }) : '—'} sub={s.cashBalance === null ? 'Log a bank balance' : 'Latest statement'} />
            <Stat label="Monthly burn" value={fmt.money(s.monthlyBurn, currency, { compact: true })} sub={s.burnChangePct !== null ? `${signed(s.burnChangePct, 1, '%')} vs prior month` : '3-month average'} />
            <Stat label="Net cash flow (MTD)" value={fmt.money(s.netCashFlow, currency, { compact: true })} sub={s.netCashFlowChangePct !== null ? `${signed(s.netCashFlowChangePct, 1, '%')} vs last month` : undefined} />
            <Stat label="Unpaid invoices" value={fmt.money(unpaid.total, currency, { compact: true })} sub={`${unpaid.count} open · ${unpaid.dueToday} due today · ${unpaid.overdue} overdue`} />
          </div>
          {s.months.length > 0 ? <div className="mt-5"><FinanceChart months={s.months} currency={currency} /></div>
            : <EmptyState className="mt-5" icon="bar_chart" title="No finance data yet" body="Log expenses, revenue, payroll and a cash balance to see burn and runway." />}
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader title="Payroll" icon="public" subtitle="M-Pesa payouts made here, plus runs recorded from other payroll providers." />
          {lastRun ? (
            <>
              <p className="text-headline-md tnum">{fmt.money(lastRun.total_minor, lastRun.currency)}</p>
              <p className="text-body-sm text-on-surface-variant">{lastRun.period} · {lastRun.country_count} {lastRun.country_count === 1 ? 'country' : 'countries'} · via {lastRun.provider_label}</p>
              <ul className="mt-3 divide-y divide-outline-variant text-body-sm">
                {runs.slice(1, 6).map((r) => <li key={r.id} className="flex justify-between py-2"><span>{r.period} · {r.provider_label}</span><span className="tnum">{fmt.money(r.total_minor, r.currency, { compact: true })}</span></li>)}
              </ul>
            </>
          ) : <EmptyState icon="payments" title="No payroll recorded" />}
        </Card>
      </div>

      <Card id="approvals">
        <CardHeader title="Approvals" icon="fact_check" subtitle="Expenses above your approval threshold need a second owner or director." />
        <Approvals items={must(pending, 'approvals') as FinanceEntry[]} people={people} userId={userId} canApprove={canApprove} />
      </Card>

      <Card id="payouts">
        <CardHeader title="M-Pesa payouts" icon="send_money" subtitle="Two-person approval · paid through IntaSend" />
        <Payouts batches={payouts} canManage={canApprove} userId={userId} aal={aal} memberNames={Object.values(people).map((p) => p.name).filter(Boolean).sort()} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card>
          <CardHeader title="Invoices" icon="request_quote" subtitle="Paid by clients via IntaSend (M-Pesa or card)" />
          {invoices.length === 0 ? <EmptyState icon="request_quote" title="No invoices yet" /> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-2 pr-3">Invoice</th><th scope="col" className="py-2 pr-3">Client</th><th scope="col" className="py-2 pr-3 text-right">Amount</th><th scope="col" className="py-2">Status</th></tr></thead>
                <tbody>
                  {invoices.slice(0, 12).map((i) => {
                    const st = invoiceDisplayStatus(i);
                    return (
                      <tr key={i.id} className="border-b border-outline-variant last:border-0 hover:bg-on-surface/[0.03]">
                        <td className="py-2 pr-3"><Link href={`/operations/invoices/${i.id}`} className="text-primary hover:underline">{i.number}</Link></td>
                        <td className="py-2 pr-3">{i.client_name}</td>
                        <td className="py-2 pr-3 text-right tnum">{fmt.money(i.amount_minor, i.currency)}</td>
                        <td className="py-2"><Pill tone={INVOICE_TONE[st]}>{st.replace('_', ' ')}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Ledger" icon="receipt_long" subtitle="Latest 25 entries" />
          {ledger.length === 0 ? <EmptyState icon="receipt_long" title="No entries yet" /> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-body-md">
                <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant"><th scope="col" className="py-2 pr-3">Date</th><th scope="col" className="py-2 pr-3">Entry</th><th scope="col" className="py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b border-outline-variant last:border-0">
                      <td className="py-2 pr-3 tnum text-on-surface-variant">{fmt.date(e.occurred_on)}</td>
                      <td className="py-2 pr-3">
                        <span className="capitalize">{e.kind.replace('_', ' ')}</span> · {e.vendor ?? e.category ?? '—'}
                        {e.approval_status !== 'approved' && <Pill tone={e.approval_status === 'pending' ? 'warning' : 'alert'} className="ml-2">{e.approval_status}</Pill>}
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

async function ActivityTab({ supabase, orgId, cities }: { supabase: Awaited<ReturnType<typeof requireAppContext>>['supabase']; orgId: string; cities: Record<string, string | null> }) {
  const events = must(await supabase.from('activity_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(50), 'activity') as ActivityEvent[];
  return (
    <Card>
      <CardHeader title="Real-time team stream" icon="dynamic_feed" />
      <ActivityStream orgId={orgId} initial={events} cities={cities} />
    </Card>
  );
}
