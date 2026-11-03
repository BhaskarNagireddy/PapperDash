import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi, user } from './mock-api';

test.describe('waitlist', () => {
  test('explains problems in Swedish before anything is sent', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/sv/waitlist');
    await page.getByLabel('E-postadress').fill('inte-en-adress');
    await page.getByLabel('Postnummer').fill('12');
    await page.getByRole('button', { name: 'Ställ dig på väntelistan' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Kontrollera de markerade fälten.');
    await expect(page.getByText('Skriv en e-postadress som namn@exempel.se.')).toBeVisible();
    await expect(page.getByText('Skriv ett postnummer som 223 50, eller lämna fältet tomt.')).toBeVisible();
    await expect(page.getByText('Kryssa i rutan så att vi får mejla dig.')).toBeVisible();
    await expect(page.getByLabel('E-postadress')).toHaveAttribute('aria-invalid', 'true');
    expect(api.sent('POST /v1/waitlist')).toHaveLength(0);
  });

  test('joins with consent and shows where the confirmation went', async ({ page }) => {
    const api = await mockApi(page, { 'POST /v1/waitlist': () => ({ status: 202, body: { message: 'ok' } }) });
    await page.goto('/sv/waitlist');
    await page.getByLabel('E-postadress').fill(' Eva@Example.se ');
    await page.getByLabel('Postnummer').fill('223 50');
    await page.getByLabel(/Mejla mig en gång/).check();
    await page.getByRole('button', { name: 'Ställ dig på väntelistan' }).click();
    await expect(page.getByRole('status')).toContainText('Du står på listan');
    await expect(page.getByRole('status')).toContainText('eva@example.se');
    expect(api.sent('POST /v1/waitlist')[0]?.body).toEqual({ email: 'eva@example.se', postcode: '22350', consent: true, locale: 'sv' });
  });

  test('leaving needs a click, and the link’s token leaves the address bar', async ({ page }) => {
    const api = await mockApi(page, { 'POST /v1/waitlist/leave': () => ({ status: 204 }) });
    await page.goto('/sv/waitlist/leave?token=abcdefghijklmnopqrstuvwxyz');
    await expect(page.getByRole('button', { name: 'Ta bort mig' })).toBeVisible();
    expect(page.url()).not.toContain('token=');
    expect(api.sent('POST /v1/waitlist/leave')).toHaveLength(0);
    await page.getByRole('button', { name: 'Ta bort mig' }).click();
    await expect(page.getByRole('status')).toContainText('Du är borttagen');
    expect(api.sent('POST /v1/waitlist/leave')[0]?.body).toEqual({ token: 'abcdefghijklmnopqrstuvwxyz' });
  });
});

test.describe('sign-up', () => {
  test('tells an existing customer to log in instead', async ({ page }) => {
    await mockApi(page, { 'POST /v1/auth/register': () => ({ status: 409, body: { error: 'email_taken', message: 'An account with this email already exists.' } }) });
    await page.goto('/sv/signup');
    await page.getByLabel('E-postadress').fill('anna@example.se');
    await page.getByLabel('Lösenord', { exact: true }).fill('ett långt lösenord');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Det finns redan ett konto för den här e-postadressen. Logga in eller återställ lösenordet.');
  });

  test('creates the account in the page’s language and asks to confirm the email', async ({ page }) => {
    const api = await mockApi(page, { 'POST /v1/auth/register': () => ({ status: 201, body: { user: user({ emailVerified: false, locale: 'en' }), next: 'verify-email' } }) });
    await page.goto('/en/signup');
    await page.getByLabel('Email address').fill('anna@example.se');
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('a long enough password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('status')).toContainText('Check your inbox');
    expect(api.sent('POST /v1/auth/register')[0]?.body).toEqual({ email: 'anna@example.se', password: 'a long enough password', locale: 'en' });
  });
});

test.describe('login', () => {
  test('a wrong password gets one clear message, and a lockout says how long to wait', async ({ page }) => {
    let attempts = 0;
    await mockApi(page, {
      'POST /v1/auth/login': () =>
        ++attempts < 2
          ? { status: 401, body: { error: 'invalid_credentials', message: 'Wrong email or password.' } }
          : { status: 429, body: { error: 'too_many_attempts', message: 'Too many failed attempts.', retryAfterSec: 900 } },
    });
    await page.goto('/sv/login');
    await page.getByLabel('E-postadress').fill('anna@example.se');
    await page.getByLabel('Lösenord', { exact: true }).fill('fel');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Fel e-postadress eller lösenord. Försök igen eller återställ lösenordet.');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('För många misslyckade försök. Vänta 15 minuter eller återställ ditt lösenord.');
  });

  test('signs in, goes to the account page and updates the header', async ({ page }) => {
    let signedIn = false;
    await mockApi(page, {
      'POST /v1/auth/login': () => {
        signedIn = true;
        return { status: 200, body: { user: user(), token: 'x', expiresAt: '2026-12-01T00:00:00Z' } };
      },
      'GET /v1/auth/me': () => (signedIn ? { status: 200, body: { user: user() } } : { status: 401, body: { error: 'not_signed_in' } }),
    });
    await page.goto('/sv/login');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Logga in' })).toBeVisible();
    await page.getByLabel('E-postadress').fill('anna@example.se');
    await page.getByLabel('Lösenord', { exact: true }).fill('ett långt lösenord');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page).toHaveURL(/\/sv\/account$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ditt konto');
    await expect(page.getByText('anna@example.se')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Ditt konto' })).toBeVisible();
  });

  test('never follows a "next" link to another website', async ({ page }) => {
    await mockApi(page, {
      'POST /v1/auth/login': () => ({ status: 200, body: { user: user(), token: 'x', expiresAt: '2026-12-01T00:00:00Z' } }),
      'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }),
    });
    await page.goto('/sv/login?next=//evil.example/sv/');
    await page.getByLabel('E-postadress').fill('anna@example.se');
    await page.getByLabel('Lösenord', { exact: true }).fill('ett långt lösenord');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page).toHaveURL('/sv/account');
  });

  test('says so when there is no connection', async ({ page }) => {
    await mockApi(page);
    await page.route('**/v1/auth/login', (route) => route.abort('internetdisconnected'));
    await page.goto('/sv/login');
    await page.getByLabel('E-postadress').fill('anna@example.se');
    await page.getByLabel('Lösenord', { exact: true }).fill('ett långt lösenord');
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Ingen anslutning. Kontrollera internet och försök igen.');
  });
});

test.describe('email links', () => {
  test('confirming the email happens on opening the link, and the token leaves the address bar', async ({ page }) => {
    const api = await mockApi(page, { 'POST /v1/auth/verify-email': () => ({ status: 204 }) });
    await page.goto('/sv/verify-email?token=abcdefghijklmnopqrstuvwxyz');
    await expect(page.getByRole('status')).toContainText('E-postadressen är bekräftad');
    expect(page.url()).not.toContain('token=');
    expect(api.sent('POST /v1/auth/verify-email')).toHaveLength(1);
  });

  test('an old verification link explains what to do next', async ({ page }) => {
    await mockApi(page, { 'POST /v1/auth/verify-email': () => ({ status: 410, body: { error: 'link_expired', message: 'expired' } }) });
    await page.goto('/sv/verify-email?token=abcdefghijklmnopqrstuvwxyz');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Länken fungerar inte längre');
    await expect(page.getByRole('link', { name: 'Logga in' }).last()).toHaveAttribute('href', '/sv/login?next=/sv/account');
  });

  test('forgot password always gives the same answer', async ({ page }) => {
    await mockApi(page, { 'POST /v1/auth/password-reset/request': () => ({ status: 202, body: { message: 'ok' } }) });
    await page.goto('/sv/forgot-password');
    await page.getByLabel('E-postadress').fill('vem@example.se');
    await page.getByRole('button', { name: 'Skicka länk' }).click();
    await expect(page.getByRole('status')).toContainText('Om det finns ett konto för vem@example.se har vi skickat en länk.');
  });

  test('a new password needs 10 characters, then everyone is logged out', async ({ page }) => {
    const api = await mockApi(page, { 'POST /v1/auth/password-reset/confirm': () => ({ status: 204 }) });
    await page.goto('/sv/reset-password?token=abcdefghijklmnopqrstuvwxyz');
    await expect(page.getByLabel('Nytt lösenord')).toBeVisible();
    expect(page.url()).not.toContain('token=');
    await page.getByLabel('Nytt lösenord').fill('kort');
    await page.getByRole('button', { name: 'Spara lösenord' }).click();
    await expect(page.getByText('Använd minst 10 tecken.')).toBeVisible();
    expect(api.sent('POST /v1/auth/password-reset/confirm')).toHaveLength(0);
    await page.getByLabel('Nytt lösenord').fill('ett nytt långt lösenord');
    await page.getByRole('button', { name: 'Spara lösenord' }).click();
    await expect(page.getByRole('status')).toContainText('Lösenordet är ändrat');
    expect(api.sent('POST /v1/auth/password-reset/confirm')[0]?.body).toEqual({ token: 'abcdefghijklmnopqrstuvwxyz', password: 'ett nytt långt lösenord' });
  });

  test('a reset page without a token offers a new link', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sv/reset-password');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Länken är ofullständig. Öppna den igen från mejlet.');
    await expect(page.getByRole('link', { name: 'Skicka en ny länk' })).toHaveAttribute('href', '/sv/forgot-password');
  });
});

test.describe('account', () => {
  test('sends visitors who are not signed in to log in, and back afterwards', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sv/account');
    await expect(page).toHaveURL('/sv/login?next=/sv/account');
  });

  test('an unconfirmed customer can get the link again and sees that ordering is not open yet', async ({ page }) => {
    const api = await mockApi(page, {
      'GET /v1/auth/me': () => ({ status: 200, body: { user: user({ emailVerified: false }) } }),
      'POST /v1/auth/verify-email/resend': () => ({ status: 202, body: { message: 'ok' } }),
    });
    await page.goto('/sv/account');
    await expect(page.getByText('Inte bekräftad')).toBeVisible();
    await expect(page.getByText('Beställningar öppnar med vår första station i Lund.')).toBeVisible();
    await page.getByRole('button', { name: 'Skicka länken igen' }).click();
    await expect(page.getByText('Vi har skickat en ny länk. Titta i din inkorg.')).toBeVisible();
    expect(api.sent('POST /v1/auth/verify-email/resend')).toHaveLength(1);
  });

  test('logging out returns to the start page', async ({ page }) => {
    let signedIn = true;
    await mockApi(page, {
      'GET /v1/auth/me': () => (signedIn ? { status: 200, body: { user: user() } } : { status: 401, body: { error: 'not_signed_in' } }),
      'POST /v1/auth/logout': () => {
        signedIn = false;
        return { status: 204 };
      },
    });
    await page.goto('/sv/account');
    await page.getByRole('button', { name: 'Logga ut' }).click();
    await expect(page).toHaveURL(/\/sv$/);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Logga in' })).toBeVisible();
  });
});

const PAGES = ['waitlist', 'signup', 'login', 'forgot-password', 'reset-password?token=abcdefghijklmnopqrstuvwxyz', 'verify-email', 'waitlist/leave?token=abcdefghijklmnopqrstuvwxyz'];

test.describe('every account page', () => {
  for (const path of PAGES) {
    test(`/sv/${path.split('?')[0]} has no WCAG 2.2 AA violations, no sideways scroll and 48px targets`, async ({ page }) => {
      await mockApi(page);
      await page.goto(`/sv/${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      for (const control of await page.locator('header a, main a, main button, main input').all()) {
        const box = await control.boundingBox();
        expect(box?.height ?? 0, (await control.getAttribute('name')) ?? (await control.innerText())).toBeGreaterThanOrEqual(48);
      }
    });
  }

  test('pages opened from email links are not indexed by search engines', async ({ request }) => {
    for (const path of ['verify-email', 'reset-password', 'waitlist/leave', 'account']) {
      const html = await (await request.get(`/sv/${path}`)).text();
      expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  });
});
