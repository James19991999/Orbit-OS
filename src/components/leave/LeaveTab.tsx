import type { SupabaseClient } from '@supabase/supabase-js';
import { Avatar, Card, CardHeader, EmptyState, Pill } from '@/components/ui';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/shared';
import { getFormat } from '@/lib/locale/server';
import { annualBalance, DEFAULT_ANNUAL_DAYS, type AwayRow, type LeaveRequest } from '@/lib/leave';
import { can } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { CancelLeave, DecideLeave, LeaveAllowance, RequestLeave } from './LeaveActions';

const TONE = { pending: 'warning', approved: 'healthy', declined: 'alert', cancelled: 'neutral' } as const;

/** People → Time off: my balance and requests, approvals for managers, and who's away. */
export async function LeaveTab({ supabase, orgId, userId, role, people }: {
  supabase: SupabaseClient; orgId: string; userId: string; role: Role; people: Record<string, { name: string; avatar: string | null }>;
}) {
  const [t, fmt] = await Promise.all([getT(), getFormat()]);
  const now = new Date();
  const year = now.getUTCFullYear();
  const todayIso = now.toISOString().slice(0, 10);
  const in60 = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const manager = can.manage(role);
  const [mineR, pendingR, awayR, settingsR] = await Promise.all([
    supabase.from('leave_requests').select('*').eq('org_id', orgId).eq('user_id', userId).gte('ends_on', `${year - 1}-12-01`).order('starts_on', { ascending: false }).limit(100),
    manager ? supabase.from('leave_requests').select('*').eq('org_id', orgId).eq('status', 'pending').neq('user_id', userId).order('starts_on').limit(100) : Promise.resolve({ data: [] }),
    supabase.rpc('team_away', { p_org: orgId, p_from: todayIso, p_to: in60 }),
    supabase.from('leave_settings').select('annual_days').eq('org_id', orgId).maybeSingle(),
  ]);
  const mine = (mineR.data ?? []) as LeaveRequest[];
  const pending = (pendingR.data ?? []) as LeaveRequest[];
  const away = (awayR.data ?? []) as AwayRow[];
  const allowance = (settingsR.data as { annual_days: number } | null)?.annual_days ?? DEFAULT_ANNUAL_DAYS;
  const bal = annualBalance(mine, allowance, year);
  const range = (r: { starts_on: string; ends_on: string }) => r.starts_on === r.ends_on ? fmt.date(r.starts_on) : `${fmt.date(r.starts_on)} – ${fmt.date(r.ends_on)}`;
  const nameOf = (id: string) => people[id]?.name ?? '—';

  return (
    <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
      <div className="flex flex-col gap-4 xl:col-span-7">
        <Card aria-labelledby="lv-bal-h">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="lv-bal-h" className="text-label-xs uppercase text-on-surface-variant">{t('lv.balance', { year })}</h2>
              <p className="mt-1 text-headline-md tnum">{t('lv.left', { count: bal.left })}</p>
              <p className="mt-1 text-body-sm text-on-surface-variant tnum">{t('lv.used', { used: bal.used, pending: bal.pending, allowance: bal.allowance })}</p>
            </div>
            {can.write(role) && <RequestLeave orgId={orgId} />}
          </div>
        </Card>

        {manager && (
          <Card aria-labelledby="lv-appr-h">
            <CardHeader title={<span id="lv-appr-h">{t('lv.approvals')}</span>} icon="pending_actions" />
            {pending.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('lv.approvals_empty')}</p> : (
              <ul className="divide-y divide-outline-variant">
                {pending.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar name={nameOf(r.user_id)} src={people[r.user_id]?.avatar} size={28} />
                      <span className="text-label-md">{nameOf(r.user_id)}</span>
                      <Pill tone="info">{t(`lv.k.${r.kind}` as MessageKey)}</Pill>
                      <span className="text-body-sm text-on-surface-variant tnum">{range(r)} · {t('lv.days', { count: r.days })}</span>
                    </div>
                    {r.note && <p className="mt-1 whitespace-pre-wrap text-body-sm text-on-surface-variant">“{r.note}”</p>}
                    <DecideLeave id={r.id} name={nameOf(r.user_id)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card aria-labelledby="lv-mine-h">
          <CardHeader title={<span id="lv-mine-h">{t('lv.mine')}</span>} icon="event_note" />
          {mine.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('lv.mine_empty')}</p> : (
            <ul className="divide-y divide-outline-variant">
              {mine.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-label-md">{t(`lv.k.${r.kind}` as MessageKey)} · <span className="tnum">{range(r)}</span></p>
                    <p className="text-body-sm text-on-surface-variant">
                      {t('lv.days', { count: r.days })}
                      {r.decided_by && r.status !== 'cancelled' ? ` · ${t('lv.decided', { status: t(`lv.st.${r.status}` as MessageKey), name: nameOf(r.decided_by) })}` : ''}
                    </p>
                    {r.decision_note && <p className="mt-0.5 text-body-sm text-on-surface-variant">“{r.decision_note}”</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={TONE[r.status]}>{t(`lv.st.${r.status}` as MessageKey)}</Pill>
                    {(r.status === 'pending' || r.status === 'approved') && r.ends_on >= todayIso && <CancelLeave id={r.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4 xl:col-span-5">
        <Card aria-labelledby="lv-away-h">
          <CardHeader title={<span id="lv-away-h">{t('lv.away')}</span>} subtitle={t('lv.away_sub')} icon="flight_takeoff" />
          {away.length === 0 ? <EmptyState icon="groups" title={t('lv.away_empty')} /> : (
            <ul className="flex flex-col gap-3">
              {away.map((a, i) => (
                <li key={`${a.user_id}-${i}`} className="flex items-center gap-3">
                  <Avatar name={nameOf(a.user_id)} src={people[a.user_id]?.avatar} size={32} />
                  <div className="min-w-0">
                    <p className="text-label-md">{nameOf(a.user_id)}</p>
                    <p className="text-body-sm text-on-surface-variant tnum">{range(a)}</p>
                  </div>
                  {a.starts_on <= todayIso && <Pill tone="info" className="ml-auto">{t('lv.on_leave')}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manager && <Card><LeaveAllowance orgId={orgId} value={allowance} /></Card>}
      </div>
    </div>
  );
}
