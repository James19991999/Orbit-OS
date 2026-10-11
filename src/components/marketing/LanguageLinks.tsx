'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { LANGUAGES, type Language } from '@/i18n/shared';
import { setLanguageCookie } from '@/i18n/client';
import { localePath } from './paths';

/** EN · SW · FR switcher: same page in another language, and remembers the choice for sign-in and the app. */
export function LanguageLinks({ lang, label }: { lang: Language; label: string }) {
  const path = usePathname() || '/';
  const bare = lang === 'en' ? path : path.replace(new RegExp(`^/${lang}(?=/|$)`), '') || '/';
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-label-sm">
      {LANGUAGES.map((l) => (
        <a key={l.value} href={localePath(l.value, bare)} lang={l.value} hrefLang={l.value} aria-current={l.value === lang ? 'true' : undefined}
          onClick={() => setLanguageCookie(l.value)}
          className={`rounded px-2 py-1 uppercase ${l.value === lang ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
          title={l.label}>{l.value}</a>
      ))}
    </nav>
  );
}

/** Keeps <html lang> right on /sw and /fr pages (the root layout is shared and static). */
export function HtmlLang({ lang }: { lang: Language }) {
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return null;
}
