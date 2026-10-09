'use client';
import { useEffect } from 'react';

/** Registers /sw.js in production builds (installable app + offline page). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('service worker registration failed', e));
  }, []);
  return null;
}
