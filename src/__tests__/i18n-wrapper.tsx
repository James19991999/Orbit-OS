import { I18nProvider } from '@/i18n/client';
import { clientMessages } from '@/i18n';

/** Components read their strings from I18nProvider (as in the app's layouts). */
export function WithEnglish({ children }: { children: React.ReactNode }) {
  return <I18nProvider lang="en" messages={clientMessages('en')}>{children}</I18nProvider>;
}
