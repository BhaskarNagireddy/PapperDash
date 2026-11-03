import type { Metadata, Viewport } from 'next';
import { LOCALES } from '@papperdash/contracts';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { hanken, jetbrainsMono } from '../fonts';
import '../globals.css';

export const dynamicParams = false;
export const generateStaticParams = () => LOCALES.map((lang) => ({ lang }));

export const viewport: Viewport = { themeColor: '#f6f4ef', width: 'device-width', initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return {
    title: t.meta.title,
    description: t.meta.description,
    metadataBase: new URL(process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000'),
    alternates: { canonical: `/${locale}`, languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
  };
}

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <html lang={locale} className={`${hanken.variable} ${jetbrainsMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          {t.site.skipToContent}
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
