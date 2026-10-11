'use client';
import { useEffect, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { Avatar, Icon, Pill, cn, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { PRIORITY_TONE, dueInfo } from '@/lib/tasks';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';
import type { Task, TaskStatus } from '@/lib/types';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done'];

/** Kanban with drag-and-drop on desktop; every card also has a status <select> so it works by keyboard and touch. */
export function TaskBoard({ initial, people, canEditAll, userId }: { initial: Task[]; people: Record<string, { name: string; avatar: string | null }>; canEditAll: boolean; userId: string }) {
  const [tasks, setTasks] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();
  const tr = useT();
  const stLabel = (s: TaskStatus) => tr(`task.st.${s}` as MessageKey);
  useEffect(() => setTasks(initial), [initial]);

  const canEdit = (t: Task) => canEditAll || t.assignee_id === userId || t.created_by === userId;

  async function move(id: string, status: TaskStatus) {
    const before = tasks;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (status === 'blocked') { toast(tr('task.blocked_info'), 'info'); return; }
    setTasks((s) => s.map((x) => (x.id === id ? { ...x, status } : x))); // optimistic
    setSavingId(id);
    try {
      const { error } = await requireBrowserClient().from('tasks').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (e) {
      setTasks(before); // roll back
      toast(tr('ops.move_failed', { error: errorMessage(e) }), 'error');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[900px] grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const list = tasks.filter((t) => t.status === col);
          return (
            <section key={col} aria-label={`${stLabel(col)} (${list.length})`}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) void move(dragId, col); setDragId(null); }}
              className={cn('flex min-h-[200px] flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-2', dragId && 'border-dashed')}>
              <h3 className="flex items-center justify-between px-1 py-1 text-label-xs uppercase text-on-surface-variant">
                {stLabel(col)}<span className="tnum">{list.length}</span>
              </h3>
              {list.map((t) => {
                const who = t.assignee_id ? people[t.assignee_id] : null;
                const due = t.status === 'done' ? null : dueInfo(t.due_on);
                return (
                  <article key={t.id} draggable={canEdit(t)} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                    className={cn('rounded border border-outline-variant bg-surface-container p-3 shadow-l1', savingId === t.id && 'opacity-60', canEdit(t) && 'cursor-grab')}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/operations/tasks/${t.id}`} className="text-label-md text-on-surface hover:underline">{t.title}</Link>
                      <Pill tone={PRIORITY_TONE[t.priority]}>{tr(`task.pr.${t.priority}` as MessageKey)}</Pill>
                    </div>
                    {t.status === 'blocked' && t.blocked_reason && <p className="mt-1 flex items-start gap-1 text-body-sm text-alert"><Icon name="error" className="text-[14px]" />{t.blocked_reason}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2 text-body-sm text-on-surface-variant">
                      <span className="flex items-center gap-1.5">{who && <Avatar name={who.name} src={who.avatar} size={20} />}<span className="tnum">{tr('task.pts', { count: t.points })}</span></span>
                      {due && <span className={cn('tnum', due.key === 'task.due.overdue' && 'text-alert')}>{tr(due.key, { n: due.n })}</span>}
                    </div>
                    {canEdit(t) && (
                      <label className="mt-2 block">
                        <span className="sr-only">{tr('task.move_to', { title: t.title })}</span>
                        <select value={t.status} onChange={(e) => move(t.id, e.target.value as TaskStatus)} disabled={savingId === t.id}
                          className="h-8 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm text-on-surface">
                          {COLUMNS.map((c) => <option key={c} value={c}>{stLabel(c)}</option>)}
                        </select>
                      </label>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
