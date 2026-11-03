import { ForgotPasswordForm } from '@/components/forms/ForgotPasswordForm';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('forgot-password', (t) => t.forgot.title);

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.forgot.title} intro={t.forgot.intro}>
      <ForgotPasswordForm locale={locale} t={{ forgot: t.forgot, form: t.form, errors: t.errors }} />
    </AccountPage>
  );
}
