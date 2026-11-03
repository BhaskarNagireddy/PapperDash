'use client';

import { JoinWaitlistInput, type Locale } from '@papperdash/contracts';
import { useState, type FormEvent } from 'react';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill, validate } from '@/lib/errors';
import { Checkbox, Field, Notice } from './Field';
import { SubmitButton } from './SubmitButton';
import styles from './forms.module.css';
import { useSubmit } from './useSubmit';

type T = Pick<Messages, 'waitlist' | 'form' | 'errors'>;

export function WaitlistForm({ locale, t }: { locale: Locale; t: T }) {
  const { pending, error, setError, run } = useSubmit(t.errors);
  const [joined, setJoined] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const postcode = String(form.get('postcode') ?? '').trim();
    const input = { email: form.get('email'), postcode: postcode || undefined, consent: form.get('consent') === 'on', locale };
    void run(async () => {
      const checked = validate(JoinWaitlistInput, input, t.errors);
      if (!checked.ok) return setError(checked.error);
      await api('/waitlist', { method: 'POST', body: JSON.stringify(checked.data) });
      setJoined(checked.data.email);
    });
  }

  if (joined) {
    return (
      <Notice tone="success">
        <p className="heading">{t.waitlist.doneTitle}</p>
        <p>{fill(t.waitlist.doneBody, { email: joined })}</p>
      </Notice>
    );
  }
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <Field label={t.form.email} name="email" type="email" autoComplete="email" inputMode="email" required error={error.fields.email} />
      <Field label={t.waitlist.postcode} note={t.form.optional} hint={t.waitlist.postcodeHint} name="postcode" autoComplete="postal-code" inputMode="numeric" error={error.fields.postcode} />
      <Checkbox label={t.waitlist.consent} name="consent" required error={error.fields.consent} />
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.waitlist.submit} sending={t.form.sending} />
      </div>
      <p className="small muted">{t.waitlist.privacy}</p>
    </form>
  );
}
