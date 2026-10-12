// schema.org data for search engines (Google, Bing): who makes OrbitOS, what it is, what it costs, and the pricing FAQ.
// Rendered as <script type="application/ld+json"> — data, not code; browsers never run it.
import { makeT } from '@/i18n';
import type { Language, MessageKey } from '@/i18n/shared';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { appUrl, contactEmail } from '@/lib/env';
import { localePath } from './paths';

function JsonLd({ data }: { data: unknown }) {
  // "<" escaped so text inside can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

const LANGS = ['en', 'sw', 'fr'];

function organization() {
  const base = appUrl();
  const email = contactEmail();
  return {
    '@type': 'Organization', '@id': `${base}/#organization`, name: 'OrbitOS', url: `${base}/`,
    logo: { '@type': 'ImageObject', url: `${base}/icon-512.png`, width: 512, height: 512 },
    address: { '@type': 'PostalAddress', addressLocality: 'Nairobi', addressCountry: 'KE' },
    ...(email ? { email, contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email, availableLanguage: ['English', 'Swahili', 'French'] } } : {}),
  };
}

function software(lang: Language) {
  const base = appUrl();
  const t = makeT(lang);
  const ids = Object.keys(PLANS) as PlanId[];
  const kes = ids.map((id) => PLANS[id].monthly.KES / 100);
  return {
    '@type': 'SoftwareApplication', '@id': `${base}/#software`, name: 'OrbitOS', url: `${base}${localePath(lang, '')}`,
    description: t('mk.meta.desc'), applicationCategory: 'BusinessApplication', applicationSubCategory: 'Remote team management',
    operatingSystem: 'Web browser (Windows, macOS, Linux, Android, iOS)', inLanguage: LANGS, image: `${base}/opengraph-image`,
    publisher: { '@id': `${base}/#organization` },
    offers: {
      '@type': 'AggregateOffer', priceCurrency: 'KES', lowPrice: Math.min(...kes), highPrice: Math.max(...kes), offerCount: ids.length,
      offers: ids.map((id) => ({
        '@type': 'Offer', name: PLANS[id].name, price: PLANS[id].monthly.KES / 100, priceCurrency: 'KES', url: `${base}${localePath(lang, '/pricing')}`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: PLANS[id].monthly.KES / 100, priceCurrency: 'KES', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
      })),
    },
  };
}

export function HomeStructuredData({ lang }: { lang: Language }) {
  const base = appUrl();
  return <JsonLd data={{
    '@context': 'https://schema.org',
    '@graph': [
      organization(),
      { '@type': 'WebSite', '@id': `${base}/#website`, name: 'OrbitOS', url: `${base}/`, inLanguage: LANGS, publisher: { '@id': `${base}/#organization` } },
      software(lang),
    ],
  }} />;
}

export function PricingStructuredData({ lang }: { lang: Language }) {
  const base = appUrl();
  const t = makeT(lang);
  return <JsonLd data={{
    '@context': 'https://schema.org',
    '@graph': [
      software(lang),
      {
        '@type': 'FAQPage', '@id': `${base}${localePath(lang, '/pricing')}#faq`, inLanguage: lang,
        mainEntity: ([1, 2, 3, 4, 5] as const).map((n) => ({
          '@type': 'Question', name: t(`mk.pr.q${n}` as MessageKey),
          acceptedAnswer: { '@type': 'Answer', text: t(`mk.pr.a${n}` as MessageKey) },
        })),
      },
      {
        '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'OrbitOS', item: `${base}${localePath(lang, '')}` },
          { '@type': 'ListItem', position: 2, name: t('mk.pr.title'), item: `${base}${localePath(lang, '/pricing')}` },
        ],
      },
    ],
  }} />;
}
