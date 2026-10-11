import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

const MARKETING = ['', '/pricing', '/security', '/trust'];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const localized = MARKETING.map((p) => ({
    url: `${base}${p || '/'}`, changeFrequency: 'monthly' as const, priority: p === '' ? 1 : 0.6,
    alternates: { languages: { en: `${base}${p || '/'}`, sw: `${base}/sw${p}`, fr: `${base}/fr${p}` } },
  }));
  const intl = ['sw', 'fr'].flatMap((l) => MARKETING.map((p) => ({ url: `${base}/${l}${p}`, changeFrequency: 'monthly' as const, priority: p === '' ? 0.9 : 0.5 })));
  const other = ['/legal/privacy', '/legal/terms', '/login', '/signup'].map((p) => ({ url: `${base}${p}`, changeFrequency: 'monthly' as const, priority: 0.4 }));
  return [...localized, ...intl, ...other];
}
