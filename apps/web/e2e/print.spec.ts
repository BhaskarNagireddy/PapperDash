import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import { mockApi, user } from './mock-api';
import { pdfWithPages } from './pdf';

// The price list in force (migration 0003): whole-order prices by printed pages, VAT included.
const TIERS = [
  { fromPages: 1, toPages: 5, priceMinor: 1000 },
  { fromPages: 6, toPages: 15, priceMinor: 1600 },
  { fromPages: 16, toPages: 25, priceMinor: 2500 },
  { fromPages: 26, toPages: 50, priceMinor: 5000 },
];
const PRICES = { id: 'prl_1', market: 'SE', currency: 'SEK', vatRateBp: 2500, maxPages: 50, maxFileMb: 50, bwTiers: TIERS, colourTiers: null, activeFrom: '2026-09-27T00:00:00Z' };
const STATION = { id: 'lund-central-1', name: 'Lund C', address: 'Bangatan 1', city: 'Lund', lockers: true };

const doc = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'doc_1',
  fileName: 'tenta.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1000,
  status,
  pageCount: status === 'ready' ? 12 : null,
  rejection: null,
  deleteAfter: '2026-11-03T22:00:00Z',
  createdAt: '2026-11-03T20:00:00Z',
  ...extra,
});

/** Prices a quote request like core: selected pages x copies, then the tier. */
function quoteFor(req: Request) {
  const body = req.postDataJSON() as { settings: { copies: number; pageRange?: string } };
  const range = body.settings.pageRange;
  const pages = range ? range.split(',').reduce((n, part) => {
    const [a, b] = part.split('-').map(Number);
    return n + ((b ?? a!) - a! + 1);
  }, 0) : 12;
  const printed = pages * body.settings.copies;
  if (printed > 50) return { status: 422, body: { error: 'too_many_pages', message: 'x', maxPages: 50 } };
  const total = TIERS.find((t) => printed >= t.fromPages && printed <= t.toPages)!.priceMinor;
  return {
    status: 200,
    body: { pages, documentPages: 12, quote: { priceListId: 'prl_1', printedPages: printed, lines: [], total: { amountMinor: total, currency: 'SEK' }, vat: { amountMinor: Math.round(total / 5), currency: 'SEK' } } },
  };
}

async function setup(page: Page, opts: { ordering?: boolean; stations?: unknown[]; verified?: boolean; processed?: Record<string, unknown> } = {}) {
  let polls = 0;
  return mockApi(page, {
    'GET /v1/auth/me': () => ({ status: 200, body: { user: user({ emailVerified: opts.verified ?? true }) } }),
    'GET /v1/status': () => ({ status: 200, body: { ordering: opts.ordering ?? false } }),
    'GET /v1/pricing': () => ({ status: 200, body: PRICES }),
    'GET /v1/stations': () => ({ status: 200, body: { stations: opts.stations ?? [STATION] } }),
    'POST /v1/documents': () => ({ status: 201, body: { document: doc('awaiting_upload'), upload: { url: '/v1/documents/dev-upload', fields: { key: 'source/doc_1', 'Content-Type': 'application/pdf' }, expiresAt: '', maxBytes: 52428800 } } }),
    'POST /v1/documents/dev-upload': () => ({ status: 204 }),
    'POST /v1/documents/doc_1/complete': () => ({ status: 200, body: doc('processing') }),
    // Processing takes one poll, as it does for a real file.
    'GET /v1/documents/doc_1': () => ({ status: 200, body: polls++ < 1 ? doc('processing') : doc(opts.processed ? 'rejected' : 'ready', opts.processed ?? {}) }),
    'DELETE /v1/documents/doc_1': () => ({ status: 204 }),
    'POST /v1/orders/quote': quoteFor,
    'POST /v1/orders': () => ({ status: 201, body: { id: 'ord_1', reference: 'PD-7K3M9Q', state: 'Draft' } }),
  });
}

const choosePdf = (page: Page, name = 'tenta.pdf') => page.locator('#file').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdfWithPages(12) });

test.describe('order step', () => {
  test('visitors who are not signed in log in first and come back', async ({ page }) => {
    await mockApi(page);
    await page.goto('/sv/print');
    await expect(page).toHaveURL('/sv/login?next=/sv/print');
  });

  test('shows the page count and the price for this document, and re-prices as settings change', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByTestId('page-count')).toHaveText('12 sidor');
    // 12 printed pages -> 16 kr including 3,20 kr VAT.
    await expect(page.getByTestId('price-total')).toHaveText(/16,00\s*kr/);
    await expect(page.getByText(/Varav moms 3,20\s*kr/)).toBeVisible();
    await expect(page.getByText('12 × 1 = 12 utskrivna sidor')).toBeVisible();

    await page.getByLabel('Antal kopior').fill('2');
    await expect(page.getByTestId('price-total')).toHaveText(/25,00\s*kr/);
    await page.getByLabel('Bara vissa sidor').check();
    await page.getByLabel('Vilka sidor').fill('1-2');
    await expect(page.getByTestId('price-total')).toHaveText(/10,00\s*kr/);

    // The upload sent the file with the signed fields, and the last quote carried every choice.
    expect(api.sent('POST /v1/documents')[0]?.body).toEqual({ fileName: 'tenta.pdf', contentType: 'application/pdf', sizeBytes: pdfWithPages(12).length });
    expect(api.sent('POST /v1/orders/quote').at(-1)?.body).toEqual({
      documentId: 'doc_1',
      settings: { colour: 'bw', duplex: false, copies: 2, paperSize: 'A4', pageRange: '1-2' },
      fulfilment: 'walk-up',
      stationId: 'lund-central-1',
    });
  });

  test('explains when an order is over the page limit', async ({ page }) => {
    await setup(page);
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByTestId('price-total')).toBeVisible();
    await page.getByLabel('Antal kopior').fill('5');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Vi skriver ut upp till 50 sidor per beställning. Välj färre sidor eller kopior, eller dela upp den på flera beställningar.');
  });

  test('while ordering is closed, shows the price and offers the waitlist instead of ordering', async ({ page }) => {
    await setup(page, { ordering: false });
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByTestId('price-total')).toBeVisible();
    await expect(page.getByText('Beställningar öppnar med vår första station.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ställ dig på väntelistan' })).toHaveAttribute('href', '/sv/waitlist');
    await expect(page.getByRole('button', { name: 'Beställ' })).toHaveCount(0);
  });

  test('when ordering is open, places the order at the chosen station', async ({ page }) => {
    const api = await setup(page, { ordering: true });
    await page.goto('/sv/print');
    await choosePdf(page);
    await page.getByLabel(/Hämta i ett skåp/).check();
    await expect(page.getByTestId('price-total')).toBeVisible();
    await page.getByRole('button', { name: 'Beställ' }).click();
    await expect(page.getByRole('status')).toContainText('Beställning PD-7K3M9Q är sparad');
    expect(api.sent('POST /v1/orders')[0]?.body).toMatchObject({ fulfilment: 'locker', stationId: 'lund-central-1' });
  });

  test('an unconfirmed email is asked to confirm before ordering', async ({ page }) => {
    await setup(page, { ordering: true, verified: false });
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByText('Bekräfta din e-postadress innan du beställer.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Beställ' })).toHaveCount(0);
  });

  test('without an open station, only delivery can be chosen', async ({ page }) => {
    const api = await setup(page, { stations: [] });
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByLabel(/Skriv ut vid stationen/)).toBeDisabled();
    await expect(page.getByLabel(/Hämta i ett skåp/)).toBeDisabled();
    await expect(page.getByLabel(/^Leverans/)).toBeChecked();
    await expect(page.getByText('Vår första station öppnar snart i Lund, så du kan inte välja någon än.')).toBeVisible();
    await expect(page.getByText('Budföretaget tar betalt för leveransen i sin egen app.')).toBeVisible();
    await expect(page.getByTestId('price-total')).toBeVisible();
    expect(api.sent('POST /v1/orders/quote').at(-1)?.body).toMatchObject({ fulfilment: 'delivery' });
  });

  test('a password-protected PDF gets a Swedish explanation', async ({ page }) => {
    await setup(page, { processed: { rejection: { reason: 'encrypted', message: 'The PDF is password protected.' } } });
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('PDF-filen är lösenordsskyddad. Ta bort lösenordet och ladda upp den igen.');
  });

  test('a file type we cannot print is refused before uploading', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/sv/print');
    await page.locator('#file').setInputFiles({ name: 'anteckningar.txt', mimeType: 'text/plain', buffer: Buffer.from('hej') });
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Den här filtypen stöds inte. Ladda upp en PDF, JPG, PNG, Word-, Excel- eller PowerPoint-fil.');
    expect(api.sent('POST /v1/documents')).toHaveLength(0);
  });

  test('the customer can delete the file right away', async ({ page }) => {
    const api = await setup(page);
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByTestId('page-count')).toBeVisible();
    await page.getByRole('button', { name: 'Ta bort filen' }).click();
    await expect(page.getByTestId('page-count')).toHaveCount(0);
    expect(api.sent('DELETE /v1/documents/doc_1')).toHaveLength(1);
  });

  test('has no WCAG 2.2 AA violations, no sideways scroll and 48px targets with a file chosen', async ({ page }) => {
    await setup(page, { ordering: true });
    await page.goto('/sv/print');
    await choosePdf(page);
    await expect(page.getByTestId('price-total')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    for (const control of await page.locator('header a, main a, main button, main label[class*="radio"], main select, main input:not([type="radio"]):not([type="file"])').all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0, (await control.getAttribute('id')) ?? (await control.innerText())).toBeGreaterThanOrEqual(48);
    }
  });
});
