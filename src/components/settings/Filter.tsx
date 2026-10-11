'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { useT } from '@/i18n/client';

const Ctx = createContext('');

/** "Filter platform settings…" — hides sections whose title/keywords don't match. */
export function SettingsFilter({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState('');
  const t = useT();
  return (
    <Ctx.Provider value={q.trim().toLowerCase()}>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <label htmlFor="settings-filter" className="sr-only">{t('settings.filter')}</label>
        <input id="settings-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settings.filter_ph')}
          className="h-11 w-full rounded border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-focus focus:outline-none md:h-10" />
      </div>
      {children}
    </Ctx.Provider>
  );
}

export function Section({ id, title, icon, keywords, badge, children }: { id: string; title: string; icon: string; keywords: string; badge?: React.ReactNode; children: React.ReactNode }) {
  const q = useContext(Ctx);
  const [hash, setHash] = useState('');
  useEffect(() => { setHash(window.location.hash.slice(1) || new URLSearchParams(window.location.search).get('section') || ''); }, []);
  useEffect(() => { if (hash === id) document.getElementById(id)?.scrollIntoView({ block: 'start' }); }, [hash, id]);
  if (q && !`${title} ${keywords}`.toLowerCase().includes(q)) return null;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-24 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="flex items-center gap-2 text-headline-sm"><Icon name={icon} className="text-secondary" />{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}
