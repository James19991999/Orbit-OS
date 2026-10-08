'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';

const KEY = 'orbit_tz_dismissed';

/** "Dynamic relocation": offers to update the profile time zone when the device reports a different one. */
export function TimezonePrompt({ userId, profileTz }: { userId: string; profileTz: string }) {
  const router = useRouter();
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let dismissed: string | null = null;
      try { dismissed = localStorage.getItem(KEY); } catch { /* storage blocked */ }
      if (tz && tz !== profileTz && dismissed !== tz) setDeviceTz(tz);
    } catch { /* Intl unavailable */ }
  }, [profileTz]);
  const update = useAction(async () => unwrap(await getBrowserClient()!.from('profiles').update({ timezone: deviceTz }).eq('id', userId).select('id')), { success: 'Time zone updated' });
  if (!deviceTz) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, deviceTz); } catch { /* ignore */ } setDeviceTz(null); };
  return (
    <div className="px-4 pt-4 lg:px-8">
      <Banner tone="info" icon="travel_explore">
        <span>Your device is set to <strong>{deviceTz.replace(/_/g, ' ')}</strong>, but your profile says <strong>{profileTz.replace(/_/g, ' ')}</strong>. Update it so scheduling uses your current location?</span>
        <span className="mt-2 flex gap-2">
          <Button size="sm" loading={update.pending} onClick={async () => { if (await update.run()) { setDeviceTz(null); router.refresh(); } }}>Update time zone</Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
        </span>
      </Banner>
    </div>
  );
}
