import Link from '@/components/ui/SmartLink';
import { Logo } from '@/components/shell/Logo';

import { getT } from '@/i18n/server';

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-4 md:px-8"><Logo /></header>
      <main id="main" className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 text-center">
        <p className="text-label-xs uppercase text-on-surface-variant">{t('p.nf.code')}</p>
        <h1 className="mt-2 text-headline-lg">{t('p.nf.title')}</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">{t('p.nf.body')}</p>
        <div className="mt-6 flex gap-3"><Link href="/dashboard" className="rounded bg-primary-container px-4 py-2.5 text-label-md text-white">{t('p.nf.dashboard')}</Link><Link href="/" className="rounded border border-outline-variant px-4 py-2.5 text-label-md">{t('p.nf.home')}</Link></div>
      </main>
    </div>
  );
}
