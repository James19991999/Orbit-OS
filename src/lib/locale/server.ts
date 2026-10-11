import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getAuthContext } from '@/lib/context';
import { LOCALE_COOKIE, makeFormatter, resolveLocale } from './index';
import { getLanguage } from '@/i18n/server';

/** The viewer's formatting locale for this request (cookie → Accept-Language → en-KE). */
export const getLocale = cache(async (): Promise<string> => {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return resolveLocale(c.get(LOCALE_COOKIE)?.value, h.get('accept-language'));
});

/** Formatter for this request: the viewer's region, and timestamps in their profile time zone. */
export async function getFormat() {
  const [locale, auth, lang] = await Promise.all([getLocale(), getAuthContext().catch(() => null), getLanguage()]);
  return makeFormatter(locale, auth?.profile?.timezone || 'UTC', lang);
}
