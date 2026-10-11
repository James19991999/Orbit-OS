'use client';
import { useEffect, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { FALLBACK, browserLanguage } from '@/i18n/fallback';
import type { Language } from '@/i18n/shared';

/**
 * 404 text, with the language picked in the browser. The root not-found is part of every route, so reading
 * cookies on the server here would make every public page dynamic (slower first load).
 */
export function NotFoundContent() {
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => { setLang(browserLanguage()); }, []);
  const s = FALLBACK[lang];
  return (
    <main id="main" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 text-center" lang={lang}>
      <p className="text-label-xs uppercase text-on-surface-variant">{s.nfCode}</p>
      <h1 className="mt-2 text-headline-lg">{s.nfTitle}</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">{s.nfBody}</p>
      <div className="mt-6 flex gap-3"><Link href="/dashboard" className="rounded bg-primary-container px-4 py-2.5 text-label-md text-white">{s.nfDash}</Link><Link href="/" className="rounded border border-outline-variant px-4 py-2.5 text-label-md">{s.nfHome}</Link></div>
    </main>
  );
}
