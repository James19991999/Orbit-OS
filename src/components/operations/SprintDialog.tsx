'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Textarea, InlineError } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export function SprintDialog({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  const t = useT();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const in13 = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ name: '', goal: '', starts_on: today, ends_on: in13, committed_points: '40' });
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async () => unwrap(await requireBrowserClient().from('sprints').insert({
    org_id: orgId, name: f.name.trim(), goal: f.goal.trim() || null, starts_on: f.starts_on, ends_on: f.ends_on, committed_points: Number(f.committed_points) || 0,
  }).select('id').single()), { success: t('sprint.created') });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr(t('sprint.err_name'));
    if (f.ends_on < f.starts_on) return setErr(t('sprint.err_dates'));
    setErr(null);
    if (await save.run()) { onClose(); router.refresh(); }
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('sprint.new')}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="sprint-form" loading={save.pending}>{t('sprint.create')}</Button></>}>
      <form id="sprint-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Input label={t('sprint.name')} placeholder={t('sprint.name_ph')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Textarea label={t('sprint.goal')} value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('sprint.starts')} type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
          <Input label={t('sprint.ends')} type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
        </div>
        <Input label={t('sprint.points')} type="number" min={0} value={f.committed_points} onChange={(e) => setF({ ...f, committed_points: e.target.value })} />
        <InlineError message={err ?? save.error} />
      </form>
    </Dialog>
  );
}
