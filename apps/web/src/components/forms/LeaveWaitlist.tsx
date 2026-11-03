'use client';

import { useEffect, useState } from 'react';
import type { Messages } from '@/i18n/en';
import { api, ApiError } from '@/lib/api';
import { Notice } from './Field';
import styles from './forms.module.css';
import { SubmitButton } from './SubmitButton';
import { takeTokenFromUrl, useSubmit } from './useSubmit';

type T = Pick<Messages, 'waitlistLeave' | 'form' | 'errors'>;
type State = 'loading' | 'ready' | 'missing' | 'done' | 'used';

/** Needs a click: link scanners in mail systems open links, and must not remove anyone by doing so. */
export function LeaveWaitlist({ t }: { t: T }) {
  const { pending, error, run } = useSubmit(t.errors);
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const found = takeTokenFromUrl();
    setToken(found);
    setState(found ? 'ready' : 'missing');
  }, []);

  const leave = () =>
    run(async () => {
      try {
        await api('/waitlist/leave', { method: 'POST', body: JSON.stringify({ token }) });
        setState('done');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'link_expired') return setState('used');
        throw err;
      }
    });

  if (state === 'loading') return null;
  if (state === 'missing') return <Notice tone="error">{t.waitlistLeave.missingToken}</Notice>;
  if (state === 'done' || state === 'used') {
    return (
      <Notice tone="success">
        {state === 'done' ? (
          <>
            <p className="heading">{t.waitlistLeave.doneTitle}</p>
            <p>{t.waitlistLeave.doneBody}</p>
          </>
        ) : (
          <p>{t.waitlistLeave.usedBody}</p>
        )}
      </Notice>
    );
  }
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void leave();
      }}
    >
      <p>{t.waitlistLeave.body}</p>
      {error.form ? <Notice tone="error">{error.form}</Notice> : null}
      <div className={styles.actions}>
        <SubmitButton pending={pending} label={t.waitlistLeave.submit} sending={t.form.sending} />
      </div>
    </form>
  );
}
