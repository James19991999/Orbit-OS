'use client';
import { useEffect, useRef } from 'react';
import { cn } from './cn';
import { useTOr } from '@/i18n/client';
import { Icon } from './Icon';

/**
 * Accessible modal built on <dialog>: native focus trap, Esc to close, focus restored on close.
 * On mobile it renders as a bottom sheet; on desktop as a centred dialog.
 */
export function Dialog({ open, onClose, title, description, children, footer, wide }:
  { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const tr = useTOr();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="dlg-title"
      className={cn(
        'm-0 mt-auto w-full max-w-none rounded-t-xl border border-outline-variant bg-surface-container-high p-0 text-on-surface shadow-l2 backdrop:bg-black/60',
        'md:m-auto md:rounded-lg', wide ? 'md:max-w-2xl' : 'md:max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant px-5 py-4">
            <div>
              <h2 id="dlg-title" className="text-headline-sm">{title}</h2>
              {description && <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded p-1 text-on-surface-variant hover:bg-on-surface/5" aria-label={tr('ui.close_dialog', 'Close dialog')}>
              <Icon name="close" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant px-5 py-3 pb-safe">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
