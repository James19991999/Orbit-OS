'use client';
import { useRouter } from 'next/navigation';
import { LANGUAGES, isLanguage } from '@/i18n/shared';
import { useLang, useT, setLanguageCookie } from '@/i18n/client';
import { useToast } from '@/components/ui';

/** Language picker. Signed in: saved to the profile (also used for emails and WhatsApp). Always: a device cookie. */
export function LanguageSelect({ userId, compact }: { userId?: string; compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  async function change(v: string) {
    if (!isLanguage(v)) return;
    setLanguageCookie(v);
    if (userId) {
      const { getBrowserClient } = await import('@/lib/supabase/client');
      const { error } = await getBrowserClient()!.from('profiles').update({ language: v }).eq('id', userId);
      if (error) { toast(error.message, 'error'); return; }
    }
    router.refresh();
  }
  return (
    <label className={compact ? 'inline-flex items-center gap-2 text-body-sm text-on-surface-variant' : 'flex flex-col gap-1.5'}>
      <span className={compact ? '' : 'text-label-sm text-on-surface-variant'}>{t('auth.language')}</span>
      <select value={lang} onChange={(e) => change(e.target.value)}
        className={compact ? 'rounded border border-outline-variant bg-surface-container px-2 py-1 text-body-sm text-on-surface' : 'h-11 w-full rounded border border-outline-variant bg-surface-container px-3 text-body-md text-on-surface md:h-10 md:max-w-xs'}>
        {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
    </label>
  );
}
