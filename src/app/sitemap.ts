import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

// Public pages only. Each marketing page exists in English (/), Kiswahili (/sw) and French (/fr); every version
// lists the others, so search engines show people the right language.
const MARKETING: { path: string; priority: number; change: 'weekly' | 'monthly' }[] = [
  { path: '', priority: 1, change: 'weekly' },
  { path: '/pricing', priority: 0.9, change: 'monthly' },
  { path: '/security', priority: 0.6, change: 'monthly' },
  { path: '/trust', priority: 0.6, change: 'monthly' },
];
const LANGS = ['en', 'sw', 'fr'] as const;
const at = (lang: (typeof LANGS)[number], path: string) => (lang === 'en' ? path || '/' : `/${lang}${path}`);

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const lastModified = new Date(); // build time: the sitemap is regenerated on every deploy
  const marketing = MARKETING.flatMap(({ path, priority, change }) => LANGS.map((lang) => ({
    url: `${base}${at(lang, path)}`, lastModified, changeFrequency: change, priority: lang === 'en' ? priority : Math.round(priority * 90) / 100,
    alternates: { languages: { ...Object.fromEntries(LANGS.map((l) => [l, `${base}${at(l, path)}`])), 'x-default': `${base}${at('en', path)}` } },
  })));
  const other = ['/signup', '/login', '/legal/privacy', '/legal/terms'].map((p) => ({
    url: `${base}${p}`, lastModified, changeFrequency: 'monthly' as const, priority: p === '/signup' ? 0.7 : 0.3,
  }));
  return [...marketing, ...other];
}
