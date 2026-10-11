import type { Metadata } from 'next';
import { requireAppContext } from '@/lib/context';
import { loadMembers, isoDaysAgo, must } from '@/lib/data/members';
import { can } from '@/lib/roles';
import { LinkButton } from '@/components/ui';
import { Directory, type PersonRow } from '@/components/people/Directory';
import { streakFrom } from '@/lib/streak';
import { getT } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.ppl.title') };
}

export default async function PeoplePage() {
  const [{ supabase, org, role }, tr] = await Promise.all([requireAppContext(), getT()]);
  const [members, tasksR, kudosR, ciR] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('tasks').select('assignee_id').eq('org_id', org.id).neq('status', 'done'),
    supabase.from('kudos').select('to_id, message, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('check_ins').select('user_id, for_date').eq('org_id', org.id).gte('for_date', isoDaysAgo(60)),
  ]);
  const tasks = must(tasksR, 'tasks') as { assignee_id: string | null }[];
  const kudos = must(kudosR, 'kudos') as { to_id: string; message: string; created_at: string }[];
  const ci = must(ciR, 'check-ins') as { user_id: string; for_date: string }[];
  const people: PersonRow[] = members.map((m) => ({
    id: m.user_id, name: m.profile.full_name, email: m.profile.email, avatar: m.profile.avatar_url, role: m.role, title: m.title, department: m.department,
    timezone: m.profile.timezone, city: m.profile.city, workStart: m.profile.work_start, workEnd: m.profile.work_end,
    openTasks: tasks.filter((t) => t.assignee_id === m.user_id).length, kudos: kudos.filter((k) => k.to_id === m.user_id).slice(0, 3),
    streak: streakFrom(ci.filter((c) => c.user_id === m.user_id).map((c) => c.for_date)),
  }));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline-lg-mobile md:text-headline-lg">{tr('p.ppl.title')}</h1>
          <p className="text-body-md text-on-surface-variant">{tr('p.ppl.sub', { count: members.length })}</p>
        </div>
        {can.manage(role) && <LinkButton href="/settings?section=members#members" icon="person_add">{tr('p.ppl.invite')}</LinkButton>}
      </div>
      <Directory people={people} />
    </div>
  );
}
