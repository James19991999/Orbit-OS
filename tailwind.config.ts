import type { Config } from 'tailwindcss';

const tokens = [
  'surface', 'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest', 'on-surface', 'on-surface-variant',
  'outline', 'outline-variant', 'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'tertiary', 'error', 'on-error', 'error-container', 'on-error-container',
  'healthy', 'warning', 'alert',
];
const colors = Object.fromEntries(tokens.map((t) => [t, `rgb(var(--c-${t}) / <alpha-value>)`]));

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'headline-xl': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.025em', fontWeight: '600' }],
        'headline-lg': ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-lg-mobile': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline-md': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline-sm': ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em' }],
        'body-md': ['0.875rem', { lineHeight: '1.25rem' }],
        'body-sm': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.005em' }],
        'label-md': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.01em', fontWeight: '500' }],
        'label-sm': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-xs': ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.04em', fontWeight: '600' }],
      },
      borderRadius: { sm: '0.125rem', DEFAULT: '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem' },
      spacing: { gutter: '1.5rem', 'gutter-sm': '1rem', margin: '2rem', 'margin-sm': '1rem' },
      maxWidth: { canvas: '1600px' },
      boxShadow: {
        l1: '0 4px 20px -2px rgba(0,0,0,0.4)',
        l2: '0 12px 32px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
        glow: '0 0 24px -4px rgba(37,99,235,0.25)',
        bevel: 'inset 0 1px 0 rgba(255,255,255,0.2)',
        focus: '0 0 0 3px rgba(37,99,235,0.25)',
      },
    },
  },
  plugins: [],
};
export default config;
