import type { Messages } from './en';

/** Swedish messages. The type makes a missing or extra key a build error. */
export const sv: Messages = {
  meta: {
    title: 'PapperDash — skriv ut utan studentkort',
    description: 'Ladda upp en fil, betala och hämta din utskrift vid en PapperDash-station, i ett skåp eller med bud.',
  },
  site: {
    skipToContent: 'Hoppa till innehållet',
    home: 'PapperDash startsida',
    languageSwitch: 'English',
    languageSwitchLabel: 'Switch to English',
    footerTagline: 'Utskrifter för alla, utan studentkort.',
    footerCity: 'Vi börjar i Lund.',
  },
  home: {
    heroTitle: 'Skriv ut. Hämta.',
    heroBody: 'Ladda upp en PDF, ett Word-dokument eller en bild, välj inställningar och betala. Hämta vid en PapperDash-station, i ett skåp eller få det levererat.',
    comingSoon: 'Vår första station öppnar snart i Lund.',
    howTitle: 'Så fungerar det',
    steps: {
      upload: { title: 'Ladda upp', body: 'PDF, Word, Excel, PowerPoint eller en bild, upp till 50 MB.' },
      configure: { title: 'Välj', body: 'Sidor, antal kopior och dubbelsidigt. Du ser priset innan du betalar.' },
      pay: { title: 'Betala', body: 'Kort, Apple Pay, Google Pay eller Klarna.' },
      collect: { title: 'Hämta', body: 'I stationens fack, i ett skåp eller med bud.' },
    },
    privacyNote: 'Dina filer raderas automatiskt 24 timmar efter att du hämtat dem.',
  },
  notFound: {
    title: 'Sidan finns inte',
    body: 'Adressen kan vara felstavad, eller så har sidan flyttats.',
    back: 'Gå till startsidan',
  },
};
