import Link from '@/components/ui/SmartLink';
import { Logo } from '@/components/shell/Logo';
import { makeT } from '@/i18n';
import type { Language } from '@/i18n/shared';
import { localePath } from './paths';
import { LanguageLinks, HtmlLang } from './LanguageLinks';

/** Header + footer for the public site, in one language. Rendered statically. */
export function MarketingFrame({ lang, children }: { lang: Language; children: React.ReactNode }) {
  const t = makeT(lang);
  const p = (path: string) => localePath(lang, path);
  const englishOnly = t('mk.foot.english_only');
  return (
    <div className="flex min-h-screen flex-col" lang={lang}>
      {lang !== 'en' && <HtmlLang lang={lang} />}
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3"><Logo href={p('/')} /><span className="hidden md:block"><LanguageLinks lang={lang} label={t('mk.nav.lang')} /></span></div>
          <nav aria-label={t('mk.nav.site')} className="flex items-center gap-1 text-label-md">
            <Link href={`${p('/')}#features`} className="hidden rounded px-3 py-2 text-on-surface-variant hover:text-on-surface md:block">{t('mk.nav.features')}</Link>
            <Link href={p('/pricing')} className="hidden rounded px-3 py-2 text-on-surface-variant hover:text-on-surface sm:block">{t('mk.nav.pricing')}</Link>
            <Link href={p('/security')} className="hidden rounded px-3 py-2 text-on-surface-variant hover:text-on-surface lg:block">{t('mk.nav.security')}</Link>
            <Link href="/login" className="rounded px-3 py-2 text-on-surface-variant hover:text-on-surface">{t('mk.nav.signin')}</Link>
            <Link href="/signup" className="ml-1 whitespace-nowrap rounded bg-primary-container px-3 py-2 text-white shadow-bevel hover:bg-[#1d4ed8]">{t('mk.nav.start')}</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-body-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p>© {new Date().getFullYear()} OrbitOS. {t('mk.foot.built')}</p>
            {englishOnly && <p className="mt-1">{englishOnly}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <nav aria-label={t('mk.foot.legal')} className="flex flex-wrap gap-4">
              <Link href="/legal/privacy" className="hover:text-on-surface">{t('mk.foot.privacy')}</Link>
              <Link href="/legal/terms" className="hover:text-on-surface">{t('mk.foot.terms')}</Link>
              <Link href={p('/trust')} className="hover:text-on-surface">{t('mk.foot.trust')}</Link>
              <Link href={p('/security')} className="hover:text-on-surface">{t('mk.nav.security')}</Link>
            </nav>
            <LanguageLinks lang={lang} label={t('mk.nav.lang')} />
          </div>
        </div>
      </footer>
    </div>
  );
}
