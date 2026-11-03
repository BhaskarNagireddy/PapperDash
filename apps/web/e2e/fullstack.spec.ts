import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { CORE_LOG } from '../playwright.config';
import { pdfWithPages } from './pdf';

// The real thing: browser -> Next.js (/v1 rewrite) -> core -> PostgreSQL, with the HttpOnly session cookie.
// Core runs in development mode, which writes emails to its log instead of sending them.

const run = Date.now().toString(36);
const email = (name: string) => `${name}-${run}@example.se`;

/** The newest link sent to `to`, read from core's log (polls: the email is written just after the response). */
async function linkFor(to: string, path: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const log = await readFile(CORE_LOG, 'utf8').catch(() => '');
    const blocks = log.split(`To ${to}:`);
    const match = blocks.length > 1 ? blocks.at(-1)!.match(new RegExp(`(http://localhost:3000/\\w\\w/${path}\\?token=[A-Za-z0-9_-]+)`)) : null;
    if (match?.[1]) return match[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No ${path} email for ${to} in ${CORE_LOG}`);
}

async function signUp(page: Page, address: string, password: string) {
  await page.goto('/sv/signup');
  await page.getByLabel('E-postadress').fill(address);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Skapa konto' }).click();
  await expect(page.getByRole('status')).toContainText('Titta i din inkorg');
}

async function logIn(page: Page, address: string, password: string) {
  await page.goto('/sv/login');
  await page.getByLabel('E-postadress').fill(address);
  await page.getByLabel('Lösenord', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(/\/sv\/account$/);
}

test('sign up, confirm the email from the link, log in and out', async ({ page }) => {
  const address = email('anna');
  await signUp(page, address, 'ett långt lösenord');

  // The link in the email opens the Swedish page and confirms the address.
  await page.goto(await linkFor(address, 'verify-email'));
  await expect(page.getByRole('status')).toContainText('E-postadressen är bekräftad');

  await logIn(page, address, 'ett långt lösenord');
  await expect(page.getByText(address)).toBeVisible();
  await expect(page.getByText('Bekräftad', { exact: true })).toBeVisible();
  // Ordering is open in this test setup, so the account page does not show the "opens soon" notice.
  await expect(page.getByText('Beställningar öppnar med vår första station i Lund.')).toHaveCount(0);
  // The session cookie is HttpOnly: page scripts cannot read it.
  expect(await page.evaluate(() => document.cookie)).not.toContain('pd_session');

  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(page).toHaveURL(/\/sv$/);
  await page.goto('/sv/account');
  await expect(page).toHaveURL('/sv/login?next=/sv/account');
});

test('reset a forgotten password from the email link', async ({ page }) => {
  const address = email('bo');
  await signUp(page, address, 'det gamla lösenordet');
  await page.goto('/sv/forgot-password');
  await page.getByLabel('E-postadress').fill(address);
  await page.getByRole('button', { name: 'Skicka länk' }).click();
  await expect(page.getByRole('status')).toContainText('Titta i din inkorg');

  await page.goto(await linkFor(address, 'reset-password'));
  await page.getByLabel('Nytt lösenord').fill('det nya lösenordet');
  await page.getByRole('button', { name: 'Spara lösenord' }).click();
  await expect(page.getByRole('status')).toContainText('Lösenordet är ändrat');

  await logIn(page, address, 'det nya lösenordet');
});

test('join and leave the waitlist', async ({ page }) => {
  const address = email('eva');
  await page.goto('/sv/waitlist');
  await page.getByLabel('E-postadress').fill(address);
  await page.getByLabel(/Mejla mig en gång/).check();
  await page.getByRole('button', { name: 'Ställ dig på väntelistan' }).click();
  await expect(page.getByRole('status')).toContainText('Du står på listan');

  await page.goto(await linkFor(address, 'waitlist/leave'));
  await page.getByRole('button', { name: 'Ta bort mig' }).click();
  await expect(page.getByRole('status')).toContainText('Du är borttagen');
});

test('upload a PDF: core counts its pages and the order step shows that document’s price', async ({ page }) => {
  const address = email('cia');
  await signUp(page, address, 'ett långt lösenord');
  await page.goto(await linkFor(address, 'verify-email'));
  await expect(page.getByRole('status')).toContainText('E-postadressen är bekräftad');
  await logIn(page, address, 'ett långt lösenord');

  await page.getByRole('link', { name: 'Skriv ut ett dokument' }).click();
  await expect(page).toHaveURL(/\/sv\/print$/);
  await page.locator('#file').setInputFiles({ name: 'tenta.pdf', mimeType: 'application/pdf', buffer: pdfWithPages(7) });

  // Core received the file, counted 7 pages and priced it from the seeded price list: 6-15 pages = 16 kr.
  await expect(page.getByTestId('page-count')).toHaveText('7 sidor', { timeout: 20_000 });
  await expect(page.getByTestId('price-total')).toHaveText(/16,00\s*kr/);
  await page.getByLabel('Bara vissa sidor').check();
  await page.getByLabel('Vilka sidor').fill('1-3');
  await expect(page.getByTestId('price-total')).toHaveText(/10,00\s*kr/);
  await page.getByLabel('Vilka sidor').fill('5-9');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Välj sidor som finns i dokumentet, till exempel 1-3,5.');

  // No station is open in a fresh database, so delivery is the choice.
  await expect(page.getByLabel(/^Leverans/)).toBeChecked();

  await page.getByRole('button', { name: 'Ta bort filen' }).click();
  await expect(page.getByTestId('page-count')).toHaveCount(0);
});

test('order and pay: the test checkout pays through the real webhook code and the order becomes Paid', async ({ page }) => {
  const address = email('dan');
  await signUp(page, address, 'ett långt lösenord');
  await page.goto(await linkFor(address, 'verify-email'));
  await expect(page.getByRole('status')).toContainText('E-postadressen är bekräftad');
  await logIn(page, address, 'ett långt lösenord');

  await page.goto('/sv/print');
  await page.locator('#file').setInputFiles({ name: 'tenta.pdf', mimeType: 'application/pdf', buffer: pdfWithPages(3) });
  await expect(page.getByTestId('price-total')).toHaveText(/10,00\s*kr/, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Beställ och betala' }).click();

  // Core's test checkout stands in for Stripe: it says no money moves and shows the order's own price.
  await expect(page.getByRole('heading', { name: 'Testbetalning' })).toBeVisible();
  await expect(page.getByTestId('dev-amount')).toHaveText('10,00 kr');
  await page.getByRole('button', { name: 'Betala (test)' }).click();

  // Back on the order page, which waits for the webhook's effect on the order.
  await expect(page).toHaveURL(/\/sv\/orders\/ord_[A-Z0-9]+$/);
  await expect(page.getByText('Tack. Din betalning är klar.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Betald', { exact: true })).toBeVisible();
  await expect(page.getByTestId('order-total')).toHaveText(/10,00\s*kr/);
});

test('leave the payment page without paying, then cancel the order', async ({ page }) => {
  const address = email('eda');
  await signUp(page, address, 'ett långt lösenord');
  await page.goto(await linkFor(address, 'verify-email'));
  await logIn(page, address, 'ett långt lösenord');
  await page.goto('/sv/print');
  await page.locator('#file').setInputFiles({ name: 'tenta.pdf', mimeType: 'application/pdf', buffer: pdfWithPages(2) });
  await expect(page.getByTestId('price-total')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Beställ och betala' }).click();
  await page.getByRole('button', { name: 'Avbryt' }).click();

  await expect(page.getByText('Du lämnade betalningen innan du betalade.')).toBeVisible();
  await expect(page.getByText('Väntar på betalning', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Avbryt beställningen' }).click();
  await expect(page.getByText('Avbruten', { exact: true })).toBeVisible();
});
