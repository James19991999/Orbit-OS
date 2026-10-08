'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from '@/components/ui';
import { requireBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';

export function MeetingActions({ meetingId, myRsvp, canManage }: { meetingId: string; myRsvp: string | null; canManage: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const rsvp = useAction(async (v: 'yes' | 'no' | 'maybe') => {
    const sb = requireBrowserClient();
    const { data: { user } } = await sb.auth.getUser();
    return unwrap(await sb.from('meeting_participants').update({ rsvp: v }).eq('meeting_id', meetingId).eq('user_id', user!.id).select('rsvp'));
  }, { success: 'RSVP saved' });
  const cancel = useAction(async () => unwrap(await requireBrowserClient().from('meetings').delete().eq('id', meetingId).select('id')), { success: 'Meeting cancelled' });
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
      {myRsvp !== null && (['yes', 'maybe', 'no'] as const).map((v) => (
        <Button key={v} size="sm" variant={myRsvp === v ? 'primary' : 'secondary'} aria-pressed={myRsvp === v} loading={rsvp.pending}
          onClick={async () => { if (await rsvp.run(v)) router.refresh(); }}>{v === 'yes' ? 'Going' : v === 'no' ? 'Not going' : 'Maybe'}</Button>
      ))}
      {canManage && <Button size="sm" variant="danger" icon="event_busy" className="ml-auto" onClick={() => setConfirm(true)}>Cancel meeting</Button>}
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Cancel this meeting?"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
          <Button variant="danger" loading={cancel.pending} onClick={async () => { if (await cancel.run()) { router.replace('/scheduling'); router.refresh(); } }}>Cancel meeting</Button></>}>
        <p className="text-body-md">It will be removed for all participants.</p>
      </Dialog>
    </div>
  );
}
