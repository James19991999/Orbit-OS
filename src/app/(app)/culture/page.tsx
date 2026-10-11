import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { can } from '@/lib/roles';

import { Card, CardHeader, Icon, LinkTabs, EmptyState, Pill } from '@/components/ui';
import { PresenceProvider } from '@/components/culture/usePresence';
import { Lounges, CitiesLive } from '@/components/culture/Lounges';
import { PollCard, NewPollButton } from '@/components/culture/Poll';
import { RollCall } from '@/components/culture/RollCall';
import { GiveKudos, KudosFeed } from '@/components/culture/Kudos';
import { BADGES, badgeLabel, badgeHint } from '@/components/culture/badges';
import { getT } from '@/i18n/server';
import type { Lounge, Poll, PollOption, CheckIn, Channel, Message, Kudos, Badge } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('p.cul.title') };
}

export default async function CulturePage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const [{ supabase, org, role, user, profile }, t] = await Promise.all([requireAppContext(), getT()]);
  const tab = searchParams.tab === 'channels' || searchParams.tab === 'kudos' ? searchParams.tab : 'lounge';
  const today = new Date().toISOString().slice(0, 10);
  const members = await loadMembers(supabase, org.id);
  const people = nameMap(members);
  const cities = [...new Set(members.map((m) => m.profile.city).filter(Boolean) as string[])];
  const me = { user_id: user.id, name: profile.full_name, city: profile.city };

  return (
    <PresenceProvider topic={`presence-${org.id}`} me={me}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('p.cul.title')}</h1>
            <CitiesLive fallbackCities={cities} />
          </div>
        </div>
        <LinkTabs label={t('p.cul.sections')} tabs={[{ id: 'lounge', label: t('p.cul.lounge') }, { id: 'channels', label: t('p.cul.channels') }, { id: 'kudos', label: t('p.cul.kudos') }]} />
        {tab === 'lounge' && <LoungeTab orgId={org.id} orgSlug={org.slug} userId={user.id} today={today} memberCount={members.length} canWrite={can.write(role)} canManage={can.manage(role)} supabase={supabase} />}
        {tab === 'channels' && <ChannelsTab orgId={org.id} supabase={supabase} people={people} />}
        {tab === 'kudos' && <KudosTab orgId={org.id} userId={user.id} canWrite={can.write(role)} supabase={supabase} people={people} members={members.map((m) => ({ id: m.user_id, name: m.profile.full_name }))} />}
      </div>
    </PresenceProvider>
  );
}

type SB = Awaited<ReturnType<typeof requireAppContext>>['supabase'];

async function pollBundle(supabase: SB, polls: Poll[], userId: string) {
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);
  const [opts, mine, ...results] = await Promise.all([
    supabase.from('poll_options').select('*').in('poll_id', ids).order('position'),
    supabase.from('poll_votes').select('poll_id, option_id').in('poll_id', ids).eq('user_id', userId),
    ...ids.map((id) => supabase.rpc('poll_results', { p_poll: id })),
  ]);
  const options = must(opts, 'poll options') as PollOption[];
  const votes = must(mine, 'your votes') as { poll_id: string; option_id: string }[];
  return polls.map((p, i) => ({
    poll: p, options: options.filter((o) => o.poll_id === p.id),
    results: Object.fromEntries((must(results[i], 'poll results') as { option_id: string; votes: number }[]).map((r) => [r.option_id, Number(r.votes)])),
    myVote: votes.find((v) => v.poll_id === p.id)?.option_id ?? null,
  }));
}

async function LoungeTab({ orgId, orgSlug, userId, today, memberCount, canWrite, canManage, supabase }:
  { orgId: string; orgSlug: string; userId: string; today: string; memberCount: number; canWrite: boolean; canManage: boolean; supabase: SB }) {
  const [fmt, t] = await Promise.all([getFormat(), getT()]);
  const [loungesRes, pollsRes, checkinsRes, annRes] = await Promise.all([
    supabase.from('lounges').select('*').eq('org_id', orgId).order('kind'),
    supabase.from('polls').select('*').eq('org_id', orgId).in('kind', ['pulse', 'announcement', 'enps']).order('created_at', { ascending: false }).limit(6),
    supabase.from('check_ins').select('*').eq('org_id', orgId).eq('for_date', today),
    supabase.from('channels').select('id').eq('org_id', orgId).eq('is_announcement', true),
  ]);
  const lounges = must(loungesRes, 'lounges') as Lounge[];
  const polls = must(pollsRes, 'polls') as Poll[];
  const bundles = await pollBundle(supabase, polls, userId);
  const pulse = bundles.find((b) => b.poll.kind !== 'announcement');
  const annPolls = bundles.filter((b) => b.poll.kind === 'announcement');
  const checkins = must(checkinsRes, 'check-ins') as CheckIn[];
  const annIds = (must(annRes, 'channels') as { id: string }[]).map((c) => c.id);
  const pinned = annIds.length ? must(await supabase.from('messages').select('*').in('channel_id', annIds).eq('pinned', true).is('parent_id', null).order('created_at', { ascending: false }).limit(3), 'announcements') as Message[] : [];
  return (
    <div className="flex flex-col gap-4">
      {lounges.length ? <Lounges orgSlug={orgSlug} lounges={lounges} canWrite={canWrite} /> : <EmptyState icon="coffee" title={t('p.cul.no_lounges')} />}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader title={t('p.cul.pulse')} icon="query_stats" action={canManage ? <NewPollButton orgId={orgId} /> : undefined} subtitle={t('p.cul.pulse_sub')} />
          {pulse ? <PollCard {...pulse} orgId={orgId} canVote={canWrite} /> : <EmptyState icon="ballot" title={t('p.cul.no_pulse')} body={canManage ? t('p.cul.ask') : undefined} />}
        </Card>
        <Card id="roll-call">
          <CardHeader title={t('p.cul.roll')} icon="how_to_reg" />
          <RollCall orgId={orgId} userId={userId} completed={checkins.length} total={memberCount} mine={checkins.find((c) => c.user_id === userId) ?? null} canWrite={canWrite} today={today} />
        </Card>
      </div>
      <Card>
        <CardHeader title={t('p.cul.ann')} icon="push_pin" action={canManage ? <NewPollButton orgId={orgId} kind="announcement" /> : undefined} />
        {pinned.length === 0 && annPolls.length === 0 ? <EmptyState icon="campaign" title={t('p.cul.no_ann')} body={t('p.cul.no_ann_body')} /> : (
          <div className="flex flex-col gap-4">
            {pinned.map((m) => (
              <article key={m.id} className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
                <p className="text-label-xs uppercase text-on-surface-variant">#announcements · {fmt.relative(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-wrap text-body-lg">{m.body}</p>
              </article>
            ))}
            {annPolls.map((b) => <div key={b.poll.id} className="rounded-lg border border-outline-variant p-4"><PollCard {...b} orgId={orgId} canVote={canWrite} /></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}

async function ChannelsTab({ orgId, supabase, people }: { orgId: string; supabase: SB; people: ReturnType<typeof nameMap> }) {
  const [fmt, t] = await Promise.all([getFormat(), getT()]);
  const [chRes, msgRes] = await Promise.all([
    supabase.from('channels').select('*').eq('org_id', orgId).order('name'),
    supabase.from('messages').select('id, channel_id, parent_id, author_id, body, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(400),
  ]);
  const channels = must(chRes, 'channels') as Channel[];
  const msgs = must(msgRes, 'messages') as Message[];
  const rows = channels.map((c) => {
    const inCh = msgs.filter((m) => m.channel_id === c.id);
    return { c, last: inCh.find((m) => !m.parent_id) ?? inCh[0], replies: inCh.filter((m) => m.parent_id).length, count: inCh.length };
  }).sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''));
  return (
    <Card>
      <CardHeader title={t('p.cul.streams')} icon="forum" subtitle={t('p.cul.n_channels', { count: channels.length })} />
      <ul className="divide-y divide-outline-variant">
        {rows.map(({ c, last, replies }) => (
          <li key={c.id}>
            <Link href={`/culture/channels/${c.slug}`} className="flex items-start justify-between gap-3 py-3 hover:bg-on-surface/[0.03]">
              <div className="min-w-0">
                <p className="text-label-md"># {c.name} {c.is_announcement && <Pill tone="info" className="ml-1">{t('p.cul.ann')}</Pill>}</p>
                <p className="truncate text-body-sm text-on-surface-variant">{last ? `${people[last.author_id]?.name ?? t('cul.member')}: ${last.body}` : c.topic ?? t('p.cul.no_msgs')}</p>
              </div>
              <span className="shrink-0 text-right text-body-sm text-on-surface-variant">{last ? fmt.relative(last.created_at) : ''}<br />{replies ? t('p.cul.replies', { count: replies }) : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function KudosTab({ orgId, userId, canWrite, supabase, people, members }:
  { orgId: string; userId: string; canWrite: boolean; supabase: SB; people: ReturnType<typeof nameMap>; members: { id: string; name: string }[] }) {
  const t = await getT();
  const kudos = must(await supabase.from('kudos').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(30), 'kudos') as Kudos[];
  const reactions = kudos.length ? must(await supabase.from('kudos_reactions').select('kudos_id, user_id, emoji').in('kudos_id', kudos.map((k) => k.id)), 'reactions') as { kudos_id: string; user_id: string; emoji: string }[] : [];
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
      <Card className="lg:col-span-4">
        <CardHeader title={t('cul.k.title')} icon="military_tech" subtitle={t('p.cul.celebrate_sub')} />
        {canWrite && <GiveKudos orgId={orgId} userId={userId} people={members} />}
        <h3 className="mt-5 text-label-xs uppercase text-on-surface-variant">{t('p.cul.badges')}</h3>
        <ul className="mt-2 grid gap-2">
          {(Object.keys(BADGES) as Badge[]).map((b) => <li key={b} className="text-body-md">{BADGES[b].emoji} <strong>{badgeLabel(t, b)}</strong> <span className="text-on-surface-variant">— {badgeHint(t, b)}</span></li>)}
        </ul>
      </Card>
      <Card className="lg:col-span-8">
        <CardHeader title={t('p.cul.recent')} icon="celebration" />
        {kudos.length ? <KudosFeed items={kudos} reactions={reactions} people={people} userId={userId} orgId={orgId} canReact={canWrite} />
          : <EmptyState icon="stars" title={t('p.cul.no_kudos')} body={t('p.cul.no_kudos_body')} />}
      </Card>
    </div>
  );
}
