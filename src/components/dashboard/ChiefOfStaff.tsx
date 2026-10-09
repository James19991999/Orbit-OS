'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Banner, Icon, InlineError, Pill, TimeAgo } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export interface BriefView { id: string; kind: 'weekly' | 'checkins'; content: string; source: 'ai' | 'rules'; created_at: string }

/** Weekly founder brief + on-demand check-in summary. Owner opt-in, because workspace data goes to Claude. */
export function ChiefOfStaff({ enabled, isOwner, brief }: { enabled: boolean; isOwner: boolean; brief: BriefView | null }) {
  const t = useT();
  const router = useRouter();
  const [shown, setShown] = useState<BriefView | null>(brief);
  const [which, setWhich] = useState<'weekly' | 'checkins' | null>(null);
  const toggle = useAction(async (on: boolean) => postJson('/api/settings/auth', { ai_enabled: on }, 'PATCH'));
  const gen = useAction(async (kind: 'weekly' | 'checkins') => postJson<{ brief: BriefView }>('/api/ai/brief', { kind }), { success: t('ai.generated') });

  if (!enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body-md text-on-surface-variant">{t('ai.sub')}</p>
        {isOwner ? (
          <>
            <Banner tone="info" icon="shield">{t('ai.privacy')}</Banner>
            <div><Button icon="auto_awesome" loading={toggle.pending} onClick={async () => { if (await toggle.run(true)) router.refresh(); }}>{t('ai.enable')}</Button></div>
          </>
        ) : <p className="text-body-sm text-on-surface-variant">{t('ai.owner_only')}</p>}
        <InlineError message={toggle.error} />
      </div>
    );
  }
  const current = shown ?? brief;
  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <article aria-label={t(`ai.kind.${current.kind}`)} className="rounded border border-outline-variant bg-surface-container-low p-4">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-label-xs uppercase text-on-surface-variant">
            {t(`ai.kind.${current.kind}`)} · <TimeAgo date={current.created_at} />
            <Pill tone={current.source === 'ai' ? 'info' : 'neutral'}>{current.source === 'ai' ? t('ai.source_ai') : t('ai.source_rules')}</Pill>
          </p>
          <div data-testid="brief" className="whitespace-pre-line text-body-md text-on-surface">{current.content}</div>
        </article>
      ) : <p className="text-body-md text-on-surface-variant">{t('ai.empty')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="auto_awesome" loading={gen.pending && which === 'weekly'} disabled={gen.pending}
          onClick={async () => { setWhich('weekly'); const r = await gen.run('weekly'); if (r) setShown(r.brief); }}>{t('ai.generate')}</Button>
        <Button size="sm" variant="secondary" icon="summarize" loading={gen.pending && which === 'checkins'} disabled={gen.pending}
          onClick={async () => { setWhich('checkins'); const r = await gen.run('checkins'); if (r) setShown(r.brief); }}>{t('ai.summarize')}</Button>
        {isOwner && <Button size="sm" variant="ghost" loading={toggle.pending} onClick={async () => { if (await toggle.run(false)) router.refresh(); }}>{t('ai.disable')}</Button>}
      </div>
      <p className="flex items-start gap-1.5 text-body-sm text-on-surface-variant"><Icon name="info" className="text-[16px]" />{t('ai.sub')}</p>
      <InlineError message={gen.error ?? toggle.error} />
    </div>
  );
}
