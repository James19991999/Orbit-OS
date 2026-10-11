import { MarketingFrame } from '@/components/marketing/Frame';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingFrame lang="en">{children}</MarketingFrame>;
}
