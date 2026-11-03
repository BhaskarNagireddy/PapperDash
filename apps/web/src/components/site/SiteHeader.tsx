import { Wordmark } from '@/components/ui/Wordmark';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { AccountNav } from './AccountNav';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './site.module.css';

export async function SiteHeader() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <header className={styles.header}>
      <div className={`page ${styles.headerInner}`}>
        <Wordmark href={`/${locale}`} label={t.site.home} />
        <nav className={styles.nav} aria-label={t.site.navLabel}>
          <AccountNav locale={locale} login={t.nav.login} account={t.nav.account} />
          <LanguageSwitch to={locale === 'sv' ? 'en' : 'sv'} text={t.site.languageSwitch} label={t.site.languageSwitchLabel} />
        </nav>
      </div>
    </header>
  );
}
