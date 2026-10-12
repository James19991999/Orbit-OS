import { appUrl, contactEmail } from '@/lib/env';

// Vulnerability disclosure file (RFC 9116): tells researchers where to report a vulnerability.
export const dynamic = 'force-static';
export const revalidate = 86400;

export function GET() {
  const contact = contactEmail();
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const lines = [
    contact ? `Contact: mailto:${contact}` : `Contact: ${appUrl()}/security`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, sw, fr',
    `Policy: ${appUrl()}/security`,
    `Canonical: ${appUrl()}/.well-known/security.txt`,
  ];
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
