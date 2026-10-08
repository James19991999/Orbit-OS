'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, InlineError } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { errorMessage, postJson } from '@/hooks/useAction';

export function AcceptInvite({ code, signedInAs }: { code: string; signedInAs: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserClient()!;
      const { data: orgId, error: e } = await supabase.rpc('redeem_invite', { p_code: code });
      if (e) throw e;
      const { data: org } = await supabase.from('organizations').select('slug').eq('id', orgId as string).single();
      if (org) await postJson('/api/org/switch', { slug: org.slug });
      router.replace('/dashboard?welcome=1');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-on-surface-variant">Signed in as {signedInAs}</p>
      <Button onClick={accept} loading={busy}>Accept invite</Button>
      <InlineError message={error} />
    </div>
  );
}
