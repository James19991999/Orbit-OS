'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Button, Dialog, Input, Select, Textarea, InlineError, Banner, Checkbox } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { isWithinWorkingHours, type MemberWindow } from '@/lib/scheduling/time';
import { jitsiUrl } from '@/lib/ics';

export function MeetingDialog({ open, onClose, orgId, orgSlug, userId, viewerTz, members, preset }:
  { open: boolean; onClose: () => void; orgId: string; orgSlug: string; userId: string; viewerTz: string; members: MemberWindow[];
    preset?: { start?: number; participantIds?: string[]; title?: string; durationMin?: number } }) {
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

  const save = useAction(async () => {
    const sb = requireBrowserClient();
    const id = crypto.randomUUID();
    unwrap(await sb.from('meetings').insert({
      id, org_id: orgId, title: f.title.trim(), description: f.description.trim() || null, starts_at: new Date(startMs).toISOString(),
      duration_min: Number(f.duration), organizer_id: userId, mode: f.mode, loom_url: f.loom.trim() || null, video_url: jitsiUrl(orgSlug, id),
    }).select('id').single());
    const ids = new Set(f.ids); ids.add(userId);
    unwrap(await sb.from('meeting_participants').insert([...ids].map((u) => ({ meeting_id: id, org_id: orgId, user_id: u, rsvp: u === userId ? 'yes' : 'pending' }))).select('user_id'));
    const inv = await postJson<{ emailed: number; notConfigured: boolean }>(`/api/meetings/${id}/invite`).catch(() => ({ emailed: 0, notConfigured: false, failed: true }));
    return { id, inv };
  }, { success: 'Meeting scheduled' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setErr('Give the meeting a title.');
    if (!Number.isFinite(startMs)) return setErr('Pick a valid date and time.');
    if (startMs < Date.now() - 5 * 60_000) return setErr('Pick a time in the future.');
    setErr(null);
    const r = await save.run();
    if (r) {
      setResult(r.inv.emailed ? `Calendar invites (.ics) emailed to ${r.inv.emailed} participant${r.inv.emailed === 1 ? '' : 's'}.`
        : r.inv.notConfigured ? 'Meeting saved. Email isn’t configured, so participants will see it in OrbitOS and can download the .ics.' : 'Meeting saved, but invite emails could not be sent.');
      router.refresh();
    }
  }
  const toggle = (id: string) => setF((x) => { const s = new Set(x.ids); if (s.has(id)) s.delete(id); else s.add(id); return { ...x, ids: s }; });

  return (
    <Dialog open={open} onClose={onClose} title="Schedule a meeting" wide
      footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="mtg-form" loading={save.pending}>Schedule</Button></>}>
      {result ? <Banner tone="info">{result}</Banner> : (
        <form id="mtg-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
          <Input className="md:col-span-2" label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input label={`Starts (${viewerTz.replace(/_/g, ' ')})`} type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
          <Select label="Duration" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} options={[15, 25, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }))} />
          <Select label="Format" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} options={[{ value: 'sync', label: 'Live sync (video)' }, { value: 'async_first', label: 'Async-first (Loom backup)' }]} />
          <Input label="Loom / recording link (optional)" type="url" value={f.loom} onChange={(e) => setF({ ...f, loom: e.target.value })} />
          <Textarea className="md:col-span-2" label="Agenda" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-label-sm text-on-surface-variant">Participants</legend>
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded border border-outline-variant p-3 sm:grid-cols-2">
              {members.map((m) => (
                <Checkbox key={m.userId} checked={f.ids.has(m.userId) || m.userId === userId} disabled={m.userId === userId} onChange={() => toggle(m.userId)}
                  label={m.name ?? 'Member'} description={Number.isFinite(startMs) ? `${formatInTimeZone(startMs, m.timezone, 'EEE HH:mm')} local · ${m.city ?? m.timezone}` : m.timezone} />
              ))}
            </div>
          </fieldset>
          {outside.length > 0 && (
            <div className="md:col-span-2">
              <Banner tone="warning">Outside working hours for {outside.map((o) => o.name).join(', ')}. Consider a suggested slot or async-first.</Banner>
            </div>
          )}
          <div className="md:col-span-2"><InlineError message={err ?? save.error} /></div>
        </form>
      )}
    </Dialog>
  );
}
