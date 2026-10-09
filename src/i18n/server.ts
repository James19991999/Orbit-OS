import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getAuthContext } from '@/lib/context';
import { isLanguage, makeT, resolveLanguage, LANGUAGE_COOKIE, type Language } from './index';

/** Signed-in: the profile's language. Otherwise: the orbit_lang cookie, then Accept-Language, then English. */
export const getLanguage = cache(async (): Promise<Language> => {
  const auth = await getAuthContext().catch(() => null);
  if (auth?.profile && isLanguage(auth.profile.language)) return auth.profile.language;
  const [c, h] = await Promise.all([cookies(), headers()]);
  return resolveLanguage(c.get(LANGUAGE_COOKIE)?.value, h.get('accept-language'));
});

export async function getT() {
  return makeT(await getLanguage());
}
