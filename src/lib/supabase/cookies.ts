import { REMEMBER_MAX_AGE } from '@/lib/env';

type CookieOpts = { maxAge?: number; expires?: Date; [k: string]: unknown };

/**
 * "Remember this device for 30 days": remembered sessions persist 30 days; otherwise auth
 * cookies become browser-session cookies (cleared when the browser closes).
 */
export function applyRemember<T extends CookieOpts>(options: T | undefined, remember: boolean): T {
  const o = { ...(options ?? {}) } as T;
  if (o.maxAge === 0) return o; // deletion
  if (remember) {
    o.maxAge = REMEMBER_MAX_AGE;
  } else {
    delete o.maxAge;
    delete o.expires;
  }
  return o;
}
