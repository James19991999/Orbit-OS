'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Button, Icon, InlineError, Textarea, useToast, cn, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useRealtime } from '@/hooks/useRealtime';
import { errorMessage } from '@/hooks/useAction';

import { usePresence } from './usePresence';
import type { Message } from '@/lib/types';
import { useT } from '@/i18n/client';

export function ChannelView({ channel, initial, people, me, canPost, canModerate }:
  { channel: { id: string; org_id: string; slug: string; is_announcement: boolean }; initial: Message[]; people: Record<string, { name: string; avatar: string | null }>;
    me: { id: string; name: string; city: string | null }; canPost: boolean; canModerate: boolean }) {
  const [msgs, setMsgs] = useState(initial);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { toast } = useToast();
  const t = useT();
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { peers, update } = usePresence(`typing-${channel.id}`, { user_id: me.id, name: me.name, city: me.city, typing: false });
  const typing = peers.filter((p) => p.typing && p.user_id !== me.id);

  const onChange = useCallback((p: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const m = p.new as unknown as Message;
    if (p.eventType === 'INSERT') setMsgs((s) => (s.some((x) => x.id === m.id) ? s : [...s, m]));
    if (p.eventType === 'UPDATE') setMsgs((s) => s.map((x) => (x.id === m.id ? m : x)));
    if (p.eventType === 'DELETE') setMsgs((s) => s.filter((x) => x.id !== (p.old as { id: string }).id));
  }, []);
  const { status, retry } = useRealtime(`ch-${channel.id}`, 'messages', `channel_id=eq.${channel.id}`, onChange);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  function onType(v: string) {
    setBody(v);
    update({ typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => update({ typing: false }), 2500);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true); setErr(null);
    try {
      const { data, error } = await requireBrowserClient().from('messages')
        .insert({ org_id: channel.org_id, channel_id: channel.id, author_id: me.id, body: text, parent_id: replyTo?.id ?? null }).select().single();
      if (error) throw error;
      setMsgs((s) => (s.some((x) => x.id === data.id) ? s : [...s, data as Message]));
      setBody(''); setReplyTo(null); update({ typing: false });
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSending(false);
    }
  }
  async function patch(id: string, values: Partial<Message>, okMsg: string) {
    const before = msgs;
    setMsgs((s) => s.map((m) => (m.id === id ? { ...m, ...values } : m)));
    const { error } = await requireBrowserClient().from('messages').update(values).eq('id', id);
    if (error) { setMsgs(before); toast(errorMessage(error), 'error'); return false; }
    toast(okMsg); return true;
  }
  async function remove(id: string) {
    const before = msgs;
    setMsgs((s) => s.filter((m) => m.id !== id && m.parent_id !== id));
    const { error } = await requireBrowserClient().from('messages').delete().eq('id', id);
    if (error) { setMsgs(before); toast(errorMessage(error), 'error'); }
  }

  const roots = msgs.filter((m) => !m.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const replies = (id: string) => msgs.filter((m) => m.parent_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const Item = ({ m, nested }: { m: Message; nested?: boolean }) => {
    const author = people[m.author_id]?.name ?? t('cul.former');
    const mine = m.author_id === me.id;
    return (
      <div className={cn('group flex gap-3', nested && 'ml-10 mt-2')}>
        <Avatar name={author} src={people[m.author_id]?.avatar} size={nested ? 26 : 32} />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm"><strong className="text-label-md">{author}</strong> <span className="text-on-surface-variant"><TimeAgo date={m.created_at} />{m.edited_at ? ` · ${t('cul.ch.edited')}` : ''}</span>
            {m.pinned && <span className="ml-2 inline-flex items-center gap-0.5 text-warning"><Icon name="push_pin" className="text-[14px]" />{t('cul.ch.pinned')}</span>}</p>
          {editing?.id === m.id ? (
            <form className="mt-1 flex flex-col gap-2" onSubmit={async (e) => { e.preventDefault(); if (await patch(m.id, { body: editing.body.trim() }, t('cul.ch.msg_edited'))) setEditing(null); }}>
              <Textarea label={t('cul.ch.edit_label')} hideLabel rows={2} value={editing.body} onChange={(e) => setEditing({ id: m.id, body: e.target.value })} />
              <div className="flex gap-2"><Button size="sm" type="submit">{t('cul.save')}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('cul.cancel')}</Button></div>
            </form>
          ) : <p className="whitespace-pre-wrap break-words text-body-md">{m.body}</p>}
          <div className="mt-1 flex flex-wrap gap-3 text-body-sm text-on-surface-variant">
            {!nested && canPost && <button type="button" className="hover:text-on-surface" onClick={() => setReplyTo(m)}>{t('cul.ch.reply')}</button>}
            {mine && <button type="button" className="hover:text-on-surface" onClick={() => setEditing({ id: m.id, body: m.body })}>{t('cul.ch.edit')}</button>}
            {canModerate && !nested && <button type="button" className="hover:text-on-surface" onClick={() => patch(m.id, { pinned: !m.pinned }, m.pinned ? t('cul.ch.unpinned') : t('cul.ch.pinned'))}>{m.pinned ? t('cul.ch.unpin') : t('cul.ch.pin')}</button>}
            {(mine || canModerate) && <button type="button" className="hover:text-alert" onClick={() => remove(m.id)}>{t('cul.ch.delete')}</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {status === 'paused' && <p className="flex items-center gap-2 text-body-sm text-warning" role="status"><Icon name="sync_problem" className="text-[16px]" />{t('cul.ch.paused')} <button type="button" onClick={retry} className="underline">{t('cul.retry')}</button></p>}
      <ol className="flex flex-col gap-5">
        {roots.length === 0 && <li className="text-body-md text-on-surface-variant">{t('cul.ch.empty')}</li>}
        {roots.map((m) => (
          <li key={m.id}>
            <Item m={m} />
            {replies(m.id).map((r) => <Item key={r.id} m={r} nested />)}
          </li>
        ))}
      </ol>
      {canPost ? (
        <form onSubmit={send} className="sticky bottom-20 flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container p-3 shadow-l2 lg:bottom-4">
          {replyTo && <p className="flex items-center justify-between text-body-sm text-on-surface-variant">{t('cul.ch.replying', { name: people[replyTo.author_id]?.name ?? t('cul.ch.message') })}<button type="button" onClick={() => setReplyTo(null)} className="underline">{t('cul.cancel')}</button></p>}
          <Textarea label={t('cul.ch.placeholder', { slug: channel.slug })} hideLabel rows={2} placeholder={t('cul.ch.placeholder', { slug: channel.slug })} value={body} onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-sm text-on-surface-variant" aria-live="polite">{typing.length ? t('cul.ch.typing', { names: typing.map((p) => p.name.split(' ')[0]).join(', '), count: typing.length }) : t('cul.ch.hint')}</p>
            <Button type="submit" size="sm" icon="send" loading={sending} disabled={!body.trim()}>{t('cul.ch.send')}</Button>
          </div>
          <InlineError message={err} />
        </form>
      ) : <p className="text-body-sm text-on-surface-variant">{channel.is_announcement ? t('cul.ch.ann_only') : t('cul.ch.readonly')}</p>}
    </div>
  );
}
