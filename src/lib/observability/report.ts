import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './sentry-options';

/**
 * Report an error that we caught and turned into a friendly response (so Next's own
 * onRequestError hook never sees it). No-op when Sentry isn't configured.
 */
export function reportError(error: unknown, context: { route?: string; method?: string; tags?: Record<string, string> } = {}) {
  if (!SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context.route) scope.setTag('route', context.route);
    if (context.method) scope.setTag('method', context.method);
    for (const [k, v] of Object.entries(context.tags ?? {})) scope.setTag(k, v);
    Sentry.captureException(error);
  });
}

/** Tag subsequent errors with who hit them (ids only, never email). */
export function setReportingUser(userId: string | null, orgId?: string) {
  if (!SENTRY_DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
  if (orgId) Sentry.setTag('org_id', orgId);
}
