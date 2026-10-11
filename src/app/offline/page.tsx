import type { Metadata } from 'next';
import { OfflineContent } from '@/components/shell/OfflineContent';

export const metadata: Metadata = { title: 'Offline' };

/** Shown by the service worker when a page can't be loaded without a connection. Static, no data. */
export default function OfflinePage() {
  return <OfflineContent />;
}
