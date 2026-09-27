import type { Locale } from '@papperdash/contracts';

// Auth emails live with identity because they carry its secrets. Order notifications belong to the notifications block.
export const authEmails = {
  verify: (locale: Locale, link: string) =>
    locale === 'sv'
      ? { subject: 'Bekräfta din e-postadress för PapperDash', text: `Bekräfta din e-postadress genom att öppna länken:\n${link}\n\nLänken gäller i 24 timmar.` }
      : { subject: 'Confirm your email for PapperDash', text: `Confirm your email address by opening this link:\n${link}\n\nThe link is valid for 24 hours.` },
  reset: (locale: Locale, link: string) =>
    locale === 'sv'
      ? { subject: 'Återställ ditt PapperDash-lösenord', text: `Välj ett nytt lösenord här:\n${link}\n\nLänken gäller i 1 timme. Har du inte bett om detta kan du ignorera mejlet.` }
      : { subject: 'Reset your PapperDash password', text: `Choose a new password here:\n${link}\n\nThe link is valid for 1 hour. If you did not ask for this, ignore this email.` },
};
