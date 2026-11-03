'use client';

import type { Locale } from '@papperdash/contracts';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import type { Messages } from '@/i18n/en';
import { api, ApiError } from '@/lib/api';
import { toFormError } from '@/lib/errors';
import { Notice } from './Field';
import styles from './forms.module.css';

type T = Pick<Messages, 'verify' | 'errors'>;
type State = { kind: 'working' } | { kind: 'done' } | { kind: 'expired' } | { kind: 'missing' } | { kind: 'error'; message: string };

/** Confirms the email as soon as the link is opened: there is nothing for the customer to decide. */
export function VerifyEmail({ locale, t }: { locale: Locale; t: T }) {
  const [state, setState] = useState<State>({ kind: 'working' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React runs effects twice in development; the token works only once.
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return setState({ kind: 'missing' });
    window.history.replaceState(window.history.state, '', window.location.pathname);
    api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }).then(
      () => setState({ kind: 'done' }),
      (err: unknown) => setState(err instanceof ApiError && err.code === 'link_expired' ? { kind: 'expired' } : { kind: 'error', message: toFormError(err, t.errors).form ?? t.errors.generic }),
    );
  }, [t.errors]);

  switch (state.kind) {
    case 'working':
      return <Notice tone="info">{t.verify.working}</Notice>;
    case 'done':
      return (
        <>
          <Notice tone="success">
            <p className="heading">{t.verify.doneTitle}</p>
            <p>{t.verify.doneBody}</p>
          </Notice>
          <div className={styles.actions}>
            <ButtonLink href={`/${locale}/account`}>{t.verify.continue}</ButtonLink>
          </div>
        </>
      );
    case 'expired':
    case 'missing':
      return (
        <>
          <Notice tone="error">
            {state.kind === 'expired' ? (
              <>
                <p className="heading">{t.verify.expiredTitle}</p>
                <p>{t.verify.expiredBody}</p>
              </>
            ) : (
              <p>{t.verify.missingToken}</p>
            )}
          </Notice>
          <div className={styles.actions}>
            <ButtonLink href={`/${locale}/login?next=/${locale}/account`}>{t.verify.login}</ButtonLink>
          </div>
        </>
      );
    case 'error':
      return <Notice tone="error">{state.message}</Notice>;
  }
}
