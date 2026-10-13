'use client';
import { Button } from '@/components/ui';
import { useAction, postJson } from '@/hooks/useAction';

/** Founder Console: send the weekly summary email now (it also goes out by itself every Monday morning). */
export function WeeklyEmailButton() {
  const send = useAction(async () => postJson<{ sent: boolean; to: number }>('/api/founder/weekly', {}), { success: 'Weekly summary sent to your inbox' });
  return <Button size="sm" variant="secondary" icon="mail" loading={send.pending} onClick={() => void send.run()}>Email me this week’s summary</Button>;
}
