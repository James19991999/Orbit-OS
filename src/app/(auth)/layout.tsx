import Link from '@/components/ui/SmartLink';
import { Logo } from '@/components/shell/Logo';
import { I18nProvider } from '@/i18n/client';
import { getLanguage, getT } from '@/i18n/server';
import { LanguageSelect } from '@/components/shell/LanguageSelect';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [lang, t] = await Promise.all([getLanguage(), getT()]);
  return (
    <I18nProvider lang={lang}>
      <div className="relative flex min-h-screen flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_65%)]" />
        </div>
        <header className="relative flex h-16 items-center justify-between px-4 md:px-8"><Logo /><LanguageSelect compact /></header>
        <main id="main" className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">{children}</main>
        <footer className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-6 text-body-sm text-on-surface-variant">
          <Link href="/legal/privacy" className="hover:text-on-surface">{t('auth.privacy')}</Link><span aria-hidden>•</span>
          <Link href="/security" className="hover:text-on-surface">{t('auth.security')}</Link><span aria-hidden>•</span>
          <Link href="/trust" className="hover:text-on-surface">{t('auth.trust')}</Link>
        </footer>
      </div>
    </I18nProvider>
  );
}
