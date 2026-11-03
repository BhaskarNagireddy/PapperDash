import Link from 'next/link';
import styles from '@/components/forms/forms.module.css';
import { WaitlistForm } from '@/components/forms/WaitlistForm';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('waitlist', (t) => t.waitlist.title);

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.waitlist.title} intro={t.waitlist.intro}>
      <WaitlistForm locale={locale} t={{ waitlist: t.waitlist, form: t.form, errors: t.errors }} />
      <div className={styles.links}>
        <p className="muted">{t.waitlist.signupHint}</p>
        <Link href={`/${locale}/signup`}>{t.waitlist.signupLink}</Link>
      </div>
    </AccountPage>
  );
}
