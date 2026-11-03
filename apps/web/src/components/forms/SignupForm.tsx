'use client';

import { RegisterInput, type Locale } from '@papperdash/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill, validate } from '@/lib/errors';
import { Field, Notice, PasswordField } from './Field';
import styles from './forms.module.css';
import { SubmitButton } from './SubmitButton';
import { useSubmit } from './useSubmit';

type T = Pick<Messages, 'signup' | 'form' | 'errors'>;

export function SignupForm({ locale, t }: { locale: Locale; t: T }) {
  const { pending, error, setError, run } = useSubmit(t.errors);
  const [registered, setRegistered] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      const checked = validate(RegisterInput, { email: form.get('email'), password: form.get('password'), locale }, t.errors);
      if (!checked.ok) return setError(checked.error);
      await api('/auth/register', { method: 'POST', body: JSON.stringify(checked.data) });
      setRegistered(checked.data.email);
    });
  }

  if (registered) {
    return (
      <>
        <Notice tone="success">
          <p className="heading">{t.signup.doneTitle}</p>
          <p>{fill(t.signup.doneBody, { email: registered })}</p>
        </Notice>
        <div className={styles.links}>
          <Link href={`/${locale}/login`}>{t.signup.doneLogin}</Link>
        </div>
      </>
    );
  }
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field label={t.form.email} name="email" type="email" autoComplete="email" inputMode="email" required error={error.fields.email} />
      <PasswordField
        label={t.form.password}
        hint={t.form.passwordHint}
        name="password"
        autoComplete="new-password"
        required
        minLength={10}
        error={error.fields.password}
        showLabel={t.form.showPassword}
        hideLabel={t.form.hidePassword}
      />
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.signup.submit} sending={t.form.sending} />
      </div>
      <div className={styles.links}>
        <p className="muted">{t.signup.haveAccount}</p>
        <Link href={`/${locale}/login`}>{t.signup.login}</Link>
      </div>
    </form>
  );
}
