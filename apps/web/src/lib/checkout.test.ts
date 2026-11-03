import { afterEach, describe, expect, it, vi } from 'vitest';
import { goToCheckout } from './checkout';

const respond = (checkoutUrl: string) => vi.fn(async () => new Response(JSON.stringify({ checkoutUrl }), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('goToCheckout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['Stripe Checkout', 'https://checkout.stripe.com/c/pay/cs_test_1', 'https://checkout.stripe.com/c/pay/cs_test_1'],
    ['the test checkout on our own origin', '/v1/payments/dev-checkout/cs_dev_1', 'https://papperdash.se/v1/payments/dev-checkout/cs_dev_1'],
  ])('goes to %s', async (_, url, expected) => {
    vi.stubGlobal('window', { location: { origin: 'https://papperdash.se' } });
    vi.stubGlobal('fetch', respond(url));
    const navigate = vi.fn();
    await goToCheckout('ord_1', navigate);
    expect(navigate).toHaveBeenCalledWith(expected);
  });

  it('never goes anywhere else, whatever the answer says', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://papperdash.se' } });
    vi.stubGlobal('fetch', respond('https://evil.example/pay'));
    const navigate = vi.fn();
    await expect(goToCheckout('ord_1', navigate)).rejects.toThrow(/Unexpected checkout address/);
    expect(navigate).not.toHaveBeenCalled();
  });
});
