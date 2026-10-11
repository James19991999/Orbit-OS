'use client';
import { useEffect } from 'react';
import { captureClientError } from '@/lib/observability/capture';
import { ErrorState } from '@/components/ui';
import { useT } from '@/i18n/client';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { captureClientError(error); }, [error]);
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="mb-4 text-headline-md">{t('err.page')}</h1>
      <ErrorState title={t('err.title')} retryLabel={t('err.try_again')} body={error.message || t('err.unexpected')} onRetry={reset} />
      {error.digest && <p className="mt-2 text-body-sm text-on-surface-variant">{t('err.ref', { ref: error.digest })}</p>}
    </div>
  );
}
