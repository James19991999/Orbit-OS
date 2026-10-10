'use client';
/** Reports an error to Sentry from a client component, loading the SDK only when needed. */
export function captureClientError(error: unknown) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import('./sentry-browser').then((m) => { m.initSentry(); m.captureException(error); }).catch(() => undefined);
}
