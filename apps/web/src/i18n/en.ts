/** English messages: the source of every key. sv.ts must provide the same keys (enforced by its type). */
export const en = {
  meta: {
    title: 'PapperDash — print without a student card',
    description: 'Upload a file, pay, and pick up your printout at a PapperDash station, from a locker, or by delivery.',
  },
  site: {
    skipToContent: 'Skip to content',
    home: 'PapperDash home',
    languageSwitch: 'Svenska',
    languageSwitchLabel: 'Byt till svenska',
    footerTagline: 'Public printing without a student card.',
    footerCity: 'Starting in Lund, Sweden.',
  },
  home: {
    heroTitle: 'Print it. Pick it up.',
    heroBody: 'Upload a PDF, Word or image file, choose your settings and pay. Collect it at a PapperDash station, from a locker, or have it delivered.',
    comingSoon: 'Our first station opens soon in Lund.',
    howTitle: 'How it works',
    steps: {
      upload: { title: 'Upload', body: 'PDF, Word, Excel, PowerPoint or an image, up to 50 MB.' },
      configure: { title: 'Configure', body: 'Pages, copies and double-sided. You see the price before you pay.' },
      pay: { title: 'Pay', body: 'Card, Apple Pay, Google Pay or Klarna.' },
      collect: { title: 'Collect', body: 'From the station tray, a locker, or by delivery.' },
    },
    privacyNote: 'Your files are deleted automatically 24 hours after you collect them.',
  },
  notFound: {
    title: 'Page not found',
    body: 'The address may be mistyped, or the page has moved.',
    back: 'Go to the start page',
  },
} as const;

type Widen<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** The shape every language must fill. */
export type Messages = Widen<typeof en>;
