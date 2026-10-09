import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

/** Shown by the service worker when a page can't be loaded without a connection. Static, no data. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-headline-lg">You&apos;re offline</h1>
      <p className="text-body-md text-on-surface-variant">This page needs a connection. Pages you&apos;ve opened recently may still load from the back button.</p>
      <ul className="list-disc space-y-1 pl-5 text-body-md text-on-surface-variant">
        <li>Check-ins you write while offline are saved on this device and sent automatically when you reconnect.</li>
        <li>On WhatsApp you can still reply to a check-in reminder — it arrives when your phone has signal.</li>
      </ul>
      <a href="/dashboard" className="inline-flex h-11 w-fit items-center rounded bg-primary-container px-4 text-label-md text-white">Try again</a>
    </main>
  );
}
