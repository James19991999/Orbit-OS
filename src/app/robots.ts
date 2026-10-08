import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/pricing', '/security', '/trust', '/legal/'], disallow: ['/api/', '/dashboard', '/operations', '/scheduling', '/culture', '/compliance', '/reports', '/people', '/settings', '/profile', '/join/'] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
