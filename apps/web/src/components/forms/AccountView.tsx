'use client';

import type { Locale, ServiceStatus } from '@papperdash/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { Notice } from './Field';
import styles from './forms.module.css';
import { useSubmit } from './useSubmit';
import { announceSessionChange, useSession } from '@/lib/session';

type T = Pick<Messages, 'account' | 'errors'>;

export function AccountView({ locale, t }: { locale: Locale; t: T }) {
  const router = useRouter();
  const session = useSession();
  const resend = useSubmit(t.errors);
  const logout = useSubmit(t.errors);
  const [resent, setResent] = useState(false);
  const [ordering, setOrdering] = useState<boolean | null>(null);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace(`/${locale}/login?next=/${locale}/account`);
  }, [session.status, router, locale]);
  useEffect(() => {
    api<ServiceStatus>('/status').then(
      (s) => setOrdering(s.ordering),
      () => setOrdering(null),
    );
  }, []);

  if (session.status === 'error') return <Notice tone="error">{t.errors.generic}</Notice>;
  if (session.status !== 'signed-in') return <p className="muted">{t.account.loading}</p>;
  const { user } = session;

  return (
    <div className={styles.form}>
      <dl className={styles.details}>
        <dt>{t.account.email}</dt>
        <dd>
          <span className={styles.email}>{user.email}</span>
          <span className={`${styles.chip} ${user.emailVerified ? styles.chipDone : styles.chipWaiting}`}>{user.emailVerified ? t.account.verified : t.account.unverified}</span>
        </dd>
      </dl>

      {!user.emailVerified ? (
        <Notice tone="info">
          <p>{t.account.unverifiedBody}</p>
          {resent ? <p role="status">{t.account.resent}</p> : null}
          {resend.error.form ? <p role="alert">{resend.error.form}</p> : null}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              aria-disabled={resend.pending || undefined}
              onClick={() =>
                resend.run(async () => {
                  await api('/auth/verify-email/resend', { method: 'POST' });
                  setResent(true);
                })
              }
            >
              {t.account.resend}
            </Button>
          </div>
        </Notice>
      ) : null}

      {ordering === false ? <Notice tone="info">{t.account.orderingClosed}</Notice> : null}

      <div className={styles.actions}>
        <ButtonLink href={`/${locale}/print`}>{t.account.print}</ButtonLink>
        <ButtonLink href={`/${locale}/orders`} variant="secondary">
          {t.account.orders}
        </ButtonLink>
      </div>

      {logout.error.form ? <Notice tone="error">{logout.error.form}</Notice> : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() =>
            logout.run(async () => {
              await api('/auth/logout', { method: 'POST' });
              announceSessionChange();
              router.push(`/${locale}`);
            })
          }
        >
          {t.account.logout}
        </Button>
      </div>
    </div>
  );
}
