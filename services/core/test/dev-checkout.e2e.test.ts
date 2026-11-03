import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readyDocument, signUp, startHarness, type Harness } from './harness.js';

let h: Harness;
let off: Harness;
beforeAll(async () => {
  h = await startHarness({ config: { devPayments: true } });
  off = await startHarness();
});
afterAll(async () => {
  await h.close();
  await off.close();
});

const bearer = (token: string) => `Bearer ${token}`;

async function placedOrder(harness: Harness, email: string) {
  const { token } = await signUp(harness, email);
  const doc = await readyDocument(harness, token, 3);
  const order = await harness.http().post('/v1/orders').set('Authorization', bearer(token)).send({ documentId: doc, settings: { copies: 1 }, fulfilment: 'delivery' }).expect(201);
  return { token, orderId: order.body.id as string, reference: order.body.reference as string };
}

describe('test checkout (no Stripe keys, outside production)', () => {
  it('pays an order end to end through the same webhook code as Stripe, and returns to the order page', async () => {
    const { token, orderId, reference } = await placedOrder(h, 'dev-pay@example.se');
    const checkout = await h.http().post(`/v1/orders/${orderId}/checkout`).set('Authorization', bearer(token)).expect(200);
    expect(checkout.body).toMatchObject({ provider: 'dev', status: 'requires_action', amount: { amountMinor: 1000, currency: 'SEK' } });
    const url = checkout.body.checkoutUrl as string;
    expect(url).toMatch(/^\/v1\/payments\/dev-checkout\/cs_dev_[0-9a-f]{16}$/);

    // The page says plainly that no money moves, and shows the order and amount.
    const page = await h.http().get(url).expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Inga pengar dras');
    expect(page.text).toContain(reference);
    expect(page.text).toContain('10,00 kr');

    // Asking again while it is open returns the same checkout, like Stripe.
    expect((await h.http().post(`/v1/orders/${orderId}/checkout`).set('Authorization', bearer(token)).expect(200)).body.checkoutUrl).toBe(url);

    const paid = await h.http().post(`${url}/pay`).expect(303);
    expect(paid.headers.location).toBe(`https://papperdash.test/en/orders/${orderId}?checkout=success`);
    await h.flush();
    const order = await h.http().get(`/v1/orders/${orderId}`).set('Authorization', bearer(token)).expect(200);
    expect(order.body.state).toBe('Paid');
    expect((await h.http().get(`/v1/orders/${orderId}/payment`).set('Authorization', bearer(token)).expect(200)).body.payment).toMatchObject({ status: 'succeeded' });

    // Paying twice is impossible: the page is closed and a new checkout is refused.
    await h.http().post(`${url}/pay`).expect(404);
    await h.http().get(url).expect(404);
    expect((await h.http().post(`/v1/orders/${orderId}/checkout`).set('Authorization', bearer(token)).expect(409)).body.error).toBe('already_paid');
  });

  it('closes the page when the order is cancelled', async () => {
    const { token, orderId } = await placedOrder(h, 'dev-cancel@example.se');
    const { checkoutUrl } = (await h.http().post(`/v1/orders/${orderId}/checkout`).set('Authorization', bearer(token)).expect(200)).body;
    await h.http().post(`/v1/orders/${orderId}/cancel`).set('Authorization', bearer(token)).expect(200);
    await h.flush();
    await h.http().post(`${checkoutUrl}/pay`).expect(404);
  });

  it('does not exist with Stripe or in production: checkout answers payments_unavailable and the page is 404', async () => {
    const { token, orderId } = await placedOrder(off, 'no-dev@example.se');
    expect((await off.http().post(`/v1/orders/${orderId}/checkout`).set('Authorization', bearer(token)).expect(503)).body.error).toBe('payments_unavailable');
    await off.http().get('/v1/payments/dev-checkout/cs_dev_0000000000000000').expect(404);
    await off.http().post('/v1/payments/dev-checkout/cs_dev_0000000000000000/pay').expect(404);
  });

  it('refuses a webhook signed with anything but its own secret', async () => {
    const body = JSON.stringify({ eventId: 'evt_x', kind: 'payment.succeeded', providerPaymentId: 'cs_dev_x', paymentReference: 'pi', amount: { amountMinor: 1, currency: 'SEK' } });
    await h.http().post('/v1/payments/webhooks/stripe').set('stripe-signature', 'forged').set('content-type', 'application/json').send(body).expect(400);
  });
});
