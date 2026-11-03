import { getMessages } from '@/i18n/dictionaries';
import styles from './site.module.css';

export async function SiteFooter() {
  const t = await getMessages();
  return (
    <footer className={styles.footer}>
      <div className="page small muted">
        <p>{t.site.footerTagline}</p>
        <p>{t.site.footerCity}</p>
      </div>
    </footer>
  );
}
