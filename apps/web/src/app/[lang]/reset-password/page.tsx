import { ResetPasswordForm } from '@/components/forms/ResetPasswordForm';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('reset-password', (t) => t.reset.title, { index: false });

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.reset.title}>
      <ResetPasswordForm locale={locale} t={{ reset: t.reset, form: t.form, errors: t.errors }} />
    </AccountPage>
  );
}
