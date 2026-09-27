import { WebhookSignatureError } from '@papperdash/contracts';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { StripePaymentProvider } from './stripe.provider.js';

const settings = { secretKey: 'rk_test_123', webhookSecret: 'whsec_test_secret', automaticTax: false };

/** Runs the real Stripe SDK against a recorded fake of Stripe's HTTP API. */
function withFakeStripe(respond: (url: string, body: URLSearchParams) => { status?: number; json: unknown }, overrides: Partial<typeof settings> = {}) {
  const requests: { url: string; method: string; body: URLSearchParams; headers: Headers }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    requests.push({ url, method: init?.method ?? 'GET', body, headers: new Headers(init?.headers as Record<string, string>) });
    const r = respond(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
  }) as typeof fetch;
  return { provider: new StripePaymentProvider({ ...settings, ...overrides }, Stripe.createFetchHttpClient(fetchFn)), requests };
}

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_1',
  object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/cs_1',
  status: 'open',
  payment_status: 'unpaid',
  amount_total: 1600,
  currency: 'sek',
  payment_intent: null,
  expires_at: 1790000000,
  ...over,
});
const expiresAt = new Date(1790000000 * 1000);
const checkoutInput = {
  orderId: 'ord_1',
  reference: 'PD-ABC123',
  amount: { amountMinor: 1600, currency: 'SEK' as const },
  customerEmail: 'a@b.se',
  idempotencyKey: 'checkout:ord_1:1',
  successUrl: 'https://papperdash.se/orders/ord_1?checkout=success',
  cancelUrl: 'https://papperdash.se/orders/ord_1?checkout=cancelled',
  expiresAt,
};

function signed(event: Record<string, unknown>) {
  const payload = JSON.stringify({ object: 'event', ...event });
  return { body: Buffer.from(payload), signature: Stripe.webhooks.generateTestHeaderString({ payload, secret: settings.webhookSecret }) };
}

describe('StripePaymentProvider (Checkout Sessions)', () => {
  it('creates a hosted checkout for the order price, VAT-inclusive, with dynamic payment methods and an idempotency key', async () => {
    const { provider, requests } = withFakeStripe(() => ({ json: session() }));
    const res = await provider.createCheckout(checkoutInput);
    expect(res).toEqual({ providerPaymentId: 'cs_1', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_1', status: 'requires_action', expiresAt });

    const req = requests[0]!;
    expect(req.url).toMatch(/\/v1\/checkout\/sessions$/);
    const body = Object.fromEntries(req.body);
    expect(body).toMatchObject({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'sek',
      'line_items[0][price_data][unit_amount]': '1600',
      'line_items[0][price_data][tax_behavior]': 'inclusive',
      'line_items[0][price_data][product_data][name]': 'PapperDash print order PD-ABC123',
      'automatic_tax[enabled]': 'false',
      customer_email: 'a@b.se',
      client_reference_id: 'ord_1',
      'metadata[orderId]': 'ord_1',
      'payment_intent_data[metadata][orderId]': 'ord_1',
      success_url: checkoutInput.successUrl,
      cancel_url: checkoutInput.cancelUrl,
      expires_at: '1790000000',
      integration_identifier: expect.stringMatching(/^papperdash-order-checkout-[a-z]{8}$/),
    });
    // Stripe's rule: never restrict payment methods in code; the Dashboard decides (card, Apple/Google Pay, Klarna).
    expect(Object.keys(body).some((k) => k.startsWith('payment_method_types'))).toBe(false);
    expect(req.headers.get('idempotency-key')).toBe('checkout:ord_1:1');
  });

  it('turns on Stripe Tax only when configured', async () => {
    const { provider, requests } = withFakeStripe(() => ({ json: session() }), { automaticTax: true });
    await provider.createCheckout(checkoutInput);
    expect(requests[0]!.body.get('automatic_tax[enabled]')).toBe('true');
  });

  it('expires an open checkout, and reports one that was already paid', async () => {
    const open = withFakeStripe(() => ({ json: session({ status: 'expired' }) }));
    expect(await open.provider.cancelCheckout('cs_1')).toBe(true);
    expect(open.requests[0]!.url).toMatch(/\/v1\/checkout\/sessions\/cs_1\/expire$/);
    const paid = withFakeStripe(() => ({ status: 400, json: { error: { type: 'invalid_request_error', message: 'Only open sessions can be expired.' } } }));
    expect(await paid.provider.cancelCheckout('cs_1')).toBe(false);
  });

  it('refunds against the PaymentIntent with an idempotency key and maps pending refunds', async () => {
    const { provider, requests } = withFakeStripe(() => ({ json: { id: 're_1', object: 'refund', status: 'pending' } }));
    const res = await provider.refund({ paymentReference: 'pi_1', amount: { amountMinor: 500, currency: 'SEK' }, idempotencyKey: 'refund:ref_1' });
    expect(res).toEqual({ providerRefundId: 're_1', status: 'pending' });
    expect(Object.fromEntries(requests[0]!.body)).toMatchObject({ payment_intent: 'pi_1', amount: '500' });
    expect(requests[0]!.headers.get('idempotency-key')).toBe('refund:ref_1');
  });

  describe('webhooks', () => {
    const { provider } = withFakeStripe(() => ({ json: {} }));

    it('treats a completed, paid checkout as a successful payment', () => {
      const e = signed({ id: 'evt_1', type: 'checkout.session.completed', data: { object: session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' }) } });
      expect(provider.parseWebhook(e.body, e.signature)).toEqual({
        eventId: 'evt_1',
        kind: 'payment.succeeded',
        providerPaymentId: 'cs_1',
        paymentReference: 'pi_1',
        amount: { amountMinor: 1600, currency: 'SEK' },
      });
    });

    it('does not treat a completed but unpaid (Klarna) checkout as paid until the async result arrives', () => {
      const done = signed({ id: 'evt_2', type: 'checkout.session.completed', data: { object: session({ status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_2' }) } });
      expect(provider.parseWebhook(done.body, done.signature)).toMatchObject({ kind: 'payment.processing', paymentReference: 'pi_2' });
      const ok = signed({ id: 'evt_3', type: 'checkout.session.async_payment_succeeded', data: { object: session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_2' }) } });
      expect(provider.parseWebhook(ok.body, ok.signature)).toMatchObject({ kind: 'payment.succeeded', paymentReference: 'pi_2' });
      const failed = signed({ id: 'evt_4', type: 'checkout.session.async_payment_failed', data: { object: session({ status: 'complete' }) } });
      expect(provider.parseWebhook(failed.body, failed.signature)).toEqual({ eventId: 'evt_4', kind: 'payment.failed', providerPaymentId: 'cs_1' });
    });

    it('maps expired checkouts and ignores unrelated events', () => {
      const exp = signed({ id: 'evt_5', type: 'checkout.session.expired', data: { object: session({ status: 'expired' }) } });
      expect(provider.parseWebhook(exp.body, exp.signature)).toEqual({ eventId: 'evt_5', kind: 'payment.expired', providerPaymentId: 'cs_1' });
      const other = signed({ id: 'evt_6', type: 'customer.created', data: { object: {} } });
      expect(provider.parseWebhook(other.body, other.signature)).toEqual({ eventId: 'evt_6', kind: 'ignored', type: 'customer.created' });
    });

    it('rejects tampered or wrongly signed webhooks', () => {
      const e = signed({ id: 'evt_7', type: 'checkout.session.completed', data: { object: session({ payment_status: 'paid' }) } });
      expect(() => provider.parseWebhook(Buffer.from(e.body.toString().replace('1600', '1')), e.signature)).toThrow(WebhookSignatureError);
      const wrong = Stripe.webhooks.generateTestHeaderString({ payload: e.body.toString(), secret: 'whsec_other' });
      expect(() => provider.parseWebhook(e.body, wrong)).toThrow(WebhookSignatureError);
    });
  });
});
