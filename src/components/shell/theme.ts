'use client';
import { THEME_COOKIE } from '@/lib/env';

export type ThemePref = 'system' | 'dark' | 'light';

export function applyTheme(pref: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
  const t = pref === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
  document.documentElement.setAttribute('data-theme', t);
}
