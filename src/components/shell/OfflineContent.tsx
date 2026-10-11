'use client';
import { useEffect, useState } from 'react';
import { FALLBACK, browserLanguage } from '@/i18n/fallback';
import type { Language } from '@/i18n/shared';

/** Offline page body: static HTML (cached by the service worker), language picked in the browser. */
export function OfflineContent() {
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => { const l = browserLanguage(); setLang(l); document.documentElement.lang = l; }, []);
  const s = FALLBACK[lang];
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-headline-lg">{s.offline}</h1>
      <p className="text-body-md text-on-surface-variant">{s.needs}</p>
      <ul className="list-disc space-y-1 pl-5 text-body-md text-on-surface-variant">
        <li>{s.tip1}</li>
        <li>{s.tip2}</li>
      </ul>
      <a href="/dashboard" className="inline-flex h-11 w-fit items-center rounded bg-primary-container px-4 text-label-md text-white">{s.retry}</a>
    </main>
  );
}
