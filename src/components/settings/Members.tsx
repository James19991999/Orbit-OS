'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Dialog, Input, Select, InlineError, Banner, useToast, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, postJson, errorMessage } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';

import { ROLE_LABEL, ROLE_DESCRIPTION } from '@/lib/roles';
import type { Role } from '@/lib/types';

interface Row { user_id: string; role: Role; title: string | null; name: string; email: string | null; avatar: string | null }
interface Invite { id: string; email: string; role: Role; expires_at: string; code: string }

export function Members({ members, invites, myRole, myId, seatLimit, appUrl }: { members: Row[]; invites: Invite[]; myRole: Role; myId: string; seatLimit: number; appUrl: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const clip = useClipboard();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ email: string; role: Role }>({ email: '', role: 'contributor' });
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const invite = useAction(async () => postJson<{ link: string; emailed: boolean }>('/api/members/invite', f));
  const update = useAction(async (userId: string, patch: Record<string, unknown>) => postJson(`/api/members/${userId}`, patch, 'PATCH'), { success: 'Member updated' });
  const isOwner = myRole === 'owner';
  const canInvite = myRole === 'owner' || myRole === 'director';
  const counts = (['owner', 'director', 'contributor', 'auditor'] as Role[]).map((r) => ({ r, n: members.filter((m) => m.role === r).length }));
  async function revoke(id: string) {
    const { error } = await requireBrowserClient().from('invites').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else { toast('Invite revoked'); router.refresh(); }
  }
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map(({ r, n }) => (
          <li key={r} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="text-label-md">{ROLE_LABEL[r]}</p>
            <p className="text-body-sm text-on-surface-variant">{ROLE_DESCRIPTION[r]}</p>
            <p className="mt-1 text-label-sm tnum">{n} member{n === 1 ? '' : 's'}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-on-surface-variant tnum">{members.length + invites.length} of {seatLimit} seats used or reserved</p>
        {canInvite && <Button icon="person_add" onClick={() => { setResult(null); setOpen(true); }}>Invite</Button>}
      </div>
      <ul className="divide-y divide-outline-variant">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={m.name} src={m.avatar} size={32} />
              <span className="min-w-0"><span className="block truncate text-label-md">{m.name}{m.user_id === myId && ' (you)'}</span><span className="block truncate text-body-sm text-on-surface-variant">{m.email}{m.title ? ` · ${m.title}` : ''}</span></span>
            </span>
            {isOwner ? (
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`role-${m.user_id}`}>Role for {m.name}</label>
                <select id={`role-${m.user_id}`} value={m.role} disabled={update.pending} onChange={async (e) => { if (await update.run(m.user_id, { role: e.target.value })) router.refresh(); }}
                  className="h-9 rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                {m.user_id !== myId && <Button size="sm" variant="ghost" icon="person_remove" aria-label={`Remove ${m.name}`} onClick={() => setRemoving(m)} />}
              </span>
            ) : <span className="text-body-sm text-on-surface-variant">{ROLE_LABEL[m.role]}</span>}
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-label-xs uppercase text-on-surface-variant">Pending invites</h3>
          <ul className="divide-y divide-outline-variant">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-md">
                <span>{i.email} · {ROLE_LABEL[i.role]} <span className="text-body-sm text-on-surface-variant">· expires <TimeAgo date={i.expires_at} /></span></span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon="link" onClick={() => clip.copy(`${appUrl}/join/${i.code}`)}>Copy link</Button>
                  {canInvite && <Button size="sm" variant="ghost" icon="close" onClick={() => revoke(i.id)}>Revoke</Button>}
                </span>
              </li>
            ))}
          </ul>
          <span className="sr-only" aria-live="polite">{clip.status === 'copied' ? 'Invite link copied' : clip.status === 'error' ? 'Copy failed' : ''}</span>
          {clip.status !== 'idle' && <p className={`text-body-sm ${clip.status === 'error' ? 'text-alert' : 'text-healthy'}`}>{clip.status === 'copied' ? 'Link copied' : 'Could not copy — select the link manually'}</p>}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite a teammate"
        footer={result ? <Button onClick={() => { setOpen(false); router.refresh(); }}>Done</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={invite.pending} onClick={async () => { const r = await invite.run(); if (r) setResult(r); }}>Send invite</Button></>}>
        {result ? (
          <div className="grid gap-3">
            <Banner tone="info">{result.emailed ? `Invite emailed to ${f.email}.` : 'Email is not configured — share this link with them directly:'}</Banner>
            <code className="break-all rounded bg-surface-container-highest p-2 text-body-sm">{result.link}</code>
            <Button variant="secondary" icon="content_copy" onClick={() => clip.copy(result.link)}>{clip.status === 'copied' ? 'Copied' : clip.status === 'error' ? 'Copy failed' : 'Copy link'}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Input label="Work email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}
              options={(['director', 'contributor', 'auditor'] as Role[]).filter((r) => isOwner || r !== 'director').map((r) => ({ value: r, label: `${ROLE_LABEL[r]} — ${ROLE_DESCRIPTION[r]}` }))} />
            <InlineError message={invite.error} />
          </div>
        )}
      </Dialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name}?`} description="They lose access immediately. Their past work stays in the workspace."
        footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" loading={update.pending} onClick={async () => { if (removing && await update.run(removing.user_id, { status: 'removed' })) { setRemoving(null); router.refresh(); } }}>Remove member</Button></>}>
        <InlineError message={update.error} />
      </Dialog>
    </div>
  );
}
