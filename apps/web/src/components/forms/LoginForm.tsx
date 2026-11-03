'use client';

import { LoginInput, type Locale } from '@papperdash/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { validate } from '@/lib/errors';
import { safeNext } from '@/lib/redirect';
import { Field, Notice, PasswordField } from './Field';
import styles from './forms.module.css';
import { SubmitButton } from './SubmitButton';
import { useSubmit } from './useSubmit';
import { announceSessionChange } from '@/lib/session';

type T = Pick<Messages, 'login' | 'form' | 'errors'>;

export function LoginForm({ locale, t }: { locale: Locale; t: T }) {
  const router = useRouter();
  const { pending, error, setError, run } = useSubmit(t.errors);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      const checked = validate(LoginInput, { email: form.get('email'), password: form.get('password') }, t.errors);
      // Any non-empty password goes to the server: an old, shorter password must still be able to log in.
      if (!checked.ok) {
        const { fields } = checked.error;
        return setError({ ...checked.error, fields: { ...fields, password: fields.password && t.errors.passwordRequired } });
      }
      await api('/auth/login', { method: 'POST', body: JSON.stringify(checked.data) });
      announceSessionChange();
      router.push(safeNext(new URLSearchParams(window.location.search).get('next'), locale));
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field label={t.form.email} name="email" type="email" autoComplete="username" inputMode="email" required error={error.fields.email} />
      <PasswordField label={t.form.password} name="password" autoComplete="current-password" required error={error.fields.password} showLabel={t.form.showPassword} hideLabel={t.form.hidePassword} />
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.login.submit} sending={t.form.sending} />
      </div>
      <div className={styles.links}>
        <Link href={`/${locale}/forgot-password`}>{t.login.forgot}</Link>
        <p className="muted">{t.login.noAccount}</p>
        <Link href={`/${locale}/signup`}>{t.login.signup}</Link>
      </div>
    </form>
  );
}
