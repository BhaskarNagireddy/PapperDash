import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, localeInPath, localizedPath } from './i18n/config';

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Sends visitors without a language in the URL to /sv (or their remembered language) and remembers the choice. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const locale = localeInPath(pathname);
  if (!locale) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(pathname, request.cookies.get(LOCALE_COOKIE)?.value);
    url.search = search;
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
  }
  return response;
}

export const config = {
  // Pages only: not the API (/v1, served by core), Next.js internals, or files such as /favicon.ico or /robots.txt.
  matcher: [{ source: '/((?!v1/|_next/|.*\\..*).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
