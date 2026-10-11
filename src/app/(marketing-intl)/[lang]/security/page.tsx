import { SecurityPage, marketingMetadata } from '@/components/marketing/pages';

type Props = { params: Promise<{ lang: 'sw' | 'fr' }> };
export async function generateMetadata(props: Props) {
  return marketingMetadata((await props.params).lang, 'security');
}
export default async function Page(props: Props) {
  return <SecurityPage lang={(await props.params).lang} />;
}
