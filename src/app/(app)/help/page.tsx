import type { Metadata } from 'next';
import { requireAppContext } from '@/lib/context';
import { getLanguage, getT } from '@/i18n/server';
import { contactEmail } from '@/lib/env';
import { ARTICLES } from '@/lib/help/articles';
import { HelpCenter } from '@/components/help/HelpCenter';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('help.title') };
}

/** Help centre: short guides in the reader's language, a search box, and an assistant that answers from the guides. */
export default async function HelpPage() {
  const [t, lang] = await Promise.all([getT(), getLanguage(), requireAppContext()]);
  const articles = ARTICLES.map((a) => ({ id: a.id, icon: a.icon, title: a.title[lang], body: a.body[lang], keywords: a.keywords }));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-headline-lg-mobile md:text-headline-lg">{t('help.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('help.sub')}</p>
      </div>
      <HelpCenter articles={articles} contact={contactEmail()} />
    </div>
  );
}
