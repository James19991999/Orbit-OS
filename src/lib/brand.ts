// Workspace accent colour: turns one brand colour into theme-safe shades that keep WCAG AA contrast.
type RGB = [number, number, number];

export const BRAND_PRESETS = ['#2563eb', '#0f766e', '#15803d', '#b45309', '#be123c', '#7c3aed', '#0e7490', '#1f2937'] as const;

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
const mix = (c: RGB, to: RGB, t: number): RGB => c.map((v, i) => Math.round(v + (to[i]! - v) * t)) as RGB;

/** Moves a colour towards black or white in small steps until it reaches the contrast target against `against`. */
function untilContrast(c: RGB, against: RGB, target: number, toward: RGB): RGB {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const v = mix(c, toward, t);
    if (contrast(v, against) >= target) return v;
  }
  return toward;
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const LIGHT_BG: RGB = [248, 250, 252];   // light theme surface
const DARK_BG: RGB = [11, 19, 38];       // dark theme surface

export interface BrandShades { container: RGB; lightText: RGB; darkText: RGB }

/**
 * container: button/background colour with white text at 4.5:1;
 * lightText / darkText: links and accents readable on the light and dark backgrounds at 4.5:1.
 */
export function brandShades(hex: string): BrandShades | null {
  const c = hexToRgb(hex);
  if (!c) return null;
  return {
    container: untilContrast(c, WHITE, 4.5, BLACK),
    lightText: untilContrast(c, LIGHT_BG, 4.5, BLACK),
    darkText: untilContrast(c, DARK_BG, 4.5, WHITE),
  };
}

const triplet = (c: RGB) => c.join(' ');

/** CSS that overrides the theme's primary colour variables for this workspace (both themes). */
export function brandCss(hex: string | null | undefined): string {
  const s = hex ? brandShades(hex) : null;
  if (!s) return '';
  return `:root,[data-theme='dark']{--c-primary:${triplet(s.darkText)};--c-primary-container:${triplet(s.container)};--c-on-primary-container:255 255 255}`
    + `[data-theme='light']{--c-primary:${triplet(s.lightText)};--c-primary-container:${triplet(s.container)};--c-on-primary-container:255 255 255}`;
}
