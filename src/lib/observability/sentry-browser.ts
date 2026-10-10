'use client';
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './sentry-options';

/** Loaded on demand (after the page is idle) so the ~130 KB SDK never delays the first paint. */
let started = false;
export function initSentry() {
  if (started) return;
  started = true;
  Sentry.init({
    ...sentryOptions(),
    // Browser extensions and flaky networks generate noise that isn't an OrbitOS bug.
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', 'Non-Error promise rejection captured', 'Load failed', 'NetworkError when attempting to fetch resource.'],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
  });
}
export const captureException = (e: unknown) => Sentry.captureException(e);
