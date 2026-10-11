'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Pill, InlineError, Banner, Icon } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';
import { useT } from '@/i18n/client';

export function Integrations({ slack, github, emailConfigured, canEdit, calendarSync }: { slack: boolean; github: boolean; emailConfigured: boolean; canEdit: boolean; calendarSync: boolean }) {
  const router = useRouter();
  const clip = useClipboard();
  const t = useT();
  const [url, setUrl] = useState('');
  const [gh, setGh] = useState<{ secret: string; payloadUrl: string } | null>(null);
  const saveSlack = useAction(async (webhook_url: string | null) => postJson('/api/integrations/slack', { webhook_url }, 'PUT'), { success: t('int.slack_ok') });
  const testSlack = useAction(async () => postJson('/api/integrations/slack/test'), { success: t('int.slack_test_ok') });
  const genGh = useAction(async () => postJson<{ secret: string; payloadUrl: string }>('/api/integrations/github'));
  const delGh = useAction(async () => postJson('/api/integrations/github', undefined, 'DELETE'), { success: t('int.gh_off') });
  const Row = ({ icon, name, desc, status, children }: { icon: string; name: string; desc: string; status: React.ReactNode; children?: React.ReactNode }) => (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-label-md"><Icon name={icon} className="text-secondary" />{name}</p>{status}
      </div>
      <p className="mt-1 text-body-sm text-on-surface-variant">{desc}</p>
      {children && <div className="mt-2">{children}</div>}
    </li>
  );
  return (
    <ul className="divide-y divide-outline-variant">
      <Row icon="chat" name="Slack" desc={t('int.slack_desc')} status={<Pill tone={slack ? 'healthy' : 'neutral'}>{slack ? t('set.connected') : t('set.not_connected')}</Pill>}>
        {canEdit && (slack ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon="send" loading={testSlack.pending} onClick={() => testSlack.run()}>{t('int.test')}</Button>
            <Button size="sm" variant="ghost" loading={saveSlack.pending} onClick={async () => { if (await saveSlack.run(null)) router.refresh(); }}>{t('set.disconnect')}</Button>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await saveSlack.run(url.trim())) { setUrl(''); router.refresh(); } }}>
            <Input label={t('int.webhook')} placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-[16rem] flex-1" />
            <Button type="submit" size="sm" loading={saveSlack.pending}>{t('set.connect')}</Button>
          </form>
        ))}
        <InlineError message={saveSlack.error ?? testSlack.error} />
      </Row>
      <Row icon="terminal" name="GitHub" desc={t('int.gh_desc')} status={<Pill tone={github ? 'healthy' : 'neutral'}>{github ? t('set.connected') : t('set.not_connected')}</Pill>}>
        {canEdit && (
          <div className="flex flex-col gap-2">
            {gh && (
              <Banner tone="info">
                {t('int.gh_steps')} <br />{t('int.gh_payload')} <code className="break-all">{gh.payloadUrl}</code><br />{t('int.gh_type')} <code>application/json</code><br />
                {t('int.gh_secret')} <code className="break-all">{gh.secret}</code> {t('int.gh_once')}<br />{t('int.gh_events')}
                <div className="mt-2"><Button size="sm" variant="secondary" icon="content_copy" onClick={() => clip.copy(gh.secret)}>{clip.status === 'copied' ? t('set.copied') : clip.status === 'error' ? t('set.copy_failed') : t('int.copy_secret')}</Button></div>
              </Banner>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" loading={genGh.pending} onClick={async () => { const r = await genGh.run(); if (r) { setGh(r); router.refresh(); } }}>{github ? t('int.rotate') : t('int.gh_connect')}</Button>
              {github && <Button size="sm" variant="ghost" loading={delGh.pending} onClick={async () => { if (await delGh.run()) { setGh(null); router.refresh(); } }}>{t('set.disconnect')}</Button>}
            </div>
            <InlineError message={genGh.error ?? delGh.error} />
          </div>
        )}
      </Row>
      <Row icon="calendar_month" name="Google Calendar & Outlook" desc={calendarSync ? t('int.cal_on') : t('int.cal_off')}
        status={<Pill tone={calendarSync || emailConfigured ? 'healthy' : 'warning'}>{calendarSync ? t('int.two_way') : emailConfigured ? t('int.via_email') : t('int.needs_email')}</Pill>} />
      <Row icon="mail" name={t('int.email')} desc={t('int.email_desc')} status={<Pill tone={emailConfigured ? 'healthy' : 'warning'}>{emailConfigured ? t('int.configured') : t('int.not_set')}</Pill>} />
      <Row icon="cloud_sync" name="AWS CloudTrail" desc={t('int.aws_desc')} status={<Pill tone="neutral">{t('int.soon')}</Pill>} />
      <li className="sr-only" aria-live="polite">{clip.status === 'copied' ? t('set.copied') : ''}</li>
    </ul>
  );
}
