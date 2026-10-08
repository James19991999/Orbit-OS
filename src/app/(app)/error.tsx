'use client';
import { ErrorState } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="mb-4 text-headline-md">This page couldn&apos;t load</h1>
      <ErrorState body={error.message || 'An unexpected error occurred.'} onRetry={reset} />
      {error.digest && <p className="mt-2 text-body-sm text-on-surface-variant">Reference: {error.digest}</p>}
    </div>
  );
}
