import Link from '@/components/ui/SmartLink';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Icon, ProgressBar } from '@/components/ui';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/shared';
import { HideGettingStarted } from './HideGettingStarted';

export const GS_COOKIE = 'orbit_gs_hidden';

interface Step { id: string; title: MessageKey; desc: MessageKey; href: string; icon: string; done: boolean }

/** The first-week checklist for owners and directors. Each step is ticked from real data, not by clicking it. */
export async function GettingStarted({ supabase, orgId, members, isOwner, onTrial, hasTwoFactor }: {
  supabase: SupabaseClient; orgId: string; members: number; isOwner: boolean; onTrial: boolean; hasTwoFactor: boolean;
}) {
  const t = await getT();
  const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId).then((r) => r.count ?? 0, () => 0);
  const [tasks, checkins, meetings, invites] = await Promise.all([count('tasks'), count('check_ins'), count('meetings'), count('invites')]);
  const steps: Step[] = [
    { id: 'invite', title: 'gs.invite', desc: 'gs.invite_d', href: '/settings?section=members', icon: 'person_add', done: members > 1 || invites > 0 },
    { id: 'task', title: 'gs.task', desc: 'gs.task_d', href: '/operations?new=task', icon: 'add_task', done: tasks > 0 },
    { id: 'checkin', title: 'gs.checkin', desc: 'gs.checkin_d', href: '/culture', icon: 'edit_note', done: checkins > 0 },
    { id: 'meeting', title: 'gs.meeting', desc: 'gs.meeting_d', href: '/scheduling', icon: 'event', done: meetings > 0 },
    { id: 'mfa', title: 'gs.mfa', desc: 'gs.mfa_d', href: '/mfa?next=%2Fdashboard', icon: 'shield_lock', done: hasTwoFactor },
    ...(isOwner ? [{ id: 'plan', title: 'gs.plan' as MessageKey, desc: 'gs.plan_d' as MessageKey, href: '/settings/billing', icon: 'payments', done: !onTrial }] : []),
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null; // finished: it gets out of the way
  return (
    <section aria-labelledby="gs-h" className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-label-xs uppercase text-on-surface-variant">{t('gs.region')}</p>
          <h2 id="gs-h" className="mt-1 text-headline-sm">{t('p.dash.welcome')}</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">{t('gs.sub')}</p>
        </div>
        <HideGettingStarted orgId={orgId} label={t('gs.hide')} ariaLabel={t('gs.hide_label')} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1"><ProgressBar value={(done / steps.length) * 100} label={t('gs.progress', { done, total: steps.length })} tone="healthy" /></div>
        <span className="text-body-sm text-on-surface-variant tnum">{t('gs.progress', { done, total: steps.length })}</span>
      </div>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((s) => (
          <li key={s.id}>
            <Link href={s.href} aria-label={`${t(s.title)}${s.done ? ` (${t('gs.done')})` : ''}`}
              className="flex h-full items-start gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 transition-colors hover:border-primary-container/60 hover:bg-on-surface/5">
              <Icon name={s.done ? 'check_circle' : s.icon} filled={s.done} className={s.done ? 'text-healthy' : 'text-secondary'} />
              <span className="min-w-0 flex-1">
                <span className={`block text-label-md ${s.done ? 'text-on-surface-variant line-through decoration-1' : 'text-on-surface'}`}>{t(s.title)}</span>
                <span className="mt-0.5 block text-body-sm text-on-surface-variant">{t(s.desc)}</span>
              </span>
              {!s.done && <span className="self-center text-label-sm text-primary">{t('gs.start')}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
