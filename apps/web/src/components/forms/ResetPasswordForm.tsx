'use client';

import { PASSWORD_MIN_LENGTH, type Locale } from '@papperdash/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { Messages } from '@/i18n/en';
import { api, ApiError } from '@/lib/api';
import { Notice, PasswordField } from './Field';
import styles from './forms.module.css';
import { SubmitButton } from './SubmitButton';
import { takeTokenFromUrl, useSubmit } from './useSubmit';
import { announceSessionChange } from '@/lib/session';

type T = Pick<Messages, 'reset' | 'form' | 'errors'>;
type State = 'loading' | 'form' | 'missing' | 'expired' | 'done';

export function ResetPasswordForm({ locale, t }: { locale: Locale; t: T }) {
  const { pending, error, setError, run } = useSubmit(t.errors);
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const found = takeTokenFromUrl();
    setToken(found);
    setState(found ? 'form' : 'missing');
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    void run(async () => {
      if (password.length < PASSWORD_MIN_LENGTH) return setError({ form: t.errors.formHasErrors, fields: { password: t.errors.passwordTooShort } });
      try {
        await api('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'link_expired') return setState('expired');
        throw err;
      }
      // The server ended every session, this browser's included.
      announceSessionChange();
      setState('done');
    });
  }

  if (state === 'loading') return null;
  if (state === 'missing' || state === 'expired') {
    return (
      <>
        <Notice tone="error">{state === 'missing' ? t.reset.missingToken : t.reset.expiredBody}</Notice>
        <div className={styles.links}>
          <Link href={`/${locale}/forgot-password`}>{t.reset.requestNew}</Link>
        </div>
      </>
    );
  }
  if (state === 'done') {
    return (
      <>
        <Notice tone="success">
          <p className="heading">{t.reset.doneTitle}</p>
          <p>{t.reset.doneBody}</p>
        </Notice>
        <div className={styles.links}>
          <Link href={`/${locale}/login`}>{t.reset.login}</Link>
        </div>
      </>
    );
  }
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <PasswordField
        label={t.form.newPassword}
        hint={t.form.passwordHint}
        name="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        error={error.fields.password}
        showLabel={t.form.showPassword}
        hideLabel={t.form.hidePassword}
      />
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.reset.submit} sending={t.form.sending} />
      </div>
    </form>
  );
}
