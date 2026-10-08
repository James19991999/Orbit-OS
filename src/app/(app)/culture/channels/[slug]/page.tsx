import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAppContext } from '@/lib/context';
import { loadMembers, nameMap, must } from '@/lib/data/members';
import { can } from '@/lib/roles';
import { Card, Icon } from '@/components/ui';
import { ChannelView } from '@/components/culture/ChannelView';
import type { Channel, Message } from '@/lib/types';

export const metadata: Metadata = { title: 'Channel' };

export default async function ChannelPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { supabase, org, role, user, profile } = await requireAppContext();
  const { data } = await supabase.from('channels').select('*').eq('org_id', org.id).eq('slug', params.slug).maybeSingle();
  if (!data) notFound();
  const ch = data as Channel;
  const [members, msgs] = await Promise.all([
    loadMembers(supabase, org.id),
    supabase.from('messages').select('*').eq('channel_id', ch.id).order('created_at', { ascending: false }).limit(200),
  ]);
  const canPost = can.write(role) && (!ch.is_announcement || can.manage(role));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/culture?tab=channels" className="flex items-center gap-1 text-label-md text-primary hover:underline"><Icon name="arrow_back" className="text-[18px]" />Channels</Link>
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg"># {ch.name}</h1>
        {ch.topic && <p className="text-body-md text-on-surface-variant">{ch.topic}</p>}
      </div>
      <Card>
        <ChannelView channel={{ id: ch.id, org_id: org.id, slug: ch.slug, is_announcement: ch.is_announcement }} initial={(must(msgs, 'messages') as Message[]).reverse()}
          people={nameMap(members)} me={{ id: user.id, name: profile.full_name, city: profile.city }} canPost={canPost} canModerate={can.manage(role)} />
      </Card>
    </div>
  );
}
