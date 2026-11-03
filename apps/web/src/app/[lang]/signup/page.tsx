import { SignupForm } from '@/components/forms/SignupForm';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('signup', (t) => t.signup.title);

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.signup.title} intro={t.signup.intro}>
      <SignupForm locale={locale} t={{ signup: t.signup, form: t.form, errors: t.errors }} />
    </AccountPage>
  );
}
