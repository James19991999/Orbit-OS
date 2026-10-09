'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Dialog, Textarea, InlineError, ProgressBar } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { useToast } from '@/components/ui';
import { queueCheckin, isOfflineError } from '@/lib/offline/queue';
import type { CheckIn } from '@/lib/types';
import { useT } from '@/i18n/client';

const MOODS = [{ v: 1, e: '😫' }, { v: 2, e: '😕' }, { v: 3, e: '😐' }, { v: 4, e: '🙂' }, { v: 5, e: '🤩' }] as const;

export function RollCall({ orgId, userId, completed, total, mine, canWrite, today }:
  { orgId: string; userId: string; completed: number; total: number; mine: CheckIn | null; canWrite: boolean; today: string }) {
  const router = useRouter();
  const t = useT();
  const { toast } = useToast();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ shipped: mine?.shipped ?? '', blockers: mine?.blockers ?? '', mood: mine?.mood ?? 4 });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (sp.get('tab') === 'roll-call' && canWrite && !mine) setOpen(true); }, [sp, canWrite, mine]);
  const row = () => ({ org_id: orgId, user_id: userId, for_date: today, shipped: f.shipped.trim(), blockers: f.blockers.trim() || null, mood: f.mood });
  // Offline, or the request never reached the server: keep it on this device and send it on reconnect.
  const save = useAction(async (): Promise<'saved' | 'queued'> => {
    const r = row();
    if (typeof navigator !== 'undefined' && navigator.onLine === false && queueCheckin(r)) return 'queued';
    try {
      unwrap(await requireBrowserClient().from('check_ins').upsert(r, { onConflict: 'org_id,user_id,for_date' }).select('id'));
      return 'saved';
    } catch (e) {
      if (isOfflineError(e) && queueCheckin(r)) return 'queued';
      throw e;
    }
  });
  const pct = total ? Math.round((completed / total) * 100) : 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.shipped.trim()) return setErr(t('checkin.need_shipped'));
    setErr(null);
    const r = await save.run();
    if (r === 'queued') {
      setOpen(false);
      window.dispatchEvent(new Event('orbit:queued'));
      toast(t('checkin.saved_offline'));
    } else if (r === 'saved') {
      toast(t('checkin.saved'), 'success');
      setOpen(false);
      router.refresh();
    }
  }
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-headline-md tnum">{pct}% <span className="text-body-sm text-on-surface-variant">{t('checkin.completed_today')}</span></p>
        <span className="text-body-sm text-on-surface-variant tnum">{completed}/{total}</span>
      </div>
      <div className="mt-2"><ProgressBar value={completed} max={total} label={t('checkin.progress')} tone="healthy" /></div>
      <p className="mt-2 text-body-sm text-on-surface-variant">{t('checkin.prompt')}</p>
      {canWrite && <Button className="mt-3" icon={mine ? 'edit' : 'edit_note'} variant={mine ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>{mine ? t('checkin.edit') : t('checkin.cta')}</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('checkin.title')}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('checkin.cancel')}</Button><Button type="submit" form="ci-form" loading={save.pending}>{t('checkin.save')}</Button></>}>
        <form id="ci-form" onSubmit={submit} className="grid gap-4" noValidate>
          <Textarea label={t('checkin.shipped')} value={f.shipped} onChange={(e) => setF({ ...f, shipped: e.target.value })} maxLength={2000} />
          <Textarea label={t('checkin.blockers')} rows={2} value={f.blockers} onChange={(e) => setF({ ...f, blockers: e.target.value })} />
          <fieldset>
            <legend className="mb-2 text-label-sm text-on-surface-variant">{t('checkin.feeling')}</legend>
            <div className="flex gap-2" role="radiogroup">
              {MOODS.map((m) => (
                <button key={m.v} type="button" role="radio" aria-checked={f.mood === m.v} aria-label={t(`checkin.mood.${m.v}`)} onClick={() => setF({ ...f, mood: m.v })}
                  className={`flex h-12 flex-1 flex-col items-center justify-center rounded border text-[20px] ${f.mood === m.v ? 'border-primary-container bg-primary-container/15' : 'border-outline-variant'}`}>
                  <span aria-hidden>{m.e}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <InlineError message={err ?? save.error} />
        </form>
      </Dialog>
    </div>
  );
}
