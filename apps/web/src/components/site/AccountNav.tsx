'use client';

import type { Locale } from '@papperdash/contracts';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import styles from './site.module.css';

/** "Log in" until the server confirms a session, then "Your account". */
export function AccountNav({ locale, login, account }: { locale: Locale; login: string; account: string }) {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  return (
    <Link href={`/${locale}/${signedIn ? 'account' : 'login'}`} className={styles.navLink}>
      {signedIn ? account : login}
    </Link>
  );
}
