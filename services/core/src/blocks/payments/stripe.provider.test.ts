import { WebhookSignatureError } from '@papperdash/contracts';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { StripePaymentProvider } from './stripe.provider.js';

const settings = { secretKey: 'sk_test_123', publishableKey: 'pk_test_123', webhookSecret: 'whsec_test_secret' };

/** Runs the real Stripe SDK against a recorded fake of Stripe's HTTP API. */
function withFakeStripe(respond: (url: string, body: URLSearchParams) => { status?: number; json: unknown }) {
  const requests: { url: string; method: string; body: URLSearchParams; headers: Headers }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    requests.push({ url, method: init?.method ?? 'GET', body, headers: new Headers(init?.headers as Record<string, string>) });
    const r = respond(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
  }) as typeof fetch;
  return { provider: new StripePaymentProvider(settings, Stripe.createFetchHttpClient(fetchFn)), requests };
}

const intent = (over: Record<string, unknown> = {}) => ({ id: 'pi_1', object: 'payment_intent', client_secret: 'pi_1_secret_abc', status: 'requires_payment_method', amount: 1600, currency: 'sek', ...over });

describe('StripePaymentProvider', () => {
  it('creates a PaymentIntent for the order price with automatic payment methods and an idempotency key', async () => {
    const { provider, requests } = withFakeStripe(() => ({ json: intent() }));
    const res = await provider.createPayment({ orderId: 'ord_1', reference: 'PD-ABC123', amount: { amountMinor: 1600, currency: 'SEK' }, customerEmail: 'a@b.se', idempotencyKey: 'payment:ord_1:1' });
    expect(res).toEqual({ providerPaymentId: 'pi_1', clientSecret: 'pi_1_secret_abc', status: 'requires_action' });

    const req = requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toMatch(/\/v1\/payment_intents$/);
    expect(Object.fromEntries(req.body)).toMatchObject({
      amount: '1600',
      currency: 'sek',
      'automatic_payment_methods[enabled]': 'true',
      receipt_email: 'a@b.se',
      'metadata[orderId]': 'ord_1',
      'metadata[reference]': 'PD-ABC123',
    });
    expect(req.headers.get('idempotency-key')).toBe('payment:ord_1:1');
  });

  it('reports a payment that can no longer be cancelled', async () => {
    const { provider } = withFakeStripe(() => ({ status: 400, json: { error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state', message: 'already succeeded' } } }));
    expect(await provider.cancelPayment('pi_1')).toBe(false);
  });

  it('refunds with an idempotency key and maps Klarna-style pending refunds', async () => {
    const { provider, requests } = withFakeStripe(() => ({ json: { id: 're_1', object: 'refund', status: 'pending' } }));
    const res = await provider.refund({ providerPaymentId: 'pi_1', amount: { amountMinor: 500, currency: 'SEK' }, idempotencyKey: 'refund:ref_1' });
    expect(res).toEqual({ providerRefundId: 're_1', status: 'pending' });
    expect(Object.fromEntries(requests[0]!.body)).toMatchObject({ payment_intent: 'pi_1', amount: '500' });
    expect(requests[0]!.headers.get('idempotency-key')).toBe('refund:ref_1');
  });

  it('accepts correctly signed webhooks and rejects tampered ones', () => {
    const { provider } = withFakeStripe(() => ({ json: {} }));
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'payment_intent.succeeded', data: { object: intent({ status: 'succeeded', amount_received: 1600 }) } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: settings.webhookSecret });

    expect(provider.parseWebhook(Buffer.from(payload), signature)).toEqual({
      eventId: 'evt_1',
      kind: 'payment.succeeded',
      providerPaymentId: 'pi_1',
      amount: { amountMinor: 1600, currency: 'SEK' },
    });
    expect(() => provider.parseWebhook(Buffer.from(payload.replace('1600', '1')), signature)).toThrow(WebhookSignatureError);
    const wrongSecret = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(() => provider.parseWebhook(Buffer.from(payload), wrongSecret)).toThrow(WebhookSignatureError);
  });

  it('ignores event types PapperDash does not use', () => {
    const { provider } = withFakeStripe(() => ({ json: {} }));
    const payload = JSON.stringify({ id: 'evt_2', object: 'event', type: 'customer.created', data: { object: {} } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: settings.webhookSecret });
    expect(provider.parseWebhook(Buffer.from(payload), signature)).toEqual({ eventId: 'evt_2', kind: 'ignored', type: 'customer.created' });
  });
});
