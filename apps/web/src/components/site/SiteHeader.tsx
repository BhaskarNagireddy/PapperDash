import { Wordmark } from '@/components/ui/Wordmark';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './site.module.css';

export async function SiteHeader() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <header className={styles.header}>
      <div className={`page ${styles.headerInner}`}>
        <Wordmark href={`/${locale}`} label={t.site.home} />
        <LanguageSwitch to={locale === 'sv' ? 'en' : 'sv'} text={t.site.languageSwitch} label={t.site.languageSwitchLabel} />
      </div>
    </header>
  );
}
