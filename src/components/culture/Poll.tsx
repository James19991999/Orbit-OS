'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Input, InlineError, Checkbox, useToast, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage, useAction, unwrap } from '@/hooks/useAction';

import type { Poll as PollT, PollOption } from '@/lib/types';

export function PollCard({ poll, options, results, myVote: initialVote, orgId, canVote }:
  { poll: PollT; options: PollOption[]; results: Record<string, number>; myVote: string | null; orgId: string; canVote: boolean }) {
  const [counts, setCounts] = useState(results);
  const [myVote, setMyVote] = useState(initialVote);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const closed = poll.closes_at ? new Date(poll.closes_at).getTime() < Date.now() : false;

  async function vote(optionId: string) {
    if (closed || !canVote || optionId === myVote) return;
    const prevVote = myVote; const prevCounts = counts;
    setBusy(optionId);
    setMyVote(optionId);
    setCounts((c) => ({ ...c, [optionId]: (c[optionId] ?? 0) + 1, ...(prevVote ? { [prevVote]: Math.max(0, (c[prevVote] ?? 1) - 1) } : {}) }));
    try {
      const sb = requireBrowserClient();
      if (prevVote) { const d = await sb.from('poll_votes').delete().eq('poll_id', poll.id).eq('user_id', (await sb.auth.getUser()).data.user!.id); if (d.error) throw d.error; }
      const { error } = await sb.from('poll_votes').insert({ poll_id: poll.id, option_id: optionId, org_id: orgId });
      if (error) throw error;
    } catch (e) {
      setMyVote(prevVote); setCounts(prevCounts);
      toast(`Vote not saved: ${errorMessage(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div>
      <p className="text-body-md text-on-surface">{poll.question}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {options.map((o) => {
          const n = counts[o.id] ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const mine = myVote === o.id;
          return (
            <li key={o.id}>
              <button type="button" onClick={() => vote(o.id)} disabled={closed || !canVote || !!busy} aria-pressed={mine}
                className={`relative flex h-11 w-full items-center justify-between overflow-hidden rounded border px-3 text-left text-body-md transition-colors disabled:cursor-default ${mine ? 'border-primary-container' : 'border-outline-variant hover:bg-on-surface/5'}`}>
                <span className="absolute inset-y-0 left-0 bg-primary-container/15" style={{ width: `${pct}%` }} aria-hidden />
                <span className="relative">{o.label}{mine && <span className="sr-only"> (your vote)</span>}</span>
                <span className="relative tnum text-on-surface-variant">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-body-sm text-on-surface-variant">
        {total} {total === 1 ? 'response' : 'responses'} · {poll.anonymous ? 'anonymous' : 'named'} · {closed ? 'closed' : poll.closes_at ? <>closes <TimeAgo date={poll.closes_at} /></> : 'open'}{myVote && !closed ? ' · tap another option to change your vote' : ''}
      </p>
    </div>
  );
}

export function NewPollButton({ orgId, kind = 'pulse' }: { orgId: string; kind?: 'pulse' | 'announcement' | 'enps' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [anon, setAnon] = useState(true);
  const [days, setDays] = useState('3');
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(async () => {
    const sb = requireBrowserClient();
    const poll = unwrap(await sb.from('polls').insert({ org_id: orgId, question: q.trim(), anonymous: anon, kind, closes_at: new Date(Date.now() + Number(days) * 86_400_000).toISOString() }).select('id').single()) as { id: string };
    unwrap(await sb.from('poll_options').insert(opts.map((o) => o.trim()).filter(Boolean).map((label, position) => ({ poll_id: poll.id, org_id: orgId, label, position }))).select('id'));
    return poll;
  }, { success: 'Poll published' });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return setErr('Write a question.');
    if (opts.filter((o) => o.trim()).length < 2) return setErr('Add at least two options.');
    setErr(null);
    if (await save.run()) { setOpen(false); setQ(''); setOpts(['', '']); router.refresh(); }
  }
  return (
    <>
      <Button size="sm" variant="secondary" icon="add" onClick={() => setOpen(true)}>New poll</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New poll"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="poll-form" loading={save.pending}>Publish</Button></>}>
        <form id="poll-form" onSubmit={submit} className="grid gap-3" noValidate>
          <Input label="Question" value={q} onChange={(e) => setQ(e.target.value)} />
          {opts.map((o, i) => <Input key={i} label={`Option ${i + 1}`} value={o} onChange={(e) => setOpts((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />)}
          {opts.length < 6 && <Button variant="ghost" size="sm" icon="add" onClick={() => setOpts((s) => [...s, ''])}>Add option</Button>}
          <Input label="Open for (days)" type="number" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} />
          <Checkbox label="Anonymous" description="Nobody, including admins, can see who voted for what." checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          <InlineError message={err ?? save.error} />
        </form>
      </Dialog>
    </>
  );
}
