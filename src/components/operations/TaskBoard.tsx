'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar, Icon, Pill, cn, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { STATUS_LABEL, PRIORITY_TONE, dueLabel } from '@/lib/tasks';
import type { Task, TaskStatus } from '@/lib/types';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done'];

/** Kanban with drag-and-drop on desktop; every card also has a status <select> so it works by keyboard and touch. */
export function TaskBoard({ initial, people, canEditAll, userId }: { initial: Task[]; people: Record<string, { name: string; avatar: string | null }>; canEditAll: boolean; userId: string }) {
  const [tasks, setTasks] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();
  useEffect(() => setTasks(initial), [initial]);

  const canEdit = (t: Task) => canEditAll || t.assignee_id === userId || t.created_by === userId;

  async function move(id: string, status: TaskStatus) {
    const before = tasks;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (status === 'blocked') { toast('Open the task to add what is blocking it.', 'info'); return; }
    setTasks((s) => s.map((x) => (x.id === id ? { ...x, status } : x))); // optimistic
    setSavingId(id);
    try {
      const { error } = await requireBrowserClient().from('tasks').update({ status }).eq('id', id);
      if (error) throw error;
    } catch (e) {
      setTasks(before); // roll back
      toast(`Couldn't move task: ${errorMessage(e)}`, 'error');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[900px] grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const list = tasks.filter((t) => t.status === col);
          return (
            <section key={col} aria-label={`${STATUS_LABEL[col]} (${list.length})`}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) void move(dragId, col); setDragId(null); }}
              className={cn('flex min-h-[200px] flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-2', dragId && 'border-dashed')}>
              <h3 className="flex items-center justify-between px-1 py-1 text-label-xs uppercase text-on-surface-variant">
                {STATUS_LABEL[col]}<span className="tnum">{list.length}</span>
              </h3>
              {list.map((t) => {
                const who = t.assignee_id ? people[t.assignee_id] : null;
                const due = t.status === 'done' ? null : dueLabel(t.due_on);
                return (
                  <article key={t.id} draggable={canEdit(t)} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                    className={cn('rounded border border-outline-variant bg-surface-container p-3 shadow-l1', savingId === t.id && 'opacity-60', canEdit(t) && 'cursor-grab')}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/operations/tasks/${t.id}`} className="text-label-md text-on-surface hover:underline">{t.title}</Link>
                      <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                    </div>
                    {t.status === 'blocked' && t.blocked_reason && <p className="mt-1 flex items-start gap-1 text-body-sm text-alert"><Icon name="error" className="text-[14px]" />{t.blocked_reason}</p>}
                    <div className="mt-2 flex items-center justify-between gap-2 text-body-sm text-on-surface-variant">
                      <span className="flex items-center gap-1.5">{who && <Avatar name={who.name} src={who.avatar} size={20} />}<span className="tnum">{t.points} pts</span></span>
                      {due && <span className={cn('tnum', due.includes('overdue') && t.status !== 'done' && 'text-alert')}>{due}</span>}
                    </div>
                    {canEdit(t) && (
                      <label className="mt-2 block">
                        <span className="sr-only">Move “{t.title}” to</span>
                        <select value={t.status} onChange={(e) => move(t.id, e.target.value as TaskStatus)} disabled={savingId === t.id}
                          className="h-8 w-full rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm text-on-surface">
                          {COLUMNS.map((c) => <option key={c} value={c}>{STATUS_LABEL[c]}</option>)}
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
