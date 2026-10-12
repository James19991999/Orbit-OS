'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

/** Hides the checklist for this workspace on this browser (a cookie, so the server renders without it). */
export function HideGettingStarted({ orgId, label, ariaLabel }: { orgId: string; label: string; ariaLabel: string }) {
  const router = useRouter();
  return (
    <Button size="sm" variant="ghost" icon="close" aria-label={ariaLabel} onClick={() => {
      const cur = document.cookie.match(/(?:^|; )orbit_gs_hidden=([^;]*)/)?.[1] ?? '';
      const ids = new Set(decodeURIComponent(cur).split(',').filter(Boolean)).add(orgId);
      document.cookie = `orbit_gs_hidden=${encodeURIComponent([...ids].slice(-20).join(','))}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }}>{label}</Button>
  );
}
