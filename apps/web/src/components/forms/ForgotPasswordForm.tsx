'use client';

import { RequestPasswordResetInput, type Locale } from '@papperdash/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill, validate } from '@/lib/errors';
import { Field, Notice } from './Field';
import styles from './forms.module.css';
import { SubmitButton } from './SubmitButton';
import { useSubmit } from './useSubmit';

type T = Pick<Messages, 'forgot' | 'form' | 'errors'>;

/** Always answers "if an account exists…", like the server, so the form does not reveal who has an account. */
export function ForgotPasswordForm({ locale, t }: { locale: Locale; t: T }) {
  const { pending, error, setError, run } = useSubmit(t.errors);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      const checked = validate(RequestPasswordResetInput, { email: form.get('email') }, t.errors);
      if (!checked.ok) return setError(checked.error);
      await api('/auth/password-reset/request', { method: 'POST', body: JSON.stringify(checked.data) });
      setSentTo(checked.data.email);
    });
  }

  const back = (
    <div className={styles.links}>
      <Link href={`/${locale}/login`}>{t.forgot.back}</Link>
    </div>
  );
  if (sentTo) {
    return (
      <>
        <Notice tone="success">
          <p className="heading">{t.forgot.doneTitle}</p>
          <p>{fill(t.forgot.doneBody, { email: sentTo })}</p>
        </Notice>
        {back}
      </>
    );
  }
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field label={t.form.email} name="email" type="email" autoComplete="email" inputMode="email" required error={error.fields.email} />
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.forgot.submit} sending={t.form.sending} />
      </div>
      {back}
    </form>
  );
}
