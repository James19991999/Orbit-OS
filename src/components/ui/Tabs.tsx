'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from './cn';

/** URL-driven tabs (?tab=…) so every tab is linkable and survives refresh. */
export function LinkTabs({ tabs, param = 'tab', label }: { tabs: { id: string; label: string; icon?: string }[]; param?: string; label: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get(param) ?? tabs[0]?.id;
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1">
        {tabs.map((t) => {
          const active = t.id === current;
          const q = new URLSearchParams(sp.toString());
          q.set(param, t.id);
          return (
            <li key={t.id}>
              <Link href={`${pathname}?${q.toString()}`} aria-current={active ? 'page' : undefined} scroll={false}
                className={cn('flex h-9 items-center gap-1.5 rounded px-3 text-label-md transition-colors',
                  active ? 'bg-surface-container-highest text-on-surface shadow-l1' : 'text-on-surface-variant hover:text-on-surface')}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Local (state-driven) segmented control. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('h-8 rounded px-3 text-label-sm', value === o.value ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
