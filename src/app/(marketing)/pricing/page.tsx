import { PricingPage, marketingMetadata } from '@/components/marketing/pages';

export const metadata = marketingMetadata('en', 'pricing');
export default function Page() {
  return <PricingPage lang="en" />;
}
