import { notFound } from 'next/navigation';
import { MarketingFrame } from '@/components/marketing/Frame';
import { MARKETING_LANGS } from '@/components/marketing/paths';

// Only /sw and /fr exist here; everything is prerendered at build time (no per-request work).
// Note: a root [lang] segment makes next/eslint's no-html-link-for-pages treat every <a href> as a page link,
// so that rule is off in .eslintrc.json (API downloads and OAuth starts must stay plain <a>).
export const dynamicParams = false;
export function generateStaticParams() {
  return MARKETING_LANGS.map((lang) => ({ lang }));
}

export default async function LocalizedMarketingLayout(props: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  if (!(MARKETING_LANGS as readonly string[]).includes(lang)) notFound();
  return <MarketingFrame lang={lang as 'sw' | 'fr'}>{props.children}</MarketingFrame>;
}
