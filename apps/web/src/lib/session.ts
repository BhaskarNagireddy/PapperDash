'use client';

import type { CurrentUser } from '@papperdash/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Tells the header that someone signed in or out, so it can update without a page load. */
export const SESSION_CHANGED = 'pd:session-changed';
export const announceSessionChange = () => window.dispatchEvent(new Event(SESSION_CHANGED));

export type SessionState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: CurrentUser } | { status: 'error' };

/**
 * The signed-in customer, read from /v1/auth/me. The session cookie is HttpOnly, so scripts cannot see it:
 * asking the server is the only way to know, and it stays the single source of truth.
 */
export function useSession(): SessionState & { refresh: () => void } {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const refresh = useCallback(() => {
    api<{ user: CurrentUser }>('/auth/me').then(
      ({ user }) => setState({ status: 'signed-in', user }),
      (err: unknown) => setState(err instanceof ApiError && err.status === 401 ? { status: 'signed-out' } : { status: 'error' }),
    );
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(SESSION_CHANGED, refresh);
    return () => window.removeEventListener(SESSION_CHANGED, refresh);
  }, [refresh]);
  return { ...state, refresh };
}
