'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Icon } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import type { MessageKey } from '@/i18n/shared';
import { useT } from '@/i18n/client';

interface Step { target?: string; title: MessageKey; body: MessageKey }
const STEPS: Step[] = [
  { title: 'tour.welcome_t', body: 'tour.welcome_b' },
  { target: 'nav', title: 'tour.nav_t', body: 'tour.nav_b' },
  { target: 'search', title: 'tour.search_t', body: 'tour.search_b' },
  { target: 'bell', title: 'tour.bell_t', body: 'tour.bell_b' },
  { target: 'profile', title: 'tour.profile_t', body: 'tour.profile_b' },
  { title: 'tour.done_t', body: 'tour.done_b' },
];
const SEEN_KEY = 'orbit_tour_done';

/** The visible element for a step (desktop and phone layouts each mark their own). */
function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * First sign-in: a small, non-blocking invitation; the tour itself only starts if the person chooses it.
 * Remembered per person (profiles.tour_done_at). "Take the tour" in search replays it.
 */
export function ProductTour({ userId, done }: { userId: string; done: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const titleId = useId();
  const [prompt, setPrompt] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === userId; } catch { /* private mode */ }
    if (done || seen || !['/dashboard', '/my-day'].includes(pathname)) return;
    const id = setTimeout(() => setPrompt(true), 1200);
    return () => clearTimeout(id);
  }, [done, pathname, userId]);

  useEffect(() => {
    const start = () => { setPrompt(false); setStep(0); };
    window.addEventListener('orbit:tour', start);
    return () => window.removeEventListener('orbit:tour', start);
  }, []);

  const remember = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, userId); } catch { /* ignore */ }
    try { void Promise.resolve(getBrowserClient()?.from('profiles').update({ tour_done_at: new Date().toISOString() }).eq('id', userId)).catch(() => undefined); } catch { /* best effort */ }
  }, [userId]);
  const close = useCallback(() => { setStep(null); setPos(null); setPrompt(false); remember(); }, [remember]);

  // Follow the highlighted element (and window resizes).
  useLayoutEffect(() => {
    if (step === null) return;
    const update = () => setRect(findTarget(STEPS[step]!.target)?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step]);

  // Place the card next to the highlight, kept inside the screen.
  useLayoutEffect(() => {
    if (step === null || !card.current) return;
    const c = card.current.getBoundingClientRect();
    const vw = window.innerWidth; const vh = window.innerHeight; const m = 12;
    if (!rect) { setPos({ top: Math.max(m, (vh - c.height) / 2), left: Math.max(m, (vw - c.width) / 2) }); return; }
    let top = rect.bottom + m;
    let left = rect.left + rect.width / 2 - c.width / 2;
    if (rect.height > vh * 0.6) { top = Math.min(vh - c.height - m, rect.top + 80); left = rect.right + m; }   // tall sidebar: beside it
    if (top + c.height > vh - m) top = rect.top - c.height - m;                                             // bottom nav: above it
    setPos({ top: Math.max(m, Math.min(top, vh - c.height - m)), left: Math.max(m, Math.min(left, vw - c.width - m)) });
  }, [rect, step]);

  // Focus the main button once the card is placed (it's hidden until then, and hidden elements can't take focus).
  const placed = pos !== null;
  useEffect(() => {
    if (step !== null && placed) card.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus();
  }, [step, placed]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      else if (e.key === 'ArrowLeft') setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
      else if (e.key === 'Tab' && card.current) {
        // Keep focus inside the tour card.
        const f = [...card.current.querySelectorAll<HTMLElement>('button')];
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]?.focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, close]);

  if (step === null) {
    if (!prompt) return null;
    return (
      <div role="region" aria-label={t('tour.prompt_t')} className="fixed bottom-24 right-4 z-[55] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-outline-variant bg-surface-container-high p-4 shadow-l2 lg:bottom-6">
        <p className="flex items-center gap-2 text-label-md"><Icon name="tour" className="text-primary" />{t('tour.prompt_t')}</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">{t('tour.prompt_b')}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => { setPrompt(false); setStep(0); }}>{t('tour.prompt_go')}</Button>
          <Button size="sm" variant="ghost" onClick={close}>{t('tour.prompt_no')}</Button>
        </div>
      </div>
    );
  }

  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const pad = 6;
  return (
    <div className="fixed inset-0 z-[70]">
      {/* Dimmed page with a window around the highlighted element. */}
      {rect
        ? <div aria-hidden className="pointer-events-none fixed rounded-lg ring-2 ring-primary-container transition-all duration-200"
            style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(2,6,23,0.6)' }} />
        : <div aria-hidden className="fixed inset-0 bg-black/60" />}
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="fixed w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-outline-variant bg-surface-container-high p-5 shadow-l2"
        style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
        <p className="text-label-xs uppercase text-on-surface-variant" aria-live="polite">{t('tour.progress', { n: step + 1, total: STEPS.length })}</p>
        <h2 id={titleId} className="mt-1 text-headline-sm">{t(s.title)}</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">{t(s.body)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={close}>{t('tour.skip')}</Button>
          <div className="flex gap-2">
            {step > 0 && <Button size="sm" variant="secondary" onClick={() => setStep(step - 1)}>{t('tour.back')}</Button>}
            <Button size="sm" data-primary onClick={() => (last ? close() : setStep(step + 1))}>{t(last ? 'tour.finish' : 'tour.next')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
