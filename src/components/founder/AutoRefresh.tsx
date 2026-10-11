'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetches the console every 60 s while the tab is visible, so "online now" and the numbers stay live. */
export function AutoRefresh({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const iv = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 60_000);
    return () => clearInterval(iv);
  }, [on, router]);
  const time = new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="flex flex-wrap items-center gap-3 text-body-sm text-on-surface-variant">
      <span className="flex items-center gap-1.5" suppressHydrationWarning>
        <span className={`h-2 w-2 rounded-full ${on ? 'bg-healthy pulse-dot' : 'bg-outline'}`} aria-hidden />Updated {time}
      </span>
      <button type="button" onClick={() => setOn((v) => !v)} aria-pressed={on}
        className="rounded border border-outline-variant px-2 py-1 text-label-sm hover:bg-on-surface/5">{on ? 'Auto-refresh on' : 'Auto-refresh off'}</button>
      <button type="button" onClick={() => router.refresh()} className="rounded border border-outline-variant px-2 py-1 text-label-sm hover:bg-on-surface/5">Refresh now</button>
    </div>
  );
}
