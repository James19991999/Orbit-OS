'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Pill, InlineError, Banner, Icon } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';
import { useClipboard } from '@/hooks/useClipboard';

export function Integrations({ slack, github, emailConfigured, canEdit, calendarSync }: { slack: boolean; github: boolean; emailConfigured: boolean; canEdit: boolean; calendarSync: boolean }) {
  const router = useRouter();
  const clip = useClipboard();
  const [url, setUrl] = useState('');
  const [gh, setGh] = useState<{ secret: string; payloadUrl: string } | null>(null);
  const saveSlack = useAction(async (webhook_url: string | null) => postJson('/api/integrations/slack', { webhook_url }, 'PUT'), { success: 'Slack updated' });
  const testSlack = useAction(async () => postJson('/api/integrations/slack/test'), { success: 'Test message posted to Slack' });
  const genGh = useAction(async () => postJson<{ secret: string; payloadUrl: string }>('/api/integrations/github'));
  const delGh = useAction(async () => postJson('/api/integrations/github', undefined, 'DELETE'), { success: 'GitHub disconnected' });
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
      <Row icon="chat" name="Slack" desc="Report dispatches and scheduled digests post to a channel through an incoming webhook." status={<Pill tone={slack ? 'healthy' : 'neutral'}>{slack ? 'Connected' : 'Not connected'}</Pill>}>
        {canEdit && (slack ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon="send" loading={testSlack.pending} onClick={() => testSlack.run()}>Send test</Button>
            <Button size="sm" variant="ghost" loading={saveSlack.pending} onClick={async () => { if (await saveSlack.run(null)) router.refresh(); }}>Disconnect</Button>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await saveSlack.run(url.trim())) { setUrl(''); router.refresh(); } }}>
            <Input label="Incoming webhook URL" placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-[16rem] flex-1" />
            <Button type="submit" size="sm" loading={saveSlack.pending}>Connect</Button>
          </form>
        ))}
        <InlineError message={saveSlack.error ?? testSlack.error} />
      </Row>
      <Row icon="terminal" name="GitHub" desc="Merged pull requests and pushes appear in Operations → Team Activity." status={<Pill tone={github ? 'healthy' : 'neutral'}>{github ? 'Connected' : 'Not connected'}</Pill>}>
        {canEdit && (
          <div className="flex flex-col gap-2">
            {gh && (
              <Banner tone="info">
                In GitHub → Settings → Webhooks, add: <br />Payload URL <code className="break-all">{gh.payloadUrl}</code><br />Content type <code>application/json</code><br />
                Secret <code className="break-all">{gh.secret}</code> (shown once)<br />Events: pull requests, pushes.
                <div className="mt-2"><Button size="sm" variant="secondary" icon="content_copy" onClick={() => clip.copy(gh.secret)}>{clip.status === 'copied' ? 'Copied' : clip.status === 'error' ? 'Copy failed' : 'Copy secret'}</Button></div>
              </Banner>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" loading={genGh.pending} onClick={async () => { const r = await genGh.run(); if (r) { setGh(r); router.refresh(); } }}>{github ? 'Rotate secret' : 'Connect GitHub'}</Button>
              {github && <Button size="sm" variant="ghost" loading={delGh.pending} onClick={async () => { if (await delGh.run()) { setGh(null); router.refresh(); } }}>Disconnect</Button>}
            </div>
            <InlineError message={genGh.error ?? delGh.error} />
          </div>
        )}
      </Row>
      <Row icon="calendar_month" name="Google Calendar & Outlook" desc={calendarSync ? 'Each person connects their own calendar in Profile: meetings appear in it, and the slot finder avoids busy times. Everyone else gets .ics email invites.' : 'Meeting invites are emailed as standard .ics files. Two-way calendar sync needs the Google/Microsoft app keys (docs/CALENDAR.md).'}
        status={<Pill tone={calendarSync || emailConfigured ? 'healthy' : 'warning'}>{calendarSync ? 'Two-way sync' : emailConfigured ? 'Via email invites' : 'Needs email set up'}</Pill>} />
      <Row icon="mail" name="Email (Resend)" desc="Invites, reminders, receipts and digests." status={<Pill tone={emailConfigured ? 'healthy' : 'warning'}>{emailConfigured ? 'Configured' : 'Not set up'}</Pill>} />
      <Row icon="cloud_sync" name="AWS CloudTrail" desc="Streaming infrastructure audit events into the security log." status={<Pill tone="neutral">Coming soon</Pill>} />
      <li className="sr-only" aria-live="polite">{clip.status === 'copied' ? 'Copied' : ''}</li>
    </ul>
  );
}
