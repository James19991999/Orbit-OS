import localFont from 'next/font/local';

// Geist, subset to Latin (English, Kiswahili, French, currency symbols) by scripts/build-icon-font.py:
// half the size of the full variable fonts. Mono is used in a few places only, so it isn't preloaded.
export const sans = localFont({
  src: './fonts/geist-sans-latin.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'optional',
  fallback: ['ui-sans-serif', 'system-ui', 'Arial'],
  adjustFontFallback: 'Arial',
});
export const mono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'monospace'],
});
// Material Symbols, subset to the icons the app uses (scripts/build-icon-font.py). Preloaded so icons
// appear with the first paint; `block` avoids flashing the ligature words ("notifications") as text.
export const icons = localFont({
  src: './fonts/material-symbols-subset.woff2',
  variable: '--font-icons',
  weight: '400',
  display: 'block',
  fallback: [],
  adjustFontFallback: false,
});
