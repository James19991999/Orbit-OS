'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Dialog, Icon, Select, useToast, Segmented, cn } from '@/components/ui';
import { postJson, useAction, errorMessage } from '@/hooks/useAction';
import { PERIOD_LABEL, type PeriodKey } from '@/lib/reports/period';
import { useT } from '@/i18n/client';

export function PeriodPicker({ value }: { value: PeriodKey }) {
  const router = useRouter();
  const sp = useSearchParams();
  const t = useT();
  return (
    <Select label={t('rep.period')} value={value} onChange={(e) => { const q = new URLSearchParams(sp.toString()); q.set('period', e.target.value); router.push(`/reports?${q}`); }}
      options={(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => ({ value: k, label: t(`rep.period.${k}`) }))} />
  );
}

export function ExportMenu({ period, slackConnected, canDispatch }: { period: PeriodKey; slackConnected: boolean; canDispatch: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const dispatch = useAction(() => postJson('/api/reports/dispatch', { period }), { success: t('rep.slack_ok') });
  return (
    <>
      <Button icon="ios_share" variant="secondary" onClick={() => setOpen(true)}>{t('rep.export')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('rep.export_title')} description={t(`rep.period.${period}`)}>
        <div className="grid gap-2">
          <a href={`/api/reports/export?format=pdf&period=${period}`} className="flex items-center gap-3 rounded-lg border border-outline-variant p-3 hover:bg-on-surface/5">
            <Icon name="picture_as_pdf" className="text-alert" /><span><span className="block text-label-md">{t('rep.pdf')}</span><span className="text-body-sm text-on-surface-variant">PDF</span></span>
          </a>
          <a href={`/api/reports/export?format=csv&period=${period}`} className="flex items-center gap-3 rounded-lg border border-outline-variant p-3 hover:bg-on-surface/5">
            <Icon name="table_chart" className="text-healthy" /><span><span className="block text-label-md">{t('rep.csv')}</span><span className="text-body-sm text-on-surface-variant">CSV</span></span>
          </a>
          {canDispatch && (
            <button type="button" disabled={!slackConnected || dispatch.pending} onClick={async () => { if (await dispatch.run()) setOpen(false); }}
              className={cn('flex items-center gap-3 rounded-lg border border-outline-variant p-3 text-left', slackConnected ? 'hover:bg-on-surface/5' : 'opacity-60')}>
              <Icon name="send" className="text-secondary" />
              <span><span className="block text-label-md">{dispatch.pending ? t('rep.sending') : t('rep.dispatch')}</span>
                <span className="text-body-sm text-on-surface-variant">{slackConnected ? t('rep.slack_on') : t('rep.slack_off')}</span></span>
            </button>
          )}
          {dispatch.error && <p role="alert" className="text-body-sm text-alert">{dispatch.error}</p>}
        </div>
      </Dialog>
    </>
  );
}

export function ModuleTabs({ modules }: { modules: { id: string; label: string; content: React.ReactNode }[] }) {
  const [tab, setTab] = useState(modules[0].id);
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-x-auto"><Segmented label={t('rep.modules')} value={tab} onChange={setTab} options={modules.map((m) => ({ value: m.id, label: m.label }))} /></div>
      {modules.find((m) => m.id === tab)?.content}
    </div>
  );
}

export function AdoptInsight({ meetingId, newStart, label, canAdopt }: { meetingId: string; newStart: string; label: string; canAdopt: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canAdopt) return null;
  return (
    <>
      <Button size="sm" variant="secondary" icon="schedule_send" onClick={() => setConfirm(true)}>{t('rep.adopt')}</Button>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('rep.move_q')} description={label}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('rep.cancel')}</Button><Button loading={busy} onClick={async () => {
          setBusy(true);
          try { await postJson('/api/reports/insights/adopt', { meetingId, newStart }); toast(t('rep.moved')); setConfirm(false); router.refresh(); }
          catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(false); }
        }}>{t('rep.move')}</Button></>}>
        <p className="text-body-md">{t('rep.move_body')}</p>
      </Dialog>
    </>
  );
}
