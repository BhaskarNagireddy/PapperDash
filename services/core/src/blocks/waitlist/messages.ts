import type { Locale } from '@papperdash/contracts';

export const waitlistEmails = {
  joined: (locale: Locale, leaveLink: string) =>
    locale === 'sv'
      ? {
          subject: 'Du står på PapperDash väntelista',
          text: `Tack. Vi mejlar dig en gång när PapperDash öppnar nära dig.\n\nVill du inte stå kvar? Ta bort dig här:\n${leaveLink}`,
        }
      : {
          subject: 'You are on the PapperDash waitlist',
          text: `Thank you. We will email you once when PapperDash opens near you.\n\nChanged your mind? Remove yourself here:\n${leaveLink}`,
        },
};
