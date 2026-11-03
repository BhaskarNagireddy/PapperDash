import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, user } from './mock-api';

const order = (state: string, extra: Record<string, unknown> = {}) => ({
  id: 'ord_1',
  reference: 'PD-7K3M9Q',
  customerId: 'usr_1',
  documentId: 'doc_1',
  settings: { colour: 'bw', duplex: false, copies: 2, paperSize: 'A4' },
  pages: 3,
  fulfilment: 'delivery',
  stationId: null,
  state,
  total: { amountMinor: 1600, currency: 'SEK' },
  createdAt: '2026-11-03T20:00:00Z',
  updatedAt: '2026-11-03T20:00:00Z',
  ...extra,
});
const payment = (status: string) => ({ id: 'pay_1', orderId: 'ord_1', status, amount: { amountMinor: 1600, currency: 'SEK' }, refundedMinor: 0, createdAt: '' });

async function orderApi(page: Page, states: string[], handlers: Parameters<typeof mockApi>[1] = {}) {
  let i = 0;
  return mockApi(page, {
    'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }),
    'GET /v1/orders/ord_1': () => ({ status: 200, body: order(states[Math.min(i++, states.length - 1)]!) }),
    'GET /v1/orders/ord_1/payment': () => ({ status: 200, body: { payment: payment('requires_action') } }),
    ...handlers,
  });
}

test.describe('checkout and the order page', () => {
  test('after paying, waits for the payment to be confirmed and says thank you', async ({ page }) => {
    // Stripe's webhook can arrive a moment after the customer: the first answer is still "awaiting payment".
    await orderApi(page, ['AwaitingPayment', 'Paid']);
    await page.goto('/sv/orders/ord_1?checkout=success');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beställning PD-7K3M9Q');
    await expect(page.getByText('Tack. Din betalning är klar.')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('dl').getByText('Betald', { exact: true })).toBeVisible();
    await expect(page.getByTestId('order-total')).toHaveText(/16,00\s*kr/);
    await expect(page.getByText('3 sidor × 2 kopior')).toBeVisible();
    expect(page.url()).not.toContain('checkout=');
  });

  test('a cancelled payment offers to pay again or cancel the order', async ({ page }) => {
    let cancelled = false;
    const api = await mockApi(page, {
      'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }),
      'GET /v1/orders/ord_1': () => ({ status: 200, body: order(cancelled ? 'Cancelled' : 'AwaitingPayment') }),
      'GET /v1/orders/ord_1/payment': () => ({ status: 200, body: { payment: payment(cancelled ? 'cancelled' : 'requires_action') } }),
      'POST /v1/orders/ord_1/cancel': () => {
        cancelled = true;
        return { status: 200, body: order('Cancelled') };
      },
    });
    await page.goto('/sv/orders/ord_1?checkout=cancelled');
    await expect(page.getByText('Du lämnade betalningen innan du betalade.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Betala 16,00\s*kr/ })).toBeVisible();
    await page.getByRole('button', { name: 'Avbryt beställningen' }).click();
    await expect(page.getByText('Beställningen är avbruten. Inget har dragits.')).toBeVisible();
    await expect(page.getByText('Avbruten', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skriv ut ett till dokument' })).toBeVisible();
    expect(api.sent('POST /v1/orders/ord_1/cancel')).toHaveLength(1);
  });

  test('"Pay" goes to the payment page', async ({ page }) => {
    await orderApi(page, ['AwaitingPayment'], {
      'POST /v1/orders/ord_1/checkout': () => ({ status: 200, body: { checkoutUrl: '/v1/payments/dev-checkout/cs_dev_1' } }),
    });
    await page.route('**/v1/payments/dev-checkout/cs_dev_1', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Testbetalning</h1>' }));
    await page.goto('/sv/orders/ord_1');
    await page.getByRole('button', { name: /Betala 16,00\s*kr/ }).click();
    await expect(page).toHaveURL(/\/v1\/payments\/dev-checkout\/cs_dev_1$/);
  });

  test('an order of another account is not shown', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }),
      'GET /v1/orders/ord_x': () => ({ status: 404, body: { error: 'not_found' } }),
      'GET /v1/orders/ord_x/payment': () => ({ status: 404, body: { error: 'not_found' } }),
    });
    await page.goto('/sv/orders/ord_x');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Vi hittar inte den här beställningen. Den kan tillhöra ett annat konto.');
  });

  test('visitors who are not signed in log in and come back to the order', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sv/orders/ord_1?checkout=success');
    await expect(page).toHaveURL('/sv/login?next=/sv/orders/ord_1');
  });

  test('placing an order goes straight to payment; if payment cannot start, the order is kept', async ({ page }) => {
    await mockApi(page, {
      'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }),
      'GET /v1/status': () => ({ status: 200, body: { ordering: true } }),
      'GET /v1/pricing': () => ({ status: 200, body: { maxFileMb: 50, colourTiers: null } }),
      'GET /v1/stations': () => ({ status: 200, body: { stations: [] } }),
      'POST /v1/documents': () => ({ status: 201, body: { document: { id: 'doc_1', status: 'awaiting_upload' }, upload: { url: '/v1/documents/dev-upload', fields: {}, maxBytes: 1 } } }),
      'POST /v1/documents/dev-upload': () => ({ status: 204 }),
      'POST /v1/documents/doc_1/complete': () => ({ status: 200, body: {} }),
      'GET /v1/documents/doc_1': () => ({ status: 200, body: { id: 'doc_1', fileName: 'a.pdf', status: 'ready', pageCount: 3, deleteAfter: null } }),
      'POST /v1/orders/quote': () => ({ status: 200, body: { pages: 3, documentPages: 3, quote: { printedPages: 3, total: { amountMinor: 1000, currency: 'SEK' }, vat: { amountMinor: 200, currency: 'SEK' } } } }),
      'POST /v1/orders': () => ({ status: 201, body: order('Draft') }),
      'POST /v1/orders/ord_1/checkout': () => ({ status: 503, body: { error: 'payments_unavailable', message: 'x' } }),
    });
    await page.goto('/sv/print');
    await page.locator('#file').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(page.getByTestId('price-total')).toBeVisible();
    await page.getByRole('button', { name: 'Beställ och betala' }).click();
    await expect(page.getByText('Beställning PD-7K3M9Q är sparad')).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Betalningen fungerar inte just nu. Din beställning är sparad: försök igen om några minuter.');
    await expect(page.getByRole('link', { name: 'Öppna beställningen' })).toHaveAttribute('href', '/sv/orders/ord_1');
  });

  test('the order page has no WCAG 2.2 AA violations, no sideways scroll and 48px targets', async ({ page }) => {
    await orderApi(page, ['AwaitingPayment']);
    await page.goto('/sv/orders/ord_1?checkout=cancelled');
    await expect(page.getByRole('button', { name: 'Avbryt beställningen' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const control of await page.locator('header a, main a, main button').all()) {
      expect((await control.boundingBox())?.height ?? 0, await control.innerText()).toBeGreaterThanOrEqual(48);
    }
  });
});
