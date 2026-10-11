'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Pill, Dialog, Textarea, Select, useToast, type Tone, TimeAgo } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { errorMessage } from '@/hooks/useAction';

import { FileUpload, openSigned } from './FileUpload';
import type { Control, ControlStatus, Evidence } from '@/lib/types';
import { useT } from '@/i18n/client';

const STATUS: Record<ControlStatus, { tone: Tone }> = {
  passing: { tone: 'healthy' }, failing: { tone: 'alert' }, in_review: { tone: 'warning' },
  not_started: { tone: 'neutral' }, not_applicable: { tone: 'neutral' },
};

export function ControlsTable({ orgId, controls: initial, evidence, people, canManage }:
  { orgId: string; controls: Control[]; evidence: Evidence[]; people: { id: string; name: string }[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const label = (s: ControlStatus) => t(`cmp.st.${s}`);
  const [controls, setControls] = useState(initial);
  const [filter, setFilter] = useState<'all' | ControlStatus>('all');
  const [detail, setDetail] = useState<Control | null>(null);
  const [notes, setNotes] = useState('');
  async function patch(id: string, values: Partial<Control>) {
    const before = controls;
    const stamped = 'status' in values ? { ...values, last_reviewed_at: new Date().toISOString() } : values;
    setControls((s) => s.map((c) => (c.id === id ? { ...c, ...stamped } : c)));
    const { error } = await requireBrowserClient().from('compliance_controls').update(stamped).eq('id', id);
    if (error) { setControls(before); toast(errorMessage(error), 'error'); return false; }
    return true;
  }
  const shown = controls.filter((c) => filter === 'all' || c.status === filter);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? t('cmp.ct.unassigned');
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Select label={t('cmp.ct.show')} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          options={[{ value: 'all', label: t('cmp.ct.all', { n: controls.length }) }, ...(Object.keys(STATUS) as ControlStatus[]).map((s) => ({ value: s, label: t('cmp.ct.opt', { label: label(s), n: controls.filter((c) => c.status === s).length }) }))]} />
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full text-left text-body-md">
          <thead><tr className="border-b border-outline-variant text-label-xs uppercase text-on-surface-variant">
            <th scope="col" className="py-2 pr-3">{t('cmp.ct.control')}</th><th scope="col" className="py-2 pr-3">{t('cmp.ct.owner')}</th><th scope="col" className="py-2 pr-3">{t('cmp.ct.status')}</th><th scope="col" className="py-2 pr-3">{t('cmp.ct.reviewed')}</th><th scope="col" className="py-2">{t('cmp.ct.evidence')}</th>
          </tr></thead>
          <tbody>
            {shown.map((c) => {
              const ev = evidence.filter((e) => e.control_id === c.id);
              return (
                <tr key={c.id} className="border-b border-outline-variant align-top last:border-0 hover:bg-on-surface/[0.03]">
                  <td className="py-2 pr-3"><button type="button" onClick={() => { setDetail(c); setNotes(c.notes ?? ''); }} className="text-left hover:underline"><span className="font-mono text-body-sm text-on-surface-variant">{c.ref}</span><br />{c.title}</button></td>
                  <td className="py-2 pr-3">
                    {canManage ? (
                      <select aria-label={t('cmp.ct.owner_of', { ref: c.ref })} value={c.owner_id ?? ''} onChange={(e) => patch(c.id, { owner_id: e.target.value || null })} className="h-8 max-w-[10rem] rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm">
                        <option value="">{t('cmp.ct.unassigned')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : name(c.owner_id)}
                  </td>
                  <td className="py-2 pr-3">
                    {canManage ? (
                      <select aria-label={t('cmp.ct.status_of', { ref: c.ref })} value={c.status} onChange={(e) => patch(c.id, { status: e.target.value as ControlStatus }).then((ok) => ok && router.refresh())} className="h-8 rounded border border-outline-variant bg-surface-container-lowest px-2 text-body-sm">
                        {(Object.keys(STATUS) as ControlStatus[]).map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                    ) : <Pill tone={STATUS[c.status].tone}>{label(c.status)}</Pill>}
                  </td>
                  <td className="py-2 pr-3 text-body-sm text-on-surface-variant">{c.last_reviewed_at ? <TimeAgo date={c.last_reviewed_at} /> : t('cmp.ct.never')}</td>
                  <td className="py-2 text-body-sm">{ev.length ? t('cmp.ct.files', { count: ev.length }) : <span className="text-on-surface-variant">{t('cmp.ct.none')}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.ref} — ${detail.title}` : ''} wide
        footer={canManage ? <Button onClick={async () => { if (detail && await patch(detail.id, { notes: notes.trim() || null })) { toast(t('cmp.ct.notes_saved')); setDetail(null); } }}>{t('cmp.ct.save_notes')}</Button> : undefined}>
        {detail && (
          <div className="grid gap-4">
            <p className="text-body-md">{t('cmp.ct.owner_line')} <strong>{name(detail.owner_id)}</strong> · {t('cmp.ct.status_line')} <Pill tone={STATUS[detail.status].tone}>{label(detail.status)}</Pill></p>
            <Textarea label={t('cmp.ct.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} readOnly={!canManage} rows={4} />
            <div>
              <p className="mb-2 text-label-sm text-on-surface-variant">{t('cmp.ct.evidence')}</p>
              <ul className="mb-2 divide-y divide-outline-variant text-body-md">
                {evidence.filter((e) => e.control_id === detail.id).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="truncate">{e.file_name} <span className="text-body-sm text-on-surface-variant">· <TimeAgo date={e.created_at} /></span></span>
                    <Button size="sm" variant="ghost" onClick={() => openSigned('evidence', e.file_path).catch((er) => toast(errorMessage(er), 'error'))}>{t('cmp.open')}</Button>
                  </li>
                ))}
              </ul>
              {canManage && <FileUpload bucket="evidence" prefix={orgId} label={t('cmp.ct.attach')} onUploaded={async (path, fileName) => {
                const { error } = await requireBrowserClient().from('compliance_evidence').insert({ org_id: orgId, control_id: detail.id, file_path: path, file_name: fileName });
                if (error) throw error;
                router.refresh();
              }} />}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
