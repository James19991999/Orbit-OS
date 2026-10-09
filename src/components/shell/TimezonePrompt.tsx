'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction, unwrap } from '@/hooks/useAction';
import { useT } from '@/i18n/client';

const KEY = 'orbit_tz_dismissed';

/** "Dynamic relocation": offers to update the profile time zone when the device reports a different one. */
export function TimezonePrompt({ userId, profileTz }: { userId: string; profileTz: string }) {
  const router = useRouter();
  const t = useT();
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let dismissed: string | null = null;
      try { dismissed = localStorage.getItem(KEY); } catch { /* storage blocked */ }
      if (tz && tz !== profileTz && dismissed !== tz) setDeviceTz(tz);
    } catch { /* Intl unavailable */ }
  }, [profileTz]);
  const update = useAction(async () => unwrap(await getBrowserClient()!.from('profiles').update({ timezone: deviceTz }).eq('id', userId).select('id')), { success: t('tz.updated') });
  if (!deviceTz) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, deviceTz); } catch { /* ignore */ } setDeviceTz(null); };
  return (
    <div className="px-4 pt-4 lg:px-8">
      <Banner tone="info" icon="travel_explore">
        <span>{t('tz.prompt', { device: deviceTz.replace(/_/g, ' '), profile: profileTz.replace(/_/g, ' ') })}</span>
        <span className="mt-2 flex gap-2">
          <Button size="sm" loading={update.pending} onClick={async () => { if (await update.run()) { setDeviceTz(null); router.refresh(); } }}>{t('tz.update')}</Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>{t('tz.not_now')}</Button>
        </span>
      </Banner>
    </div>
  );
}
