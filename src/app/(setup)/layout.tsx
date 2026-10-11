import { Logo } from '@/components/shell/Logo';
import { I18nProvider } from '@/i18n/client';
import { getLanguage } from '@/i18n/server';
import { clientMessages } from '@/i18n';

export const dynamic = 'force-dynamic';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLanguage();
  return (
    <I18nProvider lang={lang} messages={clientMessages(lang)}>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center px-4 md:px-8"><Logo href="/dashboard" /></header>
        <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8">{children}</main>
      </div>
    </I18nProvider>
  );
}
