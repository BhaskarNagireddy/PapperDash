import type { Metadata } from 'next';
import { LOCALES } from '@papperdash/contracts';
import { currentLocale, getMessages } from './dictionaries';
import type { Messages } from './en';

/**
 * Title, language alternates and indexing for one page. Pages opened from an email link (they carry a
 * one-time token) and the account page are never indexed.
 */
export async function pageMetadata(path: string, title: (t: Messages) => string, { index = true } = {}): Promise<Metadata> {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return {
    title: `${title(t)} — PapperDash`,
    alternates: { canonical: `/${locale}/${path}`, languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/${path}`])) },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
