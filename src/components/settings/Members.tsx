'use client';
import { useState } from 'react';
import { ImportButton } from '@/components/import/ImportDialog';
import { useRouter } from 'next/navigation';
import { Avatar, Button, Dialog, Input, Select, InlineError, Banner, useToast, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, postJson, errorMessage } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';

import { ROLE_LABEL } from '@/lib/roles';
import { roleName } from '@/lib/role-name';
import { useT } from '@/i18n/client';
import type { Role } from '@/lib/types';

interface Row { user_id: string; role: Role; title: string | null; name: string; email: string | null; avatar: string | null }
interface Invite { id: string; email: string; role: Role; expires_at: string; code: string }

export function Members({ members, invites, myRole, myId, seatLimit, appUrl }: { members: Row[]; invites: Invite[]; myRole: Role; myId: string; seatLimit: number; appUrl: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const clip = useClipboard();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ email: string; role: Role }>({ email: '', role: 'contributor' });
  const [result, setResult] = useState<{ link: string; emailed: boolean } | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const invite = useAction(async () => postJson<{ link: string; emailed: boolean }>('/api/members/invite', f));
  const update = useAction(async (userId: string, patch: Record<string, unknown>) => postJson(`/api/members/${userId}`, patch, 'PATCH'), { success: t('mem.updated') });
  const isOwner = myRole === 'owner';
  const canInvite = myRole === 'owner' || myRole === 'director';
  const counts = (['owner', 'director', 'contributor', 'auditor'] as Role[]).map((r) => ({ r, n: members.filter((m) => m.role === r).length }));
  async function revoke(id: string) {
    const { error } = await requireBrowserClient().from('invites').delete().eq('id', id);
    if (error) toast(errorMessage(error), 'error'); else { toast(t('mem.revoked')); router.refresh(); }
  }
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map(({ r, n }) => (
          <li key={r} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="text-label-md">{roleName(t, r)}</p>
            <p className="text-body-sm text-on-surface-variant">{t(`role.desc.${r}`)}</p>
            <p className="mt-1 text-label-sm tnum">{t('mem.count', { count: n })}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm text-on-surface-variant tnum">{t('mem.seats', { used: members.length + invites.length, limit: seatLimit })}</p>
        {canInvite && (
          <div className="flex flex-wrap items-center gap-2">
            <ImportButton kind="people" memberEmails={members.map((m) => m.email ?? '').filter(Boolean)} seatsFree={Math.max(0, seatLimit - members.length - invites.length)} />
            <Button icon="person_add" onClick={() => { setResult(null); setOpen(true); }}>{t('mem.invite')}</Button>
          </div>
        )}
      </div>
      <ul className="divide-y divide-outline-variant">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={m.name} src={m.avatar} size={32} />
              <span className="min-w-0"><span className="block truncate text-label-md">{m.name}{m.user_id === myId && t('mem.you')}</span><span className="block truncate text-body-sm text-on-surface-variant">{m.email}{m.title ? ` · ${m.title}` : ''}</span></span>
            </span>
            {isOwner ? (
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`role-${m.user_id}`}>{t('mem.role_for', { name: m.name })}</label>
                <select id={`role-${m.user_id}`} value={m.role} disabled={update.pending} onChange={async (e) => { if (await update.run(m.user_id, { role: e.target.value })) router.refresh(); }}
                  className="h-9 rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{roleName(t, r)}</option>)}
                </select>
                {m.user_id !== myId && <Button size="sm" variant="ghost" icon="person_remove" aria-label={t('mem.remove', { name: m.name })} onClick={() => setRemoving(m)} />}
              </span>
            ) : <span className="text-body-sm text-on-surface-variant">{roleName(t, m.role)}</span>}
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <div>
          <h3 className="mb-2 text-label-xs uppercase text-on-surface-variant">{t('mem.pending')}</h3>
          <ul className="divide-y divide-outline-variant">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-md">
                <span>{i.email} · {roleName(t, i.role)} <span className="text-body-sm text-on-surface-variant">· {t('mem.expires')} <TimeAgo date={i.expires_at} /></span></span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon="link" onClick={() => clip.copy(`${appUrl}/join/${i.code}`)}>{t('set.copy_link')}</Button>
                  {canInvite && <Button size="sm" variant="ghost" icon="close" onClick={() => revoke(i.id)}>{t('mem.revoke')}</Button>}
                </span>
              </li>
            ))}
          </ul>
          <span className="sr-only" aria-live="polite">{clip.status === 'copied' ? t('mem.link_copied') : clip.status === 'error' ? t('set.copy_failed') : ''}</span>
          {clip.status !== 'idle' && <p className={`text-body-sm ${clip.status === 'error' ? 'text-alert' : 'text-healthy'}`}>{clip.status === 'copied' ? t('mem.copied') : t('mem.copy_manual')}</p>}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('mem.title')}
        footer={result ? <Button onClick={() => { setOpen(false); router.refresh(); }}>{t('mem.done')}</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>{t('set.cancel')}</Button><Button loading={invite.pending} onClick={async () => { const r = await invite.run(); if (r) setResult(r); }}>{t('mem.send')}</Button></>}>
        {result ? (
          <div className="grid gap-3">
            <Banner tone="info">{result.emailed ? t('mem.emailed', { email: f.email }) : t('mem.no_email')}</Banner>
            <code className="break-all rounded bg-surface-container-highest p-2 text-body-sm">{result.link}</code>
            <Button variant="secondary" icon="content_copy" onClick={() => clip.copy(result.link)}>{clip.status === 'copied' ? t('set.copied') : clip.status === 'error' ? t('set.copy_failed') : t('set.copy_link')}</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Input label={t('mem.email')} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <Select label={t('mem.role')} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}
              options={(['director', 'contributor', 'auditor'] as Role[]).filter((r) => isOwner || r !== 'director').map((r) => ({ value: r, label: `${roleName(t, r)} — ${t(`role.desc.${r}`)}` }))} />
            <InlineError message={invite.error} />
          </div>
        )}
      </Dialog>
      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={t('mem.remove_q', { name: removing?.name ?? '' })} description={t('mem.remove_desc')}
        footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>{t('set.cancel')}</Button><Button variant="danger" loading={update.pending} onClick={async () => { if (removing && await update.run(removing.user_id, { status: 'removed' })) { setRemoving(null); router.refresh(); } }}>{t('mem.remove_go')}</Button></>}>
        <InlineError message={update.error} />
      </Dialog>
    </div>
  );
}
