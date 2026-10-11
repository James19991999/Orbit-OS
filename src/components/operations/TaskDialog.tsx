'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, Select, Textarea, InlineError } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import type { Task, Sprint, TaskStatus, Priority } from '@/lib/types';

import { STATUS_LABEL, PRIORITY_LABEL } from '@/lib/tasks';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';

export interface PersonOption { id: string; name: string }

export function TaskDialog({ open, onClose, orgId, userId, people, sprints, task, defaultSprintId, onSaved }:
  { open: boolean; onClose: () => void; orgId: string; userId: string; people: PersonOption[]; sprints: Pick<Sprint, 'id' | 'name'>[];
    task?: Task | null; defaultSprintId?: string | null; onSaved?: (t: Task) => void }) {
  const tr = useT();
  const router = useRouter();
  const blank = { title: '', description: '', assignee_id: userId, sprint_id: defaultSprintId ?? '', priority: 'medium' as Priority, status: 'todo' as TaskStatus, points: '3', due_on: '', tags: '', blocked_reason: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(task ? {
      title: task.title, description: task.description ?? '', assignee_id: task.assignee_id ?? '', sprint_id: task.sprint_id ?? '',
      priority: task.priority, status: task.status, points: String(task.points), due_on: task.due_on ?? '', tags: task.tags.join(', '), blocked_reason: task.blocked_reason ?? '',
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const save = useAction(async () => {
    const payload = {
      title: f.title.trim(), description: f.description.trim() || null, assignee_id: f.assignee_id || null, sprint_id: f.sprint_id || null,
      priority: f.priority, status: f.status, points: Number(f.points) || 0, due_on: f.due_on || null,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10), blocked_reason: f.status === 'blocked' ? f.blocked_reason.trim() || null : null,
    };
    const sb = requireBrowserClient();
    const row = task
      ? unwrap(await sb.from('tasks').update(payload).eq('id', task.id).select().single())
      : unwrap(await sb.from('tasks').insert({ ...payload, org_id: orgId, created_by: userId }).select().single());
    return row as Task;
  }, { success: task ? tr('task.updated') : tr('task.created') });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setErr(tr('task.err_title'));
    if (f.status === 'blocked' && !f.blocked_reason.trim()) return setErr(tr('task.err_blocked'));
    const p = Number(f.points);
    if (!Number.isInteger(p) || p < 0 || p > 100) return setErr(tr('task.err_points'));
    setErr(null);
    const t = await save.run();
    if (t) { onSaved?.(t); onClose(); router.refresh(); }
  }

  return (
    <Dialog open={open} onClose={onClose} title={task ? tr('task.edit') : tr('task.new')} wide
      footer={<><Button variant="ghost" onClick={onClose}>{tr('common.cancel')}</Button><Button type="submit" form="task-form" loading={save.pending}>{task ? tr('task.save') : tr('task.new')}</Button></>}>
      <form id="task-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        <Input className="md:col-span-2" label={tr('task.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} required />
        <Textarea className="md:col-span-2" label={tr('task.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Select label={tr('task.assignee')} value={f.assignee_id} onChange={(e) => setF({ ...f, assignee_id: e.target.value })}
          options={[{ value: '', label: tr('task.unassigned') }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        <Select label={tr('task.sprint')} value={f.sprint_id} onChange={(e) => setF({ ...f, sprint_id: e.target.value })}
          options={[{ value: '', label: tr('task.backlog') }, ...sprints.map((s) => ({ value: s.id, label: s.name }))]} />
        <Select label={tr('task.status')} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TaskStatus })}
          options={Object.keys(STATUS_LABEL).map((value) => ({ value, label: tr(`task.st.${value}` as MessageKey) }))} />
        <Select label={tr('task.priority')} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}
          options={Object.keys(PRIORITY_LABEL).map((value) => ({ value, label: tr(`task.pr.${value}` as MessageKey) }))} />
        <Input label={tr('task.points')} type="number" min={0} max={100} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
        <Input label={tr('task.due_date')} type="date" value={f.due_on} onChange={(e) => setF({ ...f, due_on: e.target.value })} />
        <Input className="md:col-span-2" label={tr('task.tags')} hint={tr('task.tags_hint')} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        {f.status === 'blocked' && <Input className="md:col-span-2" label={tr('task.blocking')} value={f.blocked_reason} onChange={(e) => setF({ ...f, blocked_reason: e.target.value })} />}
        <div className="md:col-span-2"><InlineError message={err ?? save.error} /></div>
      </form>
    </Dialog>
  );
}
