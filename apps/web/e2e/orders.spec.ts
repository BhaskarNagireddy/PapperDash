import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi, user } from './mock-api';

const order = (id: string, reference: string, state: string, extra: Record<string, unknown> = {}) => ({
  id,
  reference,
  customerId: 'usr_1',
  documentId: 'doc_1',
  settings: { colour: 'bw', duplex: false, copies: 1, paperSize: 'A4' },
  pages: 3,
  fulfilment: 'delivery',
  stationId: null,
  state,
  total: { amountMinor: 1000, currency: 'SEK' },
  createdAt: '2026-11-03T19:00:00Z',
  updatedAt: '2026-11-03T19:00:00Z',
  ...extra,
});
const signedIn = { 'GET /v1/auth/me': () => ({ status: 200, body: { user: user() } }) };

test.describe('order history', () => {
  test('lists the customer’s orders with status and total, each linking to its page', async ({ page }) => {
    await mockApi(page, {
      ...signedIn,
      'GET /v1/orders': () => ({ status: 200, body: { orders: [order('ord_2', 'PD-BBBBBB', 'Printing'), order('ord_1', 'PD-AAAAAA', 'Completed', { total: { amountMinor: 1600, currency: 'SEK' } })] } }),
    });
    await page.goto('/sv/orders');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dina beställningar');
    const rows = page.getByRole('main').getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('PD-BBBBBB');
    await expect(rows.nth(0)).toContainText('Skrivs ut');
    await expect(rows.nth(1)).toContainText(/16,00\s*kr/);
    await expect(rows.nth(1)).toContainText('Klar');
    await expect(page.getByRole('link', { name: /PD-BBBBBB/ })).toHaveAttribute('href', '/sv/orders/ord_2');
  });

  test('with no orders yet, offers to print one', async ({ page }) => {
    await mockApi(page, { ...signedIn, 'GET /v1/orders': () => ({ status: 200, body: { orders: [] } }) });
    await page.goto('/sv/orders');
    await expect(page.getByText('Du har inga beställningar än.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skriv ut ett dokument' })).toHaveAttribute('href', '/sv/print');
  });

  test('visitors who are not signed in log in first', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sv/orders');
    await expect(page).toHaveURL('/sv/login?next=/sv/orders');
  });

  test('has no WCAG 2.2 AA violations and 48px targets', async ({ page }) => {
    await mockApi(page, { ...signedIn, 'GET /v1/orders': () => ({ status: 200, body: { orders: [order('ord_1', 'PD-AAAAAA', 'Paid')] } }) });
    await page.goto('/sv/orders');
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    for (const control of await page.locator('header a, main a, main button').all()) {
      expect((await control.boundingBox())?.height ?? 0, await control.innerText()).toBeGreaterThanOrEqual(48);
    }
  });
});

test.describe('order tracking', () => {
  test('shows the milestones for a delivery, with the current one marked, and updates by itself', async ({ page }) => {
    await page.clock.install();
    let state = 'Printing';
    await mockApi(page, {
      ...signedIn,
      'GET /v1/orders/ord_1': () => ({ status: 200, body: order('ord_1', 'PD-AAAAAA', state) }),
      'GET /v1/orders/ord_1/payment': () => ({ status: 200, body: { payment: { status: 'succeeded' } } }),
    });
    await page.goto('/sv/orders/ord_1');
    const steps = page.getByRole('region', { name: 'Var din beställning är' }).getByRole('listitem');
    await expect(steps).toHaveText(['Betald', 'Skrivs ut', 'Väntar på bud', 'Ute för leverans', 'Levererad']);
    await expect(steps.nth(0)).toHaveAttribute('data-status', 'done');
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');

    // The courier collects it: the page shows it without a reload.
    state = 'OutForDelivery';
    await page.clock.fastForward(16_000);
    await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
    await expect(page.getByText('Ute för leverans', { exact: true }).first()).toBeVisible();
  });

  test('a locker order shows its own path', async ({ page }) => {
    await mockApi(page, {
      ...signedIn,
      'GET /v1/orders/ord_1': () => ({ status: 200, body: order('ord_1', 'PD-AAAAAA', 'Ready', { fulfilment: 'locker', stationId: 'lund-1' }) }),
      'GET /v1/orders/ord_1/payment': () => ({ status: 200, body: { payment: { status: 'succeeded' } } }),
    });
    await page.goto('/sv/orders/ord_1');
    const steps = page.getByRole('region', { name: 'Var din beställning är' }).getByRole('listitem');
    await expect(steps).toHaveText(['Betald', 'Skrivs ut', 'Redo att hämta', 'Hämtad']);
    await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  });

  test('an order with support explains what happens instead of showing progress', async ({ page }) => {
    await mockApi(page, {
      ...signedIn,
      'GET /v1/orders/ord_1': () => ({ status: 200, body: order('ord_1', 'PD-AAAAAA', 'SupportRequired') }),
      'GET /v1/orders/ord_1/payment': () => ({ status: 200, body: { payment: { status: 'succeeded' } } }),
    });
    await page.goto('/sv/orders/ord_1');
    await expect(page.getByText('Vår support tittar på din beställning och hör av sig till dig.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Var din beställning är' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Alla dina beställningar' })).toHaveAttribute('href', '/sv/orders');
  });
});
