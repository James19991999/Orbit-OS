'use client';
import { useEffect, useState } from 'react';
import { captureClientError } from '@/lib/observability/capture';
import { FALLBACK, browserLanguage } from '@/i18n/fallback';
import type { Language } from '@/i18n/shared';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<Language>('en');
  useEffect(() => { captureClientError(error); }, [error]);
  useEffect(() => { setLang(browserLanguage()); }, []);
  const s = FALLBACK[lang];
  return (
    <html lang={lang}>
      <body style={{ margin: 0, background: '#0b1326', color: '#dae2fd', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 16 }}>
          <h1 style={{ fontSize: 24 }}>{s.error}</h1>
          <p style={{ color: '#c3c6d7' }}>{error.message || s.again}</p>
          {error.digest && <p style={{ color: '#8d90a0', fontSize: 12 }}>{s.ref}: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 16, background: '#2563eb', color: '#fff', border: 0, borderRadius: 4, padding: '10px 16px', fontWeight: 600 }}>{s.retry}</button>
        </main>
      </body>
    </html>
  );
}
