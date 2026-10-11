'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { TaskDialog, type PersonOption } from './TaskDialog';
import type { Task, Sprint } from '@/lib/types';
import { useT } from '@/i18n/client';

export function TaskDetailActions({ task, orgId, userId, people, sprints, canDelete }:
  { task: Task; orgId: string; userId: string; people: PersonOption[]; sprints: Pick<Sprint, 'id' | 'name'>[]; canDelete: boolean }) {
  const t = useT();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const del = useAction(async () => unwrap(await requireBrowserClient().from('tasks').delete().eq('id', task.id).select('id')), { success: t('task.deleted') });
  const done = useAction(async () => unwrap(await requireBrowserClient().from('tasks').update({ status: 'done' }).eq('id', task.id).select('id')), { success: t('task.marked_done') });
  return (
    <div className="mt-6 flex flex-wrap gap-2 border-t border-outline-variant pt-4">
      <Button icon="edit" variant="secondary" onClick={() => setEdit(true)}>{t('common.edit')}</Button>
      {task.status !== 'done' && <Button icon="task_alt" onClick={async () => { if (await done.run()) router.refresh(); }} loading={done.pending}>{t('task.mark_done')}</Button>}
      {canDelete && <Button icon="delete" variant="danger" onClick={() => setConfirm(true)}>{t('common.delete')}</Button>}
      <TaskDialog open={edit} onClose={() => setEdit(false)} orgId={orgId} userId={userId} people={people} sprints={sprints} task={task} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('task.delete_title')} description={t('task.cannot_undo')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={del.pending} onClick={async () => { if (await del.run()) { setConfirm(false); router.replace('/operations'); router.refresh(); } }}>{t('task.delete')}</Button></>}>
        <p className="text-body-md">{t('task.delete_body', { title: task.title })}</p>
      </Dialog>
    </div>
  );
}
