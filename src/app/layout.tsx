import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorker } from '@/components/shell/ServiceWorker';
import { appUrl } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: 'OrbitOS — The operating system for remote-first companies', template: '%s · OrbitOS' },
  description: 'Run a distributed company from one place: executive dashboard, operations & runway, time-zone scheduling, culture, compliance and reports.',
  applicationName: 'OrbitOS',
  openGraph: { type: 'website', siteName: 'OrbitOS', title: 'OrbitOS', description: 'The distributed operating system for remote-first enterprises.' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'OrbitOS', statusBarStyle: 'black-translucent' },
};

// WCAG 1.4.4: the Stitch export disabled pinch-zoom (maximum-scale=1, user-scalable=no). We do not.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b1326' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
};

// Runs before paint so the saved theme never flashes.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )orbit_theme=(dark|light|system)/);var t=m?m[1]:'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-primary-container focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
