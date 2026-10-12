'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/ui/SmartLink';
import { Icon, Pill, useToast } from '@/components/ui';
import { SwipeRow } from '@/components/ui/SwipeRow';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';
import { PRIORITY_TONE } from '@/lib/tasks';
import { useFormat } from '@/lib/locale/client';
import { useT } from '@/i18n/client';
import type { MessageKey } from '@/i18n/shared';
import type { Task } from '@/lib/types';

interface Group { key: string; label: string; tone?: 'alert' | 'warning'; tasks: Pick<Task, 'id' | 'title' | 'priority' | 'due_on' | 'status'>[] }

/** My day task groups. On a phone, swipe a task right to mark it done (with Undo); the tick button does the same everywhere. */
export function MyDayTasks({ groups }: { groups: Group[] }) {
  const t = useT();
  const fmt = useFormat();
  const router = useRouter();
  const { toast } = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const setStatus = async (id: string, status: Task['status']) =>
    requireBrowserClient().from('tasks').update({ status }).eq('id', id);

  const complete = async (task: Group['tasks'][number]) => {
    setHidden((s) => new Set(s).add(task.id));
    const { error } = await setStatus(task.id, 'done');
    if (error) {
      setHidden((s) => { const n = new Set(s); n.delete(task.id); return n; });
      toast(errorMessage(error), 'error');
      return;
    }
    toast(t('swipe.completed', { title: task.title }), 'success', {
      action: {
        label: t('undo.undo'),
        onClick: async () => {
          const r = await setStatus(task.id, task.status);
          if (r.error) { toast(errorMessage(r.error), 'error'); return; }
          setHidden((s) => { const n = new Set(s); n.delete(task.id); return n; });
          toast(t('swipe.reopened'), 'info');
          router.refresh();
        },
      },
    });
    router.refresh();
  };

  const visible = groups.map((g) => ({ ...g, tasks: g.tasks.filter((x) => !hidden.has(x.id)) })).filter((g) => g.tasks.length > 0);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-on-surface-variant lg:hidden">{t('swipe.hint')}</p>
      {visible.map((g) => (
        <div key={g.key}>
          <h3 className={`mb-1 text-label-xs uppercase ${g.tone === 'alert' ? 'text-alert' : g.tone === 'warning' ? 'text-warning' : 'text-on-surface-variant'}`}>{g.label} · {g.tasks.length}</h3>
          <ul className="divide-y divide-outline-variant">
            {g.tasks.map((x) => (
              <li key={x.id} data-task-row={x.id}>
                <SwipeRow right={{ label: t('swipe.complete'), icon: 'check_circle', tone: 'healthy', run: () => void complete(x) }}>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void complete(x)} aria-label={t('swipe.mark_done', { title: x.title })}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/5 hover:text-healthy">
                      <Icon name="radio_button_unchecked" />
                    </button>
                    <Link href={`/operations/tasks/${x.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded px-1 py-2 hover:bg-on-surface/5" draggable={false}>
                      <Pill tone={PRIORITY_TONE[x.priority]}>{t(`task.pr.${x.priority}` as MessageKey)}</Pill>
                      <span className="min-w-0 flex-1 truncate text-body-md">{x.title}</span>
                      {x.due_on && <span className="text-body-sm text-on-surface-variant tnum">{fmt.date(x.due_on)}</span>}
                    </Link>
                  </div>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {visible.length === 0 && <p className="text-body-md text-on-surface-variant">{t('md.tasks_empty')}</p>}
    </div>
  );
}
