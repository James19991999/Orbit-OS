'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Icon, Input, Switch, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import type { AutomationSettings as Settings } from '@/lib/automations/rules';
import type { MessageKey } from '@/i18n/shared';
import { useT } from '@/i18n/client';

export interface ActivityRow { id: string; kind: string; step: string; created_at: string }

/** Owners/directors switch each automation on or off; everyone else sees what's on. */
export function AutomationSettings({ orgId, initial, canEdit, activity }: { orgId: string; initial: Settings; canEdit: boolean; activity: ActivityRow[] | null }) {
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [nudge, setNudge] = useState(String(initial.nudge_after_days));
  const [esc, setEsc] = useState(String(initial.escalate_after_days));
  const n = Math.round(Number(nudge)); const e = Math.round(Number(esc));
  const daysOk = Number.isFinite(n) && Number.isFinite(e) && n >= 1 && n <= 14 && e >= 2 && e <= 30 && e > n;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = useAction(async () => {
    unwrap(await requireBrowserClient().from('automation_settings')
      .upsert({ org_id: orgId, ...s, nudge_after_days: n, escalate_after_days: e }).select('org_id'));
    return true;
  }, { success: t('auto.saved') });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-md text-on-surface-variant">{t('auto.sub')}</p>
      {!canEdit && <p className="flex items-center gap-2 text-body-sm text-on-surface-variant"><Icon name="lock" />{t('auto.managers_only')}</p>}
      <form className="flex flex-col gap-5" onSubmit={async (ev) => { ev.preventDefault(); if ((await save.run()) !== undefined) router.refresh(); }}>
        <Switch checked={s.onboarding} onChange={(v) => set('onboarding', v)} disabled={!canEdit} label={t('auto.onb_t')} description={t('auto.onb_d')} />
        <div className="flex flex-col gap-1">
          <Switch checked={s.invoice_reminders} onChange={(v) => set('invoice_reminders', v)} disabled={!canEdit} label={t('auto.inv_t')} description={t('auto.inv_d')} />
          {!s.invoice_reminders && <p className="text-body-sm text-on-surface-variant">{t('auto.inv_off_note')}</p>}
        </div>
        <div className="flex flex-col gap-3">
          <Switch checked={s.overdue_nudges} onChange={(v) => set('overdue_nudges', v)} disabled={!canEdit} label={t('auto.over_t')} description={t('auto.over_d')} />
          {s.overdue_nudges && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('auto.nudge_days')} type="number" min={1} max={14} value={nudge} disabled={!canEdit} onChange={(x) => setNudge(x.target.value)} />
              <Input label={t('auto.esc_days')} type="number" min={2} max={30} value={esc} disabled={!canEdit} onChange={(x) => setEsc(x.target.value)}
                error={daysOk ? undefined : t('auto.bad_days')} />
            </div>
          )}
        </div>
        <Switch checked={s.leave_handover} onChange={(v) => set('leave_handover', v)} disabled={!canEdit} label={t('auto.ho_t')} description={t('auto.ho_d')} />
        {canEdit && <div><Button type="submit" icon="bolt" loading={save.pending} disabled={!daysOk}>{t('auto.save')}</Button></div>}
      </form>

      {activity && (
        <div>
          <h3 className="mb-2 text-label-md">{t('auto.recent')}</h3>
          {activity.length === 0 ? <p className="text-body-sm text-on-surface-variant">{t('auto.none')}</p> : (
            <ul className="divide-y divide-outline-variant" data-testid="automation-activity">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                  <span>{t(`auto.k.${a.kind}` as MessageKey)}{a.kind === 'invoice_reminder' && /^(before3|due|after3|after7)$/.test(a.step) ? ` · ${t(`auto.step.${a.step}` as MessageKey)}` : ''}</span>
                  <TimeAgo date={a.created_at} className="shrink-0 text-on-surface-variant" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
