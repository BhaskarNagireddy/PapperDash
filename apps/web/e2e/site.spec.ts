import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('language', () => {
  test('visitors land on the Swedish site by default', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sv$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'sv');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Skriv ut. Hämta.');
  });

  test('switching to English stays on the same page and is remembered on the next visit', async ({ page }) => {
    await page.goto('/sv');
    await page.getByRole('link', { name: 'Switch to English' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Print it. Pick it up.');
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
  });

  test('an unknown page shows a 404 in the visitor\'s language with a way back', async ({ page }) => {
    const res = await page.goto('/sv/finns-inte');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sidan finns inte');
    await page.getByRole('link', { name: 'Gå till startsidan' }).click();
    await expect(page).toHaveURL(/\/sv$/);
  });
});

test.describe('accessibility and layout', () => {
  for (const locale of ['sv', 'en']) {
    test(`/${locale} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    });
  }

  test('the page never scrolls sideways and every link or button is at least 48px tall', async ({ page }) => {
    await page.goto('/sv');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const control of await page.locator('header a, main a, main button').all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0, await control.innerText()).toBeGreaterThanOrEqual(48);
    }
  });

  test('keyboard users can skip straight to the content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard navigation is a desktop concern');
    await page.goto('/sv');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Hoppa till innehållet' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });
});

test('pages are served with security headers and without framework fingerprints', async ({ request }) => {
  const res = await request.get('/sv');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['x-powered-by']).toBeUndefined();
});
