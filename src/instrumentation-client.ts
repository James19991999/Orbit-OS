import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/observability/sentry-options';

// Browser-side error alerts. Disabled (sends nothing) unless NEXT_PUBLIC_SENTRY_DSN was set at build time.
Sentry.init({
  ...sentryOptions(),
  // Browser extensions and flaky networks generate noise that isn't an OrbitOS bug.
  ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', 'Non-Error promise rejection captured', 'Load failed', 'NetworkError when attempting to fetch resource.'],
  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
