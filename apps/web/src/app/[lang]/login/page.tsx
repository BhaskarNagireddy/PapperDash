import { LoginForm } from '@/components/forms/LoginForm';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('login', (t) => t.login.title);

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.login.title}>
      <LoginForm locale={locale} t={{ login: t.login, form: t.form, errors: t.errors }} />
    </AccountPage>
  );
}
