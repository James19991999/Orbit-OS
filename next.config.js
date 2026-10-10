/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseWs = supabaseUrl.replace(/^http/, 'ws'); // https→wss, http→ws (local)
// Browser Sentry events normally go through the same-origin /monitoring tunnel (sentry.io DSNs);
// the DSN origin is allowed too so self-hosted Sentry and tunnel fallbacks still report.
let sentryOrigin = '';
try { if (process.env.NEXT_PUBLIC_SENTRY_DSN) sentryOrigin = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin; } catch { /* invalid DSN → Sentry stays off */ }
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseUrl}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} ${sentryOrigin}`.replace(/\s+/g, ' ').trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://payment.intasend.com https://sandbox.intasend.com",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)' },
];

const nextConfig = {
  reactStrictMode: true,
  // Put <title>/<meta> in the <head> for every visitor (not streamed later), so link previews,
  // crawlers and audits always see them. Our metadata is static, so this costs no render time.
  htmlLimitedBots: /.*/,
  productionBrowserSourceMaps: process.env.ANALYZE_MAPS === '1',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Sentry error alerts — only wired in when a DSN is configured, so env-less builds are unchanged.
// Browser events go through same-origin /monitoring (tunnelRoute), so the CSP needs no Sentry host
// and ad-blockers don't drop reports. Source maps upload only when SENTRY_AUTH_TOKEN is also set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const { withSentryConfig } = require('@sentry/nextjs/config');
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    tunnelRoute: '/monitoring',
    widenClientFileUpload: true,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
    telemetry: false,
    webpack: { automaticVercelMonitors: false, treeshake: { removeDebugLogging: true } },
  });
} else {
  module.exports = nextConfig;
}
