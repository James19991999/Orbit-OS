'use client';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { makeT, LANGUAGE_COOKIE, type Language, type T } from './index';

const Ctx = createContext<Language>('en');

/** Supplies the server-resolved language; also keeps <html lang> in step for screen readers. */
export function I18nProvider({ lang, children }: { lang: Language; children: React.ReactNode }) {
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
export function useT(): T {
  const lang = useContext(Ctx);
  return useMemo(() => makeT(lang), [lang]);
}

/** Remembers the language on this device (used before sign-in, e.g. on the login page). */
export function setLanguageCookie(lang: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
