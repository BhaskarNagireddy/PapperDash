'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@papperdash/contracts';
import { LOCALE_COOKIE, switchLocale } from '@/i18n/config';
import styles from './site.module.css';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Links to the same page in the other language and remembers the choice. The cookie is set here, on click,
 * because Next.js may show a prefetched page without a new request reaching the proxy.
 */
export function LanguageSwitch({ to, text, label }: { to: Locale; text: string; label: string }) {
  const pathname = usePathname();
  const remember = () => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${to}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
  };
  return (
    <Link href={switchLocale(pathname, to)} onClick={remember} className={styles.lang} hrefLang={to} lang={to} aria-label={label}>
      {text}
    </Link>
  );
}
