'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Dialog, Textarea, InlineError, ProgressBar } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import type { CheckIn } from '@/lib/types';

const MOODS = [{ v: 1, e: '😫', l: 'Rough' }, { v: 2, e: '😕', l: 'Meh' }, { v: 3, e: '😐', l: 'Okay' }, { v: 4, e: '🙂', l: 'Good' }, { v: 5, e: '🤩', l: 'Great' }];

export function RollCall({ orgId, userId, completed, total, mine, canWrite, today }:
  { orgId: string; userId: string; completed: number; total: number; mine: CheckIn | null; canWrite: boolean; today: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ shipped: mine?.shipped ?? '', blockers: mine?.blockers ?? '', mood: mine?.mood ?? 4 });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (sp.get('tab') === 'roll-call' && canWrite && !mine) setOpen(true); }, [sp, canWrite, mine]);
  const save = useAction(async () => unwrap(await requireBrowserClient().from('check_ins')
    .upsert({ org_id: orgId, user_id: userId, for_date: today, shipped: f.shipped.trim(), blockers: f.blockers.trim() || null, mood: f.mood }, { onConflict: 'org_id,user_id,for_date' })
    .select('id')), { success: 'Check-in saved' });
  const pct = total ? Math.round((completed / total) * 100) : 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.shipped.trim()) return setErr('Share at least one thing you shipped or moved forward.');
    setErr(null);
    if (await save.run()) { setOpen(false); router.refresh(); }
  }
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-headline-md tnum">{pct}% <span className="text-body-sm text-on-surface-variant">completed today</span></p>
        <span className="text-body-sm text-on-surface-variant tnum">{completed}/{total}</span>
      </div>
      <div className="mt-2"><ProgressBar value={completed} max={total} label="Check-in completion" tone="healthy" /></div>
      <p className="mt-2 text-body-sm text-on-surface-variant">What did you ship today? Keep your distributed node in sync.</p>
      {canWrite && <Button className="mt-3" icon={mine ? 'edit' : 'edit_note'} variant={mine ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>{mine ? 'Edit my check-in' : 'Check in'}</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Async check-in"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="ci-form" loading={save.pending}>Save check-in</Button></>}>
        <form id="ci-form" onSubmit={submit} className="grid gap-4" noValidate>
          <Textarea label="What did you ship today?" value={f.shipped} onChange={(e) => setF({ ...f, shipped: e.target.value })} maxLength={2000} />
          <Textarea label="Anything blocking you? (optional)" rows={2} value={f.blockers} onChange={(e) => setF({ ...f, blockers: e.target.value })} />
          <fieldset>
            <legend className="mb-2 text-label-sm text-on-surface-variant">How are you feeling?</legend>
            <div className="flex gap-2" role="radiogroup">
              {MOODS.map((m) => (
                <button key={m.v} type="button" role="radio" aria-checked={f.mood === m.v} aria-label={m.l} onClick={() => setF({ ...f, mood: m.v })}
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
