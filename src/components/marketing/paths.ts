import type { Language } from '@/i18n/shared';

/** Marketing pages are statically rendered per language: English at "/", Kiswahili at "/sw", French at "/fr". */
export const MARKETING_LANGS = ['sw', 'fr'] as const;
export const localePath = (lang: Language, path: string) => (lang === 'en' ? path || '/' : `/${lang}${path === '/' ? '' : path}`);

/** hreflang alternates for a marketing path ("" for home). */
export function alternatesFor(lang: Language, path: string) {
  return {
    canonical: localePath(lang, path),
    languages: { en: localePath('en', path), sw: localePath('sw', path), fr: localePath('fr', path), 'x-default': localePath('en', path) },
  };
}
