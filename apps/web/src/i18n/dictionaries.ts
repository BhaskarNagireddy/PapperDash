import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';
import { hasLocale, type Locale } from './config';
import { en, type Messages } from './en';
import { sv } from './sv';

const dictionaries: Record<Locale, Messages> = { en, sv };

/** The current page's language. Server Components only (next/root-params fails the build elsewhere). */
export async function currentLocale(): Promise<Locale> {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

/** Messages for the current page's language. */
export async function getMessages(): Promise<Messages> {
  return dictionaries[await currentLocale()];
}

export const messagesFor = (locale: Locale): Messages => dictionaries[locale];
