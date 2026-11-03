import { VerifyEmail } from '@/components/forms/VerifyEmail';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('verify-email', (t) => t.verify.title, { index: false });

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.verify.title}>
      <VerifyEmail locale={locale} t={{ verify: t.verify, errors: t.errors }} />
    </AccountPage>
  );
}
