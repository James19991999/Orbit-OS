'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Switch, InlineError, EmptyState, Icon, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, errorMessage } from '@/hooks/useAction';
import { relativeTime } from '@/lib/format';
import type { ReportSchedule } from '@/lib/types';

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
export function describeSchedule(s: Pick<ReportSchedule, 'cadence' | 'weekday' | 'month_day' | 'hour_utc' | 'destination'>) {
  const when = s.cadence === 'weekly' ? `${DAYS[s.weekday ?? 1]}` : `Day ${s.month_day ?? 1} of each month`;
  return `${when} at ${String(s.hour_utc).padStart(2, '0')}:00 UTC · ${s.destination === 'slack' ? 'Slack' : 'Email + PDF'}`;
}

export function DigestSchedules({ orgId, items, canManage, defaultEmail, allowed }: { orgId: string; items: ReportSchedule[]; canManage: boolean; defaultEmail: string; allowed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [f, setF] = useState({ name: 'Executive digest', cadence: 'weekly', weekday: '1', month_day: '1', hour: '7', destination: 'email', recipients: defaultEmail });
  const [err, setErr] = useState<string | null>(null);
  const create = useAction(async () => unwrap(await requireBrowserClient().from('report_schedules').insert({
    org_id: orgId, name: f.name.trim(), cadence: f.cadence, weekday: f.cadence === 'weekly' ? Number(f.weekday) : null, month_day: f.cadence === 'monthly' ? Number(f.month_day) : null,
    hour_utc: Number(f.hour), destination: f.destination, recipients: f.destination === 'email' ? f.recipients.split(/[,\s]+/).filter(Boolean) : [], enabled: true,
  }).select('id')), { success: 'Digest scheduled' });
  async function toggle(s: ReportSchedule, enabled: boolean) {
    const { error } = await requireBrowserClient().from('report_schedules').update({ enabled }).eq('id', s.id);
    if (error) toast(errorMessage(error), 'error'); else router.refresh();
  }
  async function remove(s: ReportSchedule) {
    const { error } = await requireBrowserClient().from('report_schedules').delete().eq('id', s.id);
    if (error) toast(errorMessage(error), 'error'); else { toast('Schedule deleted'); router.refresh(); }
  }
  async function run(s: ReportSchedule) {
    setRunning(s.id);
    try {
      const res = await fetch(`/api/reports/schedules/${s.id}/run`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      toast(d.status || d.error || (res.ok ? 'Sent' : 'Failed'), res.ok ? 'success' : 'error');
      router.refresh();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setRunning(null); }
  }
  if (!allowed) return <p className="text-body-sm text-on-surface-variant">Scheduled digests are included on Pro and Enterprise.</p>;
  return (
    <div>
      {items.length === 0 ? <EmptyState icon="schedule_send" title="No digests scheduled" /> : (
        <ul className="divide-y divide-outline-variant">
          {items.map((s) => (
            <li key={s.id} className="py-3">
              <Switch label={s.name} description={describeSchedule(s)} checked={s.enabled} onChange={(v) => toggle(s, v)} disabled={!canManage} />
              <p className="mt-1 text-body-sm text-on-surface-variant">{s.last_run_at ? `Last dispatch ${relativeTime(s.last_run_at)}${s.last_status ? ` · ${s.last_status}` : ''}` : 'Not sent yet'}</p>
              {canManage && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" icon="refresh" loading={running === s.id} onClick={() => run(s)}>Run test dispatch</Button>
                  <Button size="sm" variant="ghost" icon="delete" onClick={() => remove(s)}>Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && <Button className="mt-3" size="sm" variant="ghost" icon="add" onClick={() => setOpen(true)}>New digest</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Schedule a digest"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={async () => {
          if (!f.name.trim()) return setErr('Name the digest.');
          if (f.destination === 'email' && !f.recipients.split(/[,\s]+/).filter(Boolean).every((e) => /^\S+@\S+\.\S+$/.test(e))) return setErr('Enter valid recipient emails.');
          setErr(null);
          if (await create.run()) { setOpen(false); router.refresh(); }
        }}>Save</Button></>}>
        <div className="grid gap-4">
          <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Cadence" value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
            {f.cadence === 'weekly'
              ? <Select label="Day" value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
              : <Input label="Day of month" type="number" min={1} max={28} value={f.month_day} onChange={(e) => setF({ ...f, month_day: e.target.value })} />}
          </div>
          <Select label="Time (UTC)" value={f.hour} onChange={(e) => setF({ ...f, hour: e.target.value })} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00 UTC` }))} />
          <Select label="Destination" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} options={[{ value: 'email', label: 'Email with PDF' }, { value: 'slack', label: 'Slack channel' }]} />
          {f.destination === 'email' && <Input label="Recipients" hint="Comma-separated emails" value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} />}
          <InlineError message={err ?? create.error} />
        </div>
      </Dialog>
      <p className="mt-3 flex items-center gap-1.5 text-body-sm text-on-surface-variant"><Icon name="info" className="text-[16px]" />Digests run from an hourly scheduled job (Vercel Cron).</p>
    </div>
  );
}
