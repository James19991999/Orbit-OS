import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { can } from '@/lib/roles';

import { Card, CardHeader, Icon, LinkTabs, EmptyState, Pill } from '@/components/ui';
import { PresenceProvider } from '@/components/culture/usePresence';
import { Lounges, CitiesLive } from '@/components/culture/Lounges';
import { PollCard, NewPollButton } from '@/components/culture/Poll';
import { RollCall } from '@/components/culture/RollCall';
import { GiveKudos, KudosFeed, BADGES } from '@/components/culture/Kudos';
import type { Lounge, Poll, PollOption, CheckIn, Channel, Message, Kudos, Badge } from '@/lib/types';
import { getFormat } from '@/lib/locale/server';

export const metadata: Metadata = { title: 'Culture' };

export default async function CulturePage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const { supabase, org, role, user, profile } = await requireAppContext();
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
            <h1 className="text-headline-lg-mobile md:text-headline-lg">Culture</h1>
            <CitiesLive fallbackCities={cities} />
          </div>
        </div>
        <LinkTabs label="Culture sections" tabs={[{ id: 'lounge', label: 'Lounge' }, { id: 'channels', label: 'Channels' }, { id: 'kudos', label: 'Kudos' }]} />
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
  const fmt = await getFormat();
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
      {lounges.length ? <Lounges orgSlug={orgSlug} lounges={lounges} canWrite={canWrite} /> : <EmptyState icon="coffee" title="No lounges yet" />}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader title="Weekly culture pulse" icon="query_stats" action={canManage ? <NewPollButton orgId={orgId} /> : undefined} subtitle="One-tap anonymous feedback" />
          {pulse ? <PollCard {...pulse} orgId={orgId} canVote={canWrite} /> : <EmptyState icon="ballot" title="No pulse poll running" body={canManage ? 'Ask the team a quick question.' : undefined} />}
        </Card>
        <Card id="roll-call">
          <CardHeader title="Async roll call" icon="how_to_reg" />
          <RollCall orgId={orgId} userId={userId} completed={checkins.length} total={memberCount} mine={checkins.find((c) => c.user_id === userId) ?? null} canWrite={canWrite} today={today} />
        </Card>
      </div>
      <Card>
        <CardHeader title="Announcements" icon="push_pin" action={canManage ? <NewPollButton orgId={orgId} kind="announcement" /> : undefined} />
        {pinned.length === 0 && annPolls.length === 0 ? <EmptyState icon="campaign" title="No announcements" body="Pinned posts in #announcements show up here." /> : (
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
  const fmt = await getFormat();
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
      <CardHeader title="Active streams" icon="forum" subtitle={`${channels.length} channels`} />
      <ul className="divide-y divide-outline-variant">
        {rows.map(({ c, last, replies }) => (
          <li key={c.id}>
            <Link href={`/culture/channels/${c.slug}`} className="flex items-start justify-between gap-3 py-3 hover:bg-on-surface/[0.03]">
              <div className="min-w-0">
                <p className="text-label-md"># {c.name} {c.is_announcement && <Pill tone="info" className="ml-1">Announcements</Pill>}</p>
                <p className="truncate text-body-sm text-on-surface-variant">{last ? `${people[last.author_id]?.name ?? 'Member'}: ${last.body}` : c.topic ?? 'No messages yet'}</p>
              </div>
              <span className="shrink-0 text-right text-body-sm text-on-surface-variant">{last ? fmt.relative(last.created_at) : ''}<br />{replies ? `${replies} replies` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function KudosTab({ orgId, userId, canWrite, supabase, people, members }:
  { orgId: string; userId: string; canWrite: boolean; supabase: SB; people: ReturnType<typeof nameMap>; members: { id: string; name: string }[] }) {
  const kudos = must(await supabase.from('kudos').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(30), 'kudos') as Kudos[];
  const reactions = kudos.length ? must(await supabase.from('kudos_reactions').select('kudos_id, user_id, emoji').in('kudos_id', kudos.map((k) => k.id)), 'reactions') as { kudos_id: string; user_id: string; emoji: string }[] : [];
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
      <Card className="lg:col-span-4">
        <CardHeader title="Celebrate impact" icon="military_tech" subtitle="Send a peer recognition token" />
        {canWrite && <GiveKudos orgId={orgId} userId={userId} people={members} />}
        <h3 className="mt-5 text-label-xs uppercase text-on-surface-variant">Orbit badge system</h3>
        <ul className="mt-2 grid gap-2">
          {(Object.keys(BADGES) as Badge[]).map((b) => <li key={b} className="text-body-md">{BADGES[b].emoji} <strong>{BADGES[b].label}</strong> <span className="text-on-surface-variant">— {BADGES[b].hint}</span></li>)}
        </ul>
      </Card>
      <Card className="lg:col-span-8">
        <CardHeader title="Recent recognition" icon="celebration" />
        {kudos.length ? <KudosFeed items={kudos} reactions={reactions} people={people} userId={userId} orgId={orgId} canReact={canWrite} />
          : <EmptyState icon="stars" title="No kudos yet" body="Be the first to recognise a teammate." />}
      </Card>
    </div>
  );
}
