import { LOCALES, type Locale } from '@papperdash/contracts';

export { LOCALES, type Locale };

/** Visitors see Swedish first; English is one click away and remembered (decision 2026-11-03). */
export const DEFAULT_LOCALE: Locale = 'sv';
/** Remembers the visitor's language choice for a year. Functional, so no consent banner is needed. */
export const LOCALE_COOKIE = 'pd_locale';

export const hasLocale = (value: string | undefined): value is Locale => !!value && (LOCALES as readonly string[]).includes(value);

/** The locale a path starts with, if any: "/en/prices" -> "en". */
export function localeInPath(pathname: string): Locale | undefined {
  const first = pathname.split('/')[1];
  return hasLocale(first) ? first : undefined;
}

/** Where to send a visitor whose URL has no locale: their remembered choice, else Swedish. */
export function localizedPath(pathname: string, remembered: string | undefined): string {
  const locale = hasLocale(remembered) ? remembered : DEFAULT_LOCALE;
  return `/${locale}${pathname === '/' ? '' : pathname}`;
}

/** The same page in another language: "/sv/prices" -> "/en/prices". */
export function switchLocale(pathname: string, to: Locale): string {
  const current = localeInPath(pathname);
  const rest = current ? pathname.slice(current.length + 1) : pathname;
  return `/${to}${rest === '/' ? '' : rest}`;
}
