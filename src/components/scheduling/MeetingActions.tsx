'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap, postJson } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

export function MeetingActions({ meetingId, myRsvp, canManage }: { meetingId: string; myRsvp: string | null; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const rsvp = useAction(async (v: 'yes' | 'no' | 'maybe') => {
    const sb = requireBrowserClient();
    const { data: { user } } = await sb.auth.getUser();
    const r = unwrap(await sb.from('meeting_participants').update({ rsvp: v }).eq('meeting_id', meetingId).eq('user_id', user!.id).select('rsvp'));
    // Declining takes it out of your connected calendar; accepting puts it back. Best effort.
    await postJson(`/api/meetings/${meetingId}/sync`).catch(() => undefined);
    return r;
  }, { success: t('mtg.rsvp_saved') });
  const cancel = useAction(async () => postJson(`/api/meetings/${meetingId}`, undefined, 'DELETE'), { success: t('mtg.cancelled_toast') });
  const label = { yes: t('mtg.going'), no: t('mtg.not_going'), maybe: t('mtg.maybe') };
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
      {myRsvp !== null && (['yes', 'maybe', 'no'] as const).map((v) => (
        <Button key={v} size="sm" variant={myRsvp === v ? 'primary' : 'secondary'} aria-pressed={myRsvp === v} loading={rsvp.pending}
          onClick={async () => { if (await rsvp.run(v)) router.refresh(); }}>{label[v]}</Button>
      ))}
      {canManage && <Button size="sm" variant="danger" icon="event_busy" className="ml-auto" onClick={() => setConfirm(true)}>{t('mtg.cancel')}</Button>}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('mtg.cancel_title')}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{t('mtg.keep')}</Button>
          <Button variant="danger" loading={cancel.pending} onClick={async () => { if (await cancel.run()) { router.replace('/scheduling'); router.refresh(); } }}>{t('mtg.cancel')}</Button></>}>
        <p className="text-body-md">{t('mtg.cancel_body')}</p>
      </Dialog>
    </div>
  );
}
