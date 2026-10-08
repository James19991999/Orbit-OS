import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Shared Sentry settings for browser, Node and Edge runtimes.
 * Error alerts only: no performance tracing and no session replay, which keeps the app inside
 * Sentry's free tier and avoids recording what people type. Everything is off unless
 * NEXT_PUBLIC_SENTRY_DSN is set, so local dev and env-less builds send nothing.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export function sentryOptions() {
  return {
    dsn: SENTRY_DSN || undefined,
    enabled: Boolean(SENTRY_DSN),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}

const SECRET_HEADERS = ['cookie', 'authorization', 'x-intasend-public-api-key', 'x-supabase-auth'];
const SECRET_QUERY = /([?&](?:token|token_hash|code|access_token|refresh_token|challenge)=)[^&#]*/gi;

/** Strips cookies, auth headers and one-time tokens before an event leaves the server or browser. */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  const req = event.request;
  if (req) {
    delete req.cookies;
    if (req.headers) for (const h of Object.keys(req.headers)) if (SECRET_HEADERS.includes(h.toLowerCase())) delete req.headers[h];
    if (typeof req.url === 'string') req.url = req.url.replace(SECRET_QUERY, '$1[redacted]');
    if (typeof req.query_string === 'string') req.query_string = req.query_string.replace(/((?:^|&)(?:token|token_hash|code|access_token|refresh_token|challenge)=)[^&]*/gi, '$1[redacted]');
    delete req.data;
  }
  if (event.user) event.user = { id: event.user.id };
  return event;
}
