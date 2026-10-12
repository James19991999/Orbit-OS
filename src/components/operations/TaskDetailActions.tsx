'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, errorMessage } from '@/hooks/useAction';
import { TaskDialog, type PersonOption } from './TaskDialog';
import type { Task, Sprint } from '@/lib/types';
import { useT } from '@/i18n/client';

export function TaskDetailActions({ task, orgId, userId, people, sprints, canDelete }:
  { task: Task; orgId: string; userId: string; people: PersonOption[]; sprints: Pick<Sprint, 'id' | 'name'>[]; canDelete: boolean }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [edit, setEdit] = useState(false);
  // No "are you sure?": the task goes straight away, and Undo puts it back (with its comments) for 10 minutes.
  const del = useAction(async () => unwrap(await requireBrowserClient().rpc('delete_task', { p_task: task.id })));
  const restore = async () => {
    try {
      unwrap(await requireBrowserClient().rpc('restore_task', { p_task: task.id }));
      toast(t('undo.restored'), 'success');
      router.push(`/operations/tasks/${task.id}`);
      router.refresh();
    } catch (e) {
      toast(t('undo.failed', { error: errorMessage(e) }), 'error');
    }
  };
  const done = useAction(async () => unwrap(await requireBrowserClient().from('tasks').update({ status: 'done' }).eq('id', task.id).select('id')), { success: t('task.marked_done') });
  return (
    <div className="mt-6 flex flex-wrap gap-2 border-t border-outline-variant pt-4">
      <Button icon="edit" variant="secondary" onClick={() => setEdit(true)}>{t('common.edit')}</Button>
      {task.status !== 'done' && <Button icon="task_alt" onClick={async () => { if (await done.run()) router.refresh(); }} loading={done.pending}>{t('task.mark_done')}</Button>}
      {canDelete && (
        <Button icon="delete" variant="danger" loading={del.pending} onClick={async () => {
          if ((await del.run()) === undefined) return; // failed: useAction already showed why
          toast(`${t('undo.task_deleted')}: ${task.title}`, 'info', { action: { label: t('undo.undo'), onClick: () => void restore() } });
          router.replace('/operations');
          router.refresh();
        }}>{t('common.delete')}</Button>
      )}
      <TaskDialog open={edit} onClose={() => setEdit(false)} orgId={orgId} userId={userId} people={people} sprints={sprints} task={task} />
    </div>
  );
}
