import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return ['', '/pricing', '/security', '/trust', '/legal/privacy', '/legal/terms', '/login', '/signup'].map((p) => ({ url: `${base}${p}`, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.6 }));
}
