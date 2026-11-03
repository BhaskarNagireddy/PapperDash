import type { Locale } from '@papperdash/contracts';

/**
 * Where to go after logging in. Only a path on this site in the same language is accepted, so a crafted link
 * (?next=https://evil.example or ?next=//evil.example) cannot send the customer to another website.
 */
export function safeNext(next: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}/account`;
  if (!next || !next.startsWith(`/${locale}/`) || next.startsWith('//') || next.includes('\\')) return fallback;
  try {
    const url = new URL(next, 'https://papperdash.invalid');
    return url.origin === 'https://papperdash.invalid' ? url.pathname + url.search : fallback;
  } catch {
    return fallback;
  }
}
