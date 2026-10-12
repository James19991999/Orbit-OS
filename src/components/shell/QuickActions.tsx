'use client';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Icon, cn } from '@/components/ui';
import { useFormat } from '@/lib/locale/client';
import { can } from '@/lib/roles';
import type { Role } from '@/lib/types';
import type { MessageKey } from '@/i18n/shared';
import { useT } from '@/i18n/client';
import { NAV } from './nav';

interface Hit { type: 'task' | 'person' | 'meeting' | 'invoice'; id: string; title: string; sub: string | null; href: string }
interface Item { id: string; label: string; sub?: string | null; icon: string; href?: string; run?: () => void }
interface Group { key: string; label: string; items: Item[] }

/** "G then D" style navigation. */
export const GO_KEYS: Record<string, string> = { d: '/dashboard', o: '/operations', s: '/scheduling', c: '/culture', a: '/compliance', r: '/reports', p: '/people', t: '/settings', n: '/notifications' };

const isTyping = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName));
};

/**
 * Search everything (Ctrl/⌘+K or /) and keyboard shortcuts for the whole app.
 * Results come from /api/search, which runs as the signed-in person: they only find what they could open anyway.
 */
export function QuickActions({ role }: { role: Role }) {
  const t = useT();
  const fmt = useFormat();
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  // Pages and actions this person can use.
  const statics = useMemo<Group[]>(() => {
    const actions: Item[] = [
      ...(can.write(role) ? [{ id: 'a-task', label: t('cmdk.a.task'), icon: 'add_task', href: '/operations?new=task' }] : []),
      ...(can.write(role) ? [{ id: 'a-checkin', label: t('cmdk.a.checkin'), icon: 'edit_note', href: '/culture' }] : []),
      ...(can.write(role) ? [{ id: 'a-meeting', label: t('cmdk.a.meeting'), icon: 'event', href: '/scheduling' }] : []),
      ...(can.manage(role) ? [
        { id: 'a-expense', label: t('cmdk.a.expense'), icon: 'receipt_long', href: '/operations?tab=finance&new=expense' },
        { id: 'a-invoice', label: t('cmdk.a.invoice'), icon: 'request_quote', href: '/operations?tab=finance&new=invoice' },
        { id: 'a-invite', label: t('cmdk.a.invite'), icon: 'person_add', href: '/settings?section=members' },
      ] : []),
      { id: 'a-profile', label: t('cmdk.a.profile'), icon: 'person', href: '/profile' },
      { id: 'a-notifications', label: t('cmdk.a.notifications'), icon: 'notifications', href: '/notifications' },
      { id: 'a-shortcuts', label: t('cmdk.a.shortcuts'), icon: 'keyboard', run: () => { setOpen(false); setHelp(true); } },
    ];
    const pages: Item[] = NAV.map((n) => ({ id: `p-${n.href}`, label: t(n.labelKey), icon: n.icon, href: n.href }));
    return [{ key: 'actions', label: t('cmdk.actions'), items: actions }, { key: 'pages', label: t('cmdk.pages'), items: pages }];
  }, [role, t]);

  // Live results, slightly debounced; an older request never overwrites a newer one.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setHits([]); setStatus('idle'); return; }
    const ctl = new AbortController();
    setStatus('loading');
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { hits: Hit[] }) => { setHits(d.hits); setStatus('idle'); })
        .catch((e: unknown) => { if ((e as Error).name !== 'AbortError') { setHits([]); setStatus('error'); } });
    }, 180);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q, open]);

  const groups = useMemo<Group[]>(() => {
    const term = q.trim().toLocaleLowerCase();
    const filtered = statics.map((g) => ({ ...g, items: term ? g.items.filter((i) => i.label.toLocaleLowerCase().includes(term)) : g.items }));
    const sub = (h: Hit) => h.type === 'task' && h.sub ? t(`task.st.${h.sub}` as MessageKey)
      : h.type === 'meeting' && h.sub ? fmt.date(h.sub, 'datetime')
      : h.type === 'invoice' && h.sub ? t(`inv.st.${h.sub}` as MessageKey)
      : h.sub;
    const icon = { task: 'task_alt', person: 'person', meeting: 'event', invoice: 'request_quote' } as const;
    const label = { task: 'cmdk.tasks', person: 'cmdk.people', meeting: 'cmdk.meetings', invoice: 'cmdk.invoices' } as const;
    const found = (['task', 'person', 'meeting', 'invoice'] as const).map((type) => ({
      key: type, label: t(label[type]),
      items: hits.filter((h) => h.type === type).map((h) => ({ id: `${h.type}-${h.id}`, label: h.title, sub: sub(h), icon: icon[type], href: h.href })),
    }));
    // While searching, show found records first; with no query, show actions and pages.
    return (term ? [...found, ...filtered] : filtered).filter((g) => g.items.length > 0);
  }, [statics, hits, q, t, fmt]);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => { setActive(0); }, [q, hits]);

  const choose = (i: Item | undefined) => {
    if (!i) return;
    if (i.run) i.run(); else if (i.href) go(i.href);
  };

  // Global shortcuts.
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      if (pendingG && Date.now() - pendingG < 1500) {
        pendingG = 0;
        const href = GO_KEYS[e.key.toLowerCase()];
        if (href) { e.preventDefault(); router.push(href); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); setOpen(true); }
      else if (e.key === '?') { e.preventDefault(); setHelp(true); }
      else if ((e.key === 'n' || e.key === 'N') && can.write(role)) { e.preventDefault(); router.push('/operations?new=task'); }
      else if (e.key === 'g' || e.key === 'G') pendingG = Date.now();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, router]);

  useEffect(() => {
    if (open) { setQ(''); setHits([]); requestAnimationFrame(() => input.current?.focus()); }
  }, [open]);

  const modKey = mac ? '⌘' : 'Ctrl';
  let n = -1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /"
        className="flex h-9 items-center gap-2 rounded border border-outline-variant px-2 text-body-sm text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface md:min-w-[11rem] md:px-3">
        <Icon name="search" className="text-[20px]" />
        <span className="sr-only md:not-sr-only">{t('cmdk.open')}</span>
        <kbd className="ml-auto hidden rounded border border-outline-variant px-1.5 font-sans text-label-xs md:inline">{modKey} K</kbd>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('cmdk.title')} wide>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cmdk.placeholder')}
              aria-label={t('cmdk.title')} role="combobox" aria-expanded={flat.length > 0} aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined} autoComplete="off" spellCheck={false}
              className="h-11 w-full rounded border border-outline-variant bg-surface-container-lowest pl-10 pr-3 text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:shadow-focus focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0))); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); choose(flat[active]); }
              }} />
          </div>
          <p aria-live="polite" className="sr-only">{status === 'loading' ? t('cmdk.searching') : q.trim().length >= 2 ? `${flat.length} ${t('cmdk.results')}` : ''}</p>
          <div id={listId} role="listbox" aria-label={t('cmdk.results')} className="max-h-[55vh] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.key} role="group" aria-labelledby={`${listId}-g-${g.key}`} className="mb-2">
                <p id={`${listId}-g-${g.key}`} role="presentation" className="px-2 py-1 text-label-xs uppercase text-on-surface-variant">{g.label}</p>
                {g.items.map((i) => {
                  n += 1;
                  const idx = n;
                  return (
                    <div key={i.id} id={`${listId}-${idx}`} role="option" aria-selected={idx === active}
                      onMouseDown={(e) => { e.preventDefault(); choose(i); }} onMouseMove={() => setActive(idx)}
                      className={cn('flex cursor-pointer items-center gap-3 rounded px-2 py-2', idx === active ? 'bg-primary-container/15' : 'hover:bg-on-surface/5')}>
                      <Icon name={i.icon} className="text-secondary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-md text-on-surface">{i.label}</span>
                        {i.sub && <span className="block truncate text-body-sm text-on-surface-variant">{i.sub}</span>}
                      </span>
                      {idx === active && <Icon name="keyboard_return" className="text-[18px] text-on-surface-variant" />}
                    </div>
                  );
                })}
              </div>
            ))}
            {status === 'loading' && flat.length === 0 && <p className="px-2 py-6 text-center text-body-md text-on-surface-variant">{t('cmdk.searching')}</p>}
            {status === 'idle' && q.trim().length >= 2 && flat.length === 0 && <p className="px-2 py-6 text-center text-body-md text-on-surface-variant">{t('cmdk.none', { q: q.trim() })}</p>}
            {status === 'error' && <p className="px-2 py-3 text-body-sm text-warning">{t('cmdk.error')}</p>}
          </div>
          <p className="hidden text-body-sm text-on-surface-variant md:block">{t('cmdk.keys')}</p>
        </div>
      </Dialog>

      <Dialog open={help} onClose={() => setHelp(false)} title={t('kb.title')} description={t('kb.note')}>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-body-md">
          <Shortcut keys={[[modKey, 'K'], ['/']]} or={t('kb.or')} /><dd>{t('kb.search')}</dd>
          {can.write(role) && <><Shortcut keys={[['N']]} /><dd>{t('kb.new_task')}</dd></>}
          {Object.entries(GO_KEYS).map(([k, href]) => {
            const item = NAV.find((x) => x.href === href);
            const page = item ? t(item.labelKey) : t('nav.notifications');
            return <Fragment key={k}><Shortcut keys={[['G', k.toUpperCase()]]} then={t('kb.then')} /><dd>{t('kb.go', { page })}</dd></Fragment>;
          })}
          <Shortcut keys={[['?']]} /><dd>{t('kb.help')}</dd>
        </dl>
      </Dialog>
    </>
  );
}

function Shortcut({ keys, or, then }: { keys: string[][]; or?: string; then?: string }) {
  return (
    <dt className="flex items-center gap-1 whitespace-nowrap">
      {keys.map((combo, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="px-1 text-body-sm text-on-surface-variant">{or}</span>}
          {combo.map((k, j) => (
            <span key={j} className="flex items-center gap-1">
              {j > 0 && then && <span className="text-body-sm text-on-surface-variant">{then}</span>}
              <kbd className="min-w-[1.75rem] rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 text-center font-sans text-label-sm">{k}</kbd>
            </span>
          ))}
        </span>
      ))}
    </dt>
  );
}
