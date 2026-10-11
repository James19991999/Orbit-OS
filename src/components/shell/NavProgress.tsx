'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type Phase = 'idle' | 'loading' | 'done';

/**
 * Thin progress bar for in-app navigation. The current page stays on screen until the next one is ready,
 * instead of being swapped for placeholder boxes. Screen readers get aria-busy on <main> while it loads.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const busy = (on: boolean) => {
    const main = document.getElementById('main');
    if (!main) return;
    if (on) main.setAttribute('aria-busy', 'true'); else main.removeAttribute('aria-busy');
  };

  // The new route has rendered: finish the bar.
  useEffect(() => {
    setPhase((p) => (p === 'loading' ? 'done' : p));
    busy(false);
    clear();
    timers.current.push(setTimeout(() => setPhase('idle'), 350));
    return clear;
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page / #anchor
      clear();
      setPhase('loading');
      busy(true);
      // Never leave the bar stuck if a navigation is cancelled or fails.
      timers.current.push(setTimeout(() => { setPhase('idle'); busy(false); }, 20_000));
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-primary-container shadow-[0_0_8px_rgba(37,99,235,0.7)]"
        style={{
          width: phase === 'idle' ? '0%' : phase === 'loading' ? '85%' : '100%',
          opacity: phase === 'idle' ? 0 : 1,
          transition: phase === 'loading' ? 'width 6s cubic-bezier(0.1, 0.7, 0.2, 1), opacity 0.1s'
            : phase === 'done' ? 'width 0.2s ease-out, opacity 0.3s 0.15s' : 'none',
        }}
      />
    </div>
  );
}
