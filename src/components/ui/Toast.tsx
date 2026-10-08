'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string }
const Ctx = createContext<{ toast: (message: string, tone?: ToastTone) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-surface-container-high px-4 py-3 text-body-md shadow-l2',
              t.tone === 'error' ? 'border-alert/40' : t.tone === 'success' ? 'border-healthy/40' : 'border-outline-variant')}>
            <Icon name={t.tone === 'error' ? 'error' : t.tone === 'success' ? 'check_circle' : 'info'}
              className={t.tone === 'error' ? 'text-alert' : t.tone === 'success' ? 'text-healthy' : 'text-secondary'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  return c ?? { toast: () => undefined };
}
