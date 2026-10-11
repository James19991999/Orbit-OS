'use client';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { makeClientT, LANGUAGE_COOKIE, type Language, type MessageKey, type Messages, type T } from './shared';

const Ctx = createContext<{ lang: Language; messages: Messages }>({ lang: 'en', messages: {} });

/** Supplies the server-resolved language and its strings; also keeps <html lang> in step for screen readers. */
export function I18nProvider({ lang, messages, children }: { lang: Language; messages: Messages; children: React.ReactNode }) {
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(() => ({ lang, messages }), [lang, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx).lang;
export function useT(): T {
  const { messages } = useContext(Ctx);
  return useMemo(() => makeClientT(messages), [messages]);
}

/** For shared UI primitives that can also render outside a provider: the translation, else the English given. */
export function useTOr(): (key: MessageKey, english: string) => string {
  const { messages } = useContext(Ctx);
  return (key, english) => messages[key] ?? english;
}

/** Remembers the language on this device (used before sign-in, e.g. on the login page). */
export function setLanguageCookie(lang: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
