import type { MetadataRoute } from 'next';

/** Installable app (Add to Home screen). Served at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OrbitOS',
    short_name: 'OrbitOS',
    description: 'Run your distributed team: check-ins, operations, scheduling and payments.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1326',
    theme_color: '#0b1326',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
