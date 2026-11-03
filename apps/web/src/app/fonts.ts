import localFont from 'next/font/local';

// Self-hosted from npm (@fontsource): no request to Google from the visitor's browser, so no IP is shared with a
// third party (GDPR), and the fonts work offline in tests. Latin + Latin Extended cover Swedish (å, ä, ö) and more.
export const hanken = localFont({
  src: [
    { path: '../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-ext-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-hanken',
  display: 'swap',
});

export const jetbrainsMono = localFont({
  src: [
    { path: '../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-jetbrains',
  display: 'swap',
});
