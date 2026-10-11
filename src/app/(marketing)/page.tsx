import { HomePage, marketingMetadata } from '@/components/marketing/pages';

export const metadata = marketingMetadata('en', 'home');
export default function Landing() {
  return <HomePage lang="en" />;
}
