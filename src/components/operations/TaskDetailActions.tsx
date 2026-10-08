'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { TaskDialog, type PersonOption } from './TaskDialog';
import type { Task, Sprint } from '@/lib/types';

export function TaskDetailActions({ task, orgId, userId, people, sprints, canDelete }:
  { task: Task; orgId: string; userId: string; people: PersonOption[]; sprints: Pick<Sprint, 'id' | 'name'>[]; canDelete: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const del = useAction(async () => unwrap(await requireBrowserClient().from('tasks').delete().eq('id', task.id).select('id')), { success: 'Task deleted' });
  const done = useAction(async () => unwrap(await requireBrowserClient().from('tasks').update({ status: 'done' }).eq('id', task.id).select('id')), { success: 'Marked done' });
  return (
    <div className="mt-6 flex flex-wrap gap-2 border-t border-outline-variant pt-4">
      <Button icon="edit" variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
      {task.status !== 'done' && <Button icon="task_alt" onClick={async () => { if (await done.run()) router.refresh(); }} loading={done.pending}>Mark done</Button>}
      {canDelete && <Button icon="delete" variant="danger" onClick={() => setConfirm(true)}>Delete</Button>}
      <TaskDialog open={edit} onClose={() => setEdit(false)} orgId={orgId} userId={userId} people={people} sprints={sprints} task={task} />
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete this task?" description="This can't be undone."
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" loading={del.pending} onClick={async () => { if (await del.run()) { setConfirm(false); router.replace('/operations'); router.refresh(); } }}>Delete task</Button></>}>
        <p className="text-body-md">“{task.title}” will be removed for everyone.</p>
      </Dialog>
    </div>
  );
}
