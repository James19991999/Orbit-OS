// Browser-side error alerts. Off (nothing loaded) unless NEXT_PUBLIC_SENTRY_DSN was set at build time.
// The SDK is fetched once the page is idle, so it never competes with the first paint; errors thrown
// before then are still caught by the error boundaries, which load it on demand.
if (process.env.NEXT_PUBLIC_SENTRY_DSN && typeof window !== 'undefined') {
  const start = () => { void import('@/lib/observability/sentry-browser').then((m) => m.initSentry()); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 3000);
}
export {};
