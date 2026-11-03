import type { Locale, Money } from '@papperdash/contracts';

/** "16,00 kr" in Swedish, "SEK 16.00" in English. Amounts are in minor units (öre). */
export function formatMoney(money: Money, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'sv' ? 'sv-SE' : 'en-GB', { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
}

/** "3 nov. 22:15" / "3 Nov, 22:15", in Swedish time. */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(new Date(iso));
}
