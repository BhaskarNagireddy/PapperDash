import { AccountView } from '@/components/forms/AccountView';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('account', (t) => t.account.title, { index: false });

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.account.title}>
      <AccountView locale={locale} t={{ account: t.account, errors: t.errors }} />
    </AccountPage>
  );
}
