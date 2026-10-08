import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/observability/sentry-options';

/** Runs once per server instance (Node and Edge). Sentry stays disabled without NEXT_PUBLIC_SENTRY_DSN. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryOptions());
  }
}

/** Uncaught errors in server components, route handlers, server actions and middleware. */
export const onRequestError = Sentry.captureRequestError;
