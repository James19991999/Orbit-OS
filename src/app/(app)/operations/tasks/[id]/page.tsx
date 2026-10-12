import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { notFound } from 'next/navigation';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { can } from '@/lib/roles';

import { Card, Pill, Icon } from '@/components/ui';
import { TaskDetailActions } from '@/components/operations/TaskDetailActions';
import { TaskComments, type CommentView } from '@/components/tasks/TaskComments';
import { PRIORITY_TONE, dueInfo } from '@/lib/tasks';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/shared';
import type { Task, Sprint } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.task.title') };
}

export default async function TaskPage(props: { params: Promise<{ id: string }> }) {
  const [fmt, t] = await Promise.all([getFormat(), getT()]);
  const params = await props.params;
  const { supabase, org, role, user } = await requireAppContext();
  const { data } = await supabase.from('tasks').select('*').eq('id', params.id).eq('org_id', org.id).maybeSingle();
  if (!data) notFound();
  const task = data as Task;
  const [members, sprints, commentsRes] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('sprints').select('id, name').eq('org_id', org.id).order('starts_on', { ascending: false }).limit(20),
    supabase.from('task_comments').select('id, created_at, author_id, body').eq('task_id', task.id).order('created_at').limit(500),
  ]);
  const people = nameMap(members);
  const sprintList = must(sprints, 'sprints') as Pick<Sprint, 'id' | 'name'>[];
  const editable = can.manage(role) || (can.write(role) && (task.assignee_id === user.id || task.created_by === user.id));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/operations" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />{t('p.task.back')}</Link>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={PRIORITY_TONE[task.priority]}>{t(`task.pr.${task.priority}` as MessageKey)}</Pill>
          <Pill tone={task.status === 'done' ? 'healthy' : task.status === 'blocked' ? 'alert' : 'info'}>{t(`task.st.${task.status}` as MessageKey)}</Pill>
          {task.due_on && <span className="text-body-sm text-on-surface-variant tnum">{(() => { const d = dueInfo(task.due_on)!; return t(d.key, { n: d.n }); })()} · {fmt.date(task.due_on)}</span>}
        </div>
        <h1 className="mt-3 text-headline-lg-mobile md:text-headline-lg">{task.title}</h1>
        {task.status === 'blocked' && task.blocked_reason && <p className="mt-2 flex items-center gap-1.5 text-body-md text-alert"><Icon name="error" />{t('p.task.blocked', { reason: task.blocked_reason })}</p>}
        {task.description && <p className="mt-3 whitespace-pre-wrap text-body-lg text-on-surface-variant">{task.description}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-4 text-body-md md:grid-cols-4">
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.task.assignee')}</dt><dd>{task.assignee_id ? people[task.assignee_id]?.name ?? '—' : t('task.unassigned')}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.task.sprint')}</dt><dd>{sprintList.find((s) => s.id === task.sprint_id)?.name ?? t('p.task.backlog')}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.task.points')}</dt><dd className="tnum">{task.points}</dd></div>
          <div><dt className="text-label-xs uppercase text-on-surface-variant">{t('p.task.created')}</dt><dd>{t('p.task.created_by', { when: fmt.relative(task.created_at), name: task.created_by ? people[task.created_by]?.name ?? t('p.task.member') : '—' })}</dd></div>
        </dl>
        {task.tags.length > 0 && <p className="mt-4 flex flex-wrap gap-1.5">{task.tags.map((tag) => <span key={tag} className="rounded-full bg-surface-container-highest px-2 py-0.5 text-body-sm">#{tag}</span>)}</p>}
        {editable && <TaskDetailActions task={task} orgId={org.id} userId={user.id} people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name }))} sprints={sprintList} canDelete={can.manage(role) || task.created_by === user.id} />}
      </Card>
      <TaskComments orgId={org.id} taskId={task.id} userId={user.id} comments={(commentsRes.data ?? []) as CommentView[]}
        people={members.map((m) => ({ id: m.user_id, name: m.profile.full_name, avatar: m.profile.avatar_url }))}
        canComment={can.write(role)} canModerate={can.manage(role)} />
    </div>
  );
}
