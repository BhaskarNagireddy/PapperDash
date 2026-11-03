'use client';

import { useState } from 'react';
import type { Messages } from '@/i18n/en';
import { toFormError, type FormError } from '@/lib/errors';

const NO_ERROR: FormError = { fields: {} };

/**
 * Runs a form action once at a time and keeps its error in the visitor's language.
 * The action returns false to stop without an error (for example, when local validation set one).
 */
export function useSubmit(t: Messages['errors']) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError>(NO_ERROR);
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError(NO_ERROR);
    try {
      await action();
    } catch (err) {
      setError(toFormError(err, t));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, setError, run };
}

/** Reads a one-time token from the URL, then removes it from the address bar and history. */
export function takeTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (token) {
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
  return token;
}
