'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Switch, InlineError, EmptyState, Icon, useToast, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, errorMessage } from '@/hooks/useAction';

import type { ReportSchedule } from '@/lib/types';
import { useT, useLang } from '@/i18n/client';
import type { T } from '@/i18n/shared';
import { weekdayNames, type UiLang } from '@/lib/locale/conventions';

export function describeSchedule(s: Pick<ReportSchedule, 'cadence' | 'weekday' | 'month_day' | 'hour_utc' | 'destination'>, t: T, lang: UiLang = 'en') {
  const when = s.cadence === 'weekly' ? t('dig.weekly_on', { day: weekdayNames(lang)[s.weekday ?? 1] }) : t('dig.monthly_on', { n: s.month_day ?? 1 });
  return t('dig.at', { when, time: `${String(s.hour_utc).padStart(2, '0')}:00`, dest: s.destination === 'slack' ? t('dig.slack') : t('dig.email_pdf') });
}

export function DigestSchedules({ orgId, items, canManage, defaultEmail, allowed }: { orgId: string; items: ReportSchedule[]; canManage: boolean; defaultEmail: string; allowed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const lang = useLang();
  const days = weekdayNames(lang);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [f, setF] = useState({ name: t('dig.default_name'), cadence: 'weekly', weekday: '1', month_day: '1', hour: '7', destination: 'email', recipients: defaultEmail });
  const [err, setErr] = useState<string | null>(null);
  const create = useAction(async () => unwrap(await requireBrowserClient().from('report_schedules').insert({
    org_id: orgId, name: f.name.trim(), cadence: f.cadence, weekday: f.cadence === 'weekly' ? Number(f.weekday) : null, month_day: f.cadence === 'monthly' ? Number(f.month_day) : null,
    hour_utc: Number(f.hour), destination: f.destination, recipients: f.destination === 'email' ? f.recipients.split(/[,\s]+/).filter(Boolean) : [], enabled: true,
  }).select('id')), { success: t('dig.scheduled') });
  async function toggle(s: ReportSchedule, enabled: boolean) {
    const { error } = await requireBrowserClient().from('report_schedules').update({ enabled }).eq('id', s.id);
    if (error) toast(errorMessage(error), 'error'); else router.refresh();
  }
  async function remove(s: ReportSchedule) {
    const { error } = await requireBrowserClient().from('report_schedules').delete().eq('id', s.id);
    if (error) toast(errorMessage(error), 'error'); else { toast(t('dig.deleted')); router.refresh(); }
  }
  async function run(s: ReportSchedule) {
    setRunning(s.id);
    try {
      const res = await fetch(`/api/reports/schedules/${s.id}/run`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      toast(d.status || d.error || (res.ok ? t('dig.sent') : t('dig.failed')), res.ok ? 'success' : 'error');
      router.refresh();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setRunning(null); }
  }
  if (!allowed) return <p className="text-body-sm text-on-surface-variant">{t('dig.plan')}</p>;
  return (
    <div>
      {items.length === 0 ? <EmptyState icon="schedule_send" title={t('dig.none')} /> : (
        <ul className="divide-y divide-outline-variant">
          {items.map((s) => (
            <li key={s.id} className="py-3">
              <Switch label={s.name} description={describeSchedule(s, t, lang)} checked={s.enabled} onChange={(v) => toggle(s, v)} disabled={!canManage} />
              <p className="mt-1 text-body-sm text-on-surface-variant">{s.last_run_at ? <>{t('dig.last')} <TimeAgo date={s.last_run_at} />{s.last_status ? ` · ${s.last_status}` : ''}</> : t('dig.not_sent')}</p>
              {canManage && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" icon="refresh" loading={running === s.id} onClick={() => run(s)}>{t('dig.send_now')}</Button>
                  <Button size="sm" variant="ghost" icon="delete" onClick={() => remove(s)}>{t('dig.delete')}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && <Button className="mt-3" size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>{t('dig.new')}</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('dig.title')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('rep.cancel')}</Button><Button loading={create.pending} onClick={async () => {
          if (!f.name.trim()) return setErr(t('dig.need_name'));
          if (f.destination === 'email' && !f.recipients.split(/[,\s]+/).filter(Boolean).every((e) => /^\S+@\S+\.\S+$/.test(e))) return setErr(t('dig.need_emails'));
          setErr(null);
          if (await create.run()) { setOpen(false); router.refresh(); }
        }}>{t('dig.save')}</Button></>}>
        <div className="grid gap-4">
          <Input label={t('dig.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('dig.cadence')} value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })} options={[{ value: 'weekly', label: t('dig.weekly') }, { value: 'monthly', label: t('dig.monthly') }]} />
            {f.cadence === 'weekly'
              ? <Select label={t('dig.day')} value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })} options={days.map((d, i) => ({ value: String(i), label: d }))} />
              : <Input label={t('dig.month_day')} type="number" min={1} max={28} value={f.month_day} onChange={(e) => setF({ ...f, month_day: e.target.value })} />}
          </div>
          <Select label={t('dig.time')} value={f.hour} onChange={(e) => setF({ ...f, hour: e.target.value })} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00 UTC` }))} />
          <Select label={t('dig.dest')} value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} options={[{ value: 'email', label: t('dig.dest_email') }, { value: 'slack', label: t('dig.dest_slack') }]} />
          {f.destination === 'email' && <Input label={t('dig.recipients')} hint={t('dig.recipients_hint')} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} />}
          <InlineError message={err ?? create.error} />
        </div>
      </Dialog>
      <p className="mt-3 flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="info" className="text-[16px]" />{t('dig.note')}</p>
    </div>
  );
}
