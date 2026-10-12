import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/pricing', '/security', '/trust', '/legal/'], disallow: ['/api/', '/auth/', '/dashboard', '/my-day', '/operations', '/scheduling', '/culture', '/compliance', '/reports', '/people', '/settings', '/profile', '/notifications', '/onboarding', '/mfa', '/join/', '/pay/', '/monitoring'] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
