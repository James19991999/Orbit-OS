'use client';
import { useEffect, useState } from 'react';
import Link from '@/components/ui/SmartLink';
import { Icon } from '@/components/ui';
import { FALLBACK, browserLanguage } from '@/i18n/fallback';
import type { Language } from '@/i18n/shared';

/** Thank-you page after a client pays an invoice; the payer's language is picked in their browser. */
export function PaidContent() {
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => { const l = browserLanguage(); setLang(l); document.documentElement.lang = l; }, []);
  const s = FALLBACK[lang];
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Icon name="check_circle" className="text-[48px] text-healthy" />
      <h1 className="mt-3 text-headline-lg">{s.paidH}</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">{s.paidB}</p>
      <Link href="/" className="mt-6 inline-block text-primary hover:underline">{s.paidBack}</Link>
    </div>
  );
}
