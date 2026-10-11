'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Button, Dialog, Input, Select, Textarea, InlineError, Banner, Checkbox } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { isWithinWorkingHours, type MemberWindow } from '@/lib/scheduling/time';
import { jitsiUrl } from '@/lib/ics';
import { useBusy } from '@/hooks/useBusy';
import { useT } from '@/i18n/client';

export function MeetingDialog({ open, onClose, orgId, orgSlug, userId, viewerTz, members, preset }:
  { open: boolean; onClose: () => void; orgId: string; orgSlug: string; userId: string; viewerTz: string; members: MemberWindow[];
    preset?: { start?: number; participantIds?: string[]; title?: string; durationMin?: number } }) {
  const t = useT();
  const router = useRouter();
  const nextHour = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
  const init = () => ({
    title: preset?.title ?? '', description: '', when: formatInTimeZone(preset?.start ?? nextHour, viewerTz, "yyyy-MM-dd'T'HH:mm"),
    duration: String(preset?.durationMin ?? 30), mode: 'sync', loom: '', ids: new Set(preset?.participantIds ?? [userId]),
  });
  const [f, setF] = useState(init);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(init()); setErr(null); setResult(null); } }, [open]);

  const startMs = useMemo(() => { try { return fromZonedTime(f.when, viewerTz).getTime(); } catch { return NaN; } }, [f.when, viewerTz]);
  const outside = useMemo(() => Number.isFinite(startMs)
    ? members.filter((m) => f.ids.has(m.userId) && !isWithinWorkingHours(m, startMs, startMs + Number(f.duration) * 60_000)) : [], [members, f.ids, startMs, f.duration]);
  const { busy } = useBusy(open ? [...f.ids] : []);
  const busyNow = useMemo(() => Number.isFinite(startMs)
    ? members.filter((m) => f.ids.has(m.userId) && m.userId !== userId && (busy[m.userId] ?? []).some((b) => b.start < startMs + Number(f.duration) * 60_000 && b.end > startMs)) : [],
  [members, f.ids, startMs, f.duration, busy, userId]);

  const save = useAction(async () => {
    const sb = requireBrowserClient();
    const id = crypto.randomUUID();
    unwrap(await sb.from('meetings').insert({
      id, org_id: orgId, title: f.title.trim(), description: f.description.trim() || null, starts_at: new Date(startMs).toISOString(),
      duration_min: Number(f.duration), organizer_id: userId, mode: f.mode, loom_url: f.loom.trim() || null, video_url: jitsiUrl(orgSlug, id),
    }).select('id').single());
    const ids = new Set(f.ids); ids.add(userId);
    unwrap(await sb.from('meeting_participants').insert([...ids].map((u) => ({ meeting_id: id, org_id: orgId, user_id: u, rsvp: u === userId ? 'yes' : 'pending' }))).select('user_id'));
    const inv = await postJson<{ emailed: number; calendarSynced?: number; notConfigured: boolean; failed?: boolean }>(`/api/meetings/${id}/invite`).catch(() => ({ emailed: 0, calendarSynced: 0, notConfigured: false, failed: true }));
    return { id, inv };
  }, { success: t('mtg.scheduled_toast') });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setErr(t('mtg.err_title'));
    if (!Number.isFinite(startMs)) return setErr(t('mtg.err_time'));
    if (startMs < Date.now() - 5 * 60_000) return setErr(t('mtg.err_past'));
    setErr(null);
    const r = await save.run();
    if (r) {
      const parts: string[] = [];
      if (r.inv.calendarSynced) parts.push(t('mtg.res.calendars', { count: r.inv.calendarSynced, n: r.inv.calendarSynced }));
      if (r.inv.emailed) parts.push(t('mtg.res.emailed', { count: r.inv.emailed, n: r.inv.emailed }));
      else if (r.inv.notConfigured) parts.push(t('mtg.res.no_email'));
      else if ('failed' in r.inv && r.inv.failed) parts.push(t('mtg.res.failed'));
      setResult(parts.join(' ') || t('mtg.res.saved'));
      router.refresh();
    }
  }
  const toggle = (id: string) => setF((x) => { const s = new Set(x.ids); if (s.has(id)) s.delete(id); else s.add(id); return { ...x, ids: s }; });

  return (
    <Dialog open={open} onClose={onClose} title={t('mtg.title_new')} wide
      footer={result ? <Button onClick={onClose}>{t('common.done')}</Button> : <><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="mtg-form" loading={save.pending}>{t('mtg.schedule')}</Button></>}>
      {result ? <Banner tone="info">{result}</Banner> : (
        <form id="mtg-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
          <Input className="md:col-span-2" label={t('mtg.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input label={t('mtg.starts', { tz: viewerTz.replace(/_/g, ' ') })} type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
          <Select label={t('mtg.duration')} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} options={[15, 25, 30, 45, 60, 90].map((m) => ({ value: String(m), label: t('slot.min', { n: m }) }))} />
          <Select label={t('mtg.format')} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={[{ value: 'sync', label: t('mtg.format.sync') }, { value: 'async_first', label: t('mtg.format.async') }]} />
          <Input label={t('mtg.loom')} type="url" value={f.loom} onChange={(e) => setF({ ...f, loom: e.target.value })} />
          <Textarea className="md:col-span-2" label={t('mtg.agenda')} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-label-sm text-on-surface-variant">{t('mtg.participants')}</legend>
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded border border-outline-variant p-3 sm:grid-cols-2">
              {members.map((m) => (
                <Checkbox key={m.userId} checked={f.ids.has(m.userId) || m.userId === userId} disabled={m.userId === userId} onChange={() => toggle(m.userId)}
                  label={m.name ?? 'Member'} description={Number.isFinite(startMs) ? t('mtg.local', { time: formatInTimeZone(startMs, m.timezone, 'EEE HH:mm'), place: m.city ?? m.timezone }) : m.timezone} />
              ))}
            </div>
          </fieldset>
          {outside.length > 0 && (
            <div className="md:col-span-2">
              <Banner tone="warning">{t('mtg.warn_outside', { names: outside.map((o) => o.name).join(', ') })}</Banner>
            </div>
          )}
          {busyNow.length > 0 && (
            <div className="md:col-span-2"><Banner tone="warning" icon="calendar_month">{t('mtg.warn_busy', { names: busyNow.map((o) => o.name).join(', ') })}</Banner></div>
          )}
          <div className="md:col-span-2"><InlineError message={err ?? save.error} /></div>
        </form>
      )}
    </Dialog>
  );
}
