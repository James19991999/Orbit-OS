'use client';
import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, LOCALE_COOKIE, makeFormatter, type Formatter } from './index';

const LocaleContext = createContext<{ locale: string; timeZone: string }>({ locale: DEFAULT_LOCALE, timeZone: 'UTC' });

/** Supplies the server-resolved locale so server and browser render identical text (no hydration mismatch). */
export function LocaleProvider({ locale, timeZone, children }: { locale: string; timeZone: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, timeZone }), [locale, timeZone]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useFormat(): Formatter {
  const { locale, timeZone } = useContext(LocaleContext);
  return useMemo(() => makeFormatter(locale, timeZone), [locale, timeZone]);
}

/** Saves the Region format choice for this browser ('' = follow the browser). */
export function setLocaleCookie(value: string) {
  document.cookie = value
    ? `${LOCALE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    : `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
