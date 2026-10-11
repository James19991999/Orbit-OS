// Public pages as language-aware server components; routes for "/", "/sw" and "/fr" all render these.
import type { Metadata } from 'next';
import Link from '@/components/ui/SmartLink';
import { Icon } from '@/components/ui';
import { makeT } from '@/i18n';
import type { Language, MessageKey, T } from '@/i18n/shared';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { contactEmail } from '@/lib/env';
import { PricingTable, type PricingLabels } from './PricingTable';
import { Prose } from './Prose';
import { alternatesFor, localePath } from './paths';

export type MarketingPage = 'home' | 'pricing' | 'security' | 'trust';
const PATH: Record<MarketingPage, string> = { home: '', pricing: '/pricing', security: '/security', trust: '/trust' };

export function marketingMetadata(lang: Language, page: MarketingPage): Metadata {
  const t = makeT(lang);
  const alternates = alternatesFor(lang, PATH[page]);
  if (page === 'home') return { title: { absolute: t('mk.meta.title') }, description: t('mk.meta.desc'), alternates, openGraph: { locale: lang } };
  if (page === 'pricing') return { title: t('mk.pr.title'), description: t('mk.pr.desc'), alternates };
  return { title: t(page === 'security' ? 'mk.sec.title' : 'mk.tr.title'), alternates };
}

function pricingLabels(t: T): PricingLabels {
  const plans = Object.fromEntries((Object.keys(PLANS) as PlanId[]).map((id) => [id, {
    tagline: t(`plan.${id}.tagline`),
    features: PLANS[id].features.map((_, i) => t(`plan.${id}.f${i}` as MessageKey)),
  }])) as PricingLabels['plans'];
  return { note: t('mk.pt.note'), show: t('mk.pt.show'), month: t('mk.pt.month'), mpesaCard: t('mk.pt.mpesa_card'), cardOr: t('mk.pt.card_or'), start: t('mk.pt.start'), plans };
}

const FEATURES = [
  ['grid_view', 'dash'], ['view_kanban', 'ops'], ['schedule', 'sch'], ['auto_awesome', 'cul'], ['verified_user', 'cmp'], ['analytics', 'rep'], ['translate', 'lang'],
] as const;

export function HomePage({ lang }: { lang: Language }) {
  const t = makeT(lang);
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.22),transparent_65%)]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-label-xs uppercase text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-healthy" aria-hidden />{t('mk.hero.kicker')}
          </p>
          <h1 className="mt-5 max-w-3xl text-headline-lg-mobile md:text-headline-xl">{t('mk.hero.title')}</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-on-surface-variant">{t('mk.hero.body')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded bg-primary-container px-5 text-label-md text-white shadow-bevel hover:bg-[#1d4ed8]">{t('mk.hero.cta')}<Icon name="arrow_forward" className="text-[18px]" /></Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded border border-outline-variant bg-surface-container px-5 text-label-md">{t('mk.nav.signin')}</Link>
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">{t('mk.hero.pay')}</p>
        </div>
      </section>
      <section id="features" aria-labelledby="features-h" className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="features-h" className="text-headline-lg-mobile md:text-headline-lg">{t('mk.f.h')}</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, k]) => (
            <li key={k} className="card p-5">
              <Icon name={icon} className="text-[28px] text-primary" />
              <h3 className="mt-3 text-headline-sm">{t(`mk.f.${k}`)}</h3>
              <p className="mt-1 text-body-md text-on-surface-variant">{t(`mk.f.${k}_b`)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pricing-h" className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="pricing-h" className="text-headline-lg-mobile md:text-headline-lg">{t('mk.price.h')}</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">{t('mk.price.annual')}</p>
        <div className="mt-8"><PricingTable labels={pricingLabels(t)} /></div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="card glow-focal flex flex-col items-start gap-4 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-headline-md">{t('mk.cta.h')}</h2>
            <p className="text-body-md text-on-surface-variant">{t('mk.cta.b')}</p>
          </div>
          <Link href="/signup" className="inline-flex h-12 items-center rounded bg-primary-container px-5 text-label-md text-white">{t('mk.cta.go')}</Link>
        </div>
      </section>
    </>
  );
}

export function PricingPage({ lang }: { lang: Language }) {
  const t = makeT(lang);
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('mk.pr.title')}</h1>
      <p className="mt-2 max-w-2xl text-body-lg text-on-surface-variant">{t('mk.pr.sub')}</p>
      <div className="mt-8"><PricingTable labels={pricingLabels(t)} /></div>
      <section aria-labelledby="faq-h" className="mt-14 max-w-3xl">
        <h2 id="faq-h" className="text-headline-md">{t('mk.pr.faq')}</h2>
        <dl className="mt-4 divide-y divide-outline-variant">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <div key={n} className="py-4"><dt className="text-label-md">{t(`mk.pr.q${n}`)}</dt><dd className="mt-1 text-body-md text-on-surface-variant">{t(`mk.pr.a${n}`)}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function SecurityPage({ lang }: { lang: Language }) {
  const t = makeT(lang);
  const contact = contactEmail();
  const [before, after] = t('mk.sec.email', { email: '{@}' }).split('{@}');
  return (
    <Prose title={t('mk.sec.title')}>
      <p>{t('mk.sec.intro')}</p>
      <h2>{t('mk.sec.arch')}</h2>
      <ul><li>{t('mk.sec.arch1')}</li><li>{t('mk.sec.arch2')}</li><li>{t('mk.sec.arch3')}</li></ul>
      <h2>{t('mk.sec.data')}</h2>
      <ul><li>{t('mk.sec.data1')}</li><li>{t('mk.sec.data2')}</li><li>{t('mk.sec.data3')}</li><li>{t('mk.sec.data4')}</li></ul>
      <h2>{t('mk.sec.app')}</h2>
      <ul><li>{t('mk.sec.app1')}</li><li>{t('mk.sec.app2')}</li><li>{t('mk.sec.app3')}</li></ul>
      <h2>{t('mk.sec.report')}</h2>
      <p>
        {contact ? <>{before}<a href={`mailto:${contact}`}>{contact}</a>{after}</> : t('mk.sec.contact')}
        {' '}{t('mk.sec.time')}
      </p>
    </Prose>
  );
}

export function TrustPage({ lang }: { lang: Language }) {
  const t = makeT(lang);
  return (
    <Prose title={t('mk.tr.title')}>
      <p>{t('mk.tr.intro')}</p>
      <h2>{t('mk.tr.iso')}</h2><p>{t('mk.tr.iso_b')}</p>
      <h2>{t('mk.tr.auth')}</h2>
      <ul><li>{t('mk.tr.auth1')}</li><li>{t('mk.tr.auth2')}</li><li>{t('mk.tr.auth3')}</li></ul>
      <h2>{t('mk.tr.audit')}</h2><p>{t('mk.tr.audit_b')}</p>
      <h2>{t('mk.tr.pay')}</h2><p>{t('mk.tr.pay_b')}</p>
      <h2>{t('mk.tr.exit')}</h2><p>{t('mk.tr.exit_b')}</p>
      <p><Link href={localePath(lang, '/security')}>{t('mk.sec.title')} →</Link></p>
    </Prose>
  );
}
