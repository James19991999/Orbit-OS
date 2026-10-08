'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Dialog, Select, Textarea, InlineError, Avatar, useToast, cn, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, errorMessage } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';

import type { Badge, Kudos } from '@/lib/types';

export const BADGES: Record<Badge, { emoji: string; label: string; hint: string }> = {
  firefighter: { emoji: '🔥', label: 'Firefighter', hint: 'Critical incident fix' },
  team_glue: { emoji: '🤝', label: 'Team Glue', hint: 'Unsung coordination' },
  ship_it: { emoji: '⚡', label: 'Ship It', hint: 'Relentless delivery' },
  innovator: { emoji: '💡', label: 'Innovator', hint: 'Elegant simplification' },
};
const REACTIONS = ['👏', '❤️', '🙌', '🌟', '🚀'] as const;

export function GiveKudos({ orgId, userId, people }: { orgId: string; userId: string; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ to: string; badge: Badge; message: string }>({ to: '', badge: 'ship_it', message: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (sp.get('give') === '1') setOpen(true); }, [sp]);
  const save = useAction(async () => unwrap(await requireBrowserClient().from('kudos').insert({ org_id: orgId, from_id: userId, to_id: f.to, badge: f.badge, message: f.message.trim() }).select('id')), { success: 'Kudos sent 🎉' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.to) return setErr('Choose a teammate.');
    if (!f.message.trim()) return setErr('Say what they did.');
    setErr(null);
    if (await save.run()) { setOpen(false); setF({ to: '', badge: 'ship_it', message: '' }); router.refresh(); }
  }
  const others = people.filter((p) => p.id !== userId);
  return (
    <>
      <Button icon="stars" onClick={() => setOpen(true)} disabled={!others.length}>Give kudos</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Celebrate impact" description="Send a peer recognition token."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="kudos-form" loading={save.pending}>Send kudos</Button></>}>
        <form id="kudos-form" onSubmit={submit} className="grid gap-4" noValidate>
          <Select label="Teammate" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} options={[{ value: '', label: 'Choose…' }, ...others.map((p) => ({ value: p.id, label: p.name }))]} />
          <fieldset>
            <legend className="mb-2 text-label-sm text-on-surface-variant">Badge</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(Object.keys(BADGES) as Badge[]).map((b) => (
                <button key={b} type="button" role="radio" aria-checked={f.badge === b} onClick={() => setF({ ...f, badge: b })}
                  className={cn('rounded border p-3 text-left', f.badge === b ? 'border-primary-container bg-primary-container/15' : 'border-outline-variant')}>
                  <span className="text-label-md">{BADGES[b].emoji} {BADGES[b].label}</span>
                  <span className="block text-body-sm text-on-surface-variant">{BADGES[b].hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <Textarea label="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={1000} />
          <InlineError message={err ?? save.error} />
        </form>
      </Dialog>
    </>
  );
}

export function KudosFeed({ items, reactions, people, userId, orgId, canReact }:
  { items: Kudos[]; reactions: { kudos_id: string; user_id: string; emoji: string }[]; people: Record<string, { name: string; avatar: string | null }>; userId: string; orgId: string; canReact: boolean }) {
  const [rx, setRx] = useState(reactions);
  const { toast } = useToast();
  const clip = useClipboard();
  async function toggle(kudosId: string, emoji: string) {
    const mine = rx.some((r) => r.kudos_id === kudosId && r.user_id === userId && r.emoji === emoji);
    const before = rx;
    setRx((s) => (mine ? s.filter((r) => !(r.kudos_id === kudosId && r.user_id === userId && r.emoji === emoji)) : [...s, { kudos_id: kudosId, user_id: userId, emoji }]));
    try {
      const sb = requireBrowserClient();
      const res = mine
        ? await sb.from('kudos_reactions').delete().eq('kudos_id', kudosId).eq('user_id', userId).eq('emoji', emoji)
        : await sb.from('kudos_reactions').insert({ kudos_id: kudosId, org_id: orgId, user_id: userId, emoji });
      if (res.error) throw res.error;
    } catch (e) {
      setRx(before);
      toast(`Reaction not saved: ${errorMessage(e)}`, 'error');
    }
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((k) => {
        const from = people[k.from_id]?.name ?? 'Former member';
        const to = people[k.to_id]?.name ?? 'Former member';
        return (
          <li key={k.id} id={`kudos-${k.id}`} className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-label-xs uppercase text-on-surface-variant">{BADGES[k.badge].emoji} {BADGES[k.badge].label} badge · <TimeAgo date={k.created_at} /></p>
              <button type="button" onClick={() => clip.copy(`${window.location.origin}/culture?tab=kudos#kudos-${k.id}`)} className="rounded p-1 text-on-surface-variant hover:bg-on-surface/5"
                aria-label={clip.status === 'copied' ? 'Link copied' : 'Copy link to this kudos'}>
                <span className="ms text-[18px]" aria-hidden>{clip.status === 'copied' ? 'check' : clip.status === 'error' ? 'error' : 'share'}</span>
              </button>
            </div>
            <div className="mt-2 flex items-start gap-3">
              <Avatar name={to} src={people[k.to_id]?.avatar} size={36} />
              <p className="text-body-md">Kudos to <strong>{to}</strong> from <strong>{from}</strong>: {k.message}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REACTIONS.map((e) => {
                const n = rx.filter((r) => r.kudos_id === k.id && r.emoji === e).length;
                const mine = rx.some((r) => r.kudos_id === k.id && r.emoji === e && r.user_id === userId);
                if (!n && !canReact) return null;
                return (
                  <button key={e} type="button" onClick={() => toggle(k.id, e)} disabled={!canReact} aria-pressed={mine} aria-label={`React ${e}, ${n} so far`}
                    className={cn('flex h-8 items-center gap-1 rounded-full border px-2.5 text-body-sm tnum', mine ? 'border-primary-container bg-primary-container/15' : 'border-outline-variant hover:bg-on-surface/5', !n && 'opacity-60')}>
                    <span aria-hidden>{e}</span>{n > 0 && n}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
      <li aria-live="polite" className="sr-only">{clip.status === 'copied' ? 'Link copied' : clip.status === 'error' ? 'Could not copy link' : ''}</li>
    </ul>
  );
}
