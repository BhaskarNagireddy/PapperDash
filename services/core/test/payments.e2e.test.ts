import type { PaymentProviderEvent } from '@papperdash/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/blocks/identity/identity.service.js';
import { OrdersService } from '../src/blocks/orders/index.js';
import { PAYMENT_PROVIDER } from '../src/blocks/payments/index.js';
import { FakePaymentProvider } from './fake-payments.js';
import { readyDocument, signUp, startHarness, type Harness } from './harness.js';

let h: Harness;
let stripe: FakePaymentProvider;
let supportToken: string;
const system = { kind: 'system', block: 'test' } as const;

beforeAll(async () => {
  stripe = new FakePaymentProvider();
  h = await startHarness({ overrides: [[PAYMENT_PROVIDER, stripe]] });
  const support = await signUp(h, 'support@papperdash.se');
  await h.app.get(IdentityService).setRoles(support.user.id, ['support']);
  supportToken = support.token;
});
afterAll(() => h.close());

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const webhook = (event: PaymentProviderEvent, signature = 'fake-valid-signature') =>
  h.http().post('/v1/payments/webhooks/stripe').set('stripe-signature', signature).set('content-type', 'application/json').send(JSON.stringify(event));
const getOrder = async (t: string, id: string) => (await h.http().get(`/v1/orders/${id}`).set(auth(t)).expect(200)).body;

/** A signed-up customer with a 3-page, 2-copy delivery order (6 printed pages = 16 kr). */
async function customerWithOrder(email: string) {
  const { token } = await signUp(h, email);
  const documentId = await readyDocument(h, token, 3);
  const { body: order } = await h.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: { copies: 2 } }).expect(201);
  return { token, order };
}

async function paidOrder(email: string) {
  const c = await customerWithOrder(email);
  const { body: checkout } = await h.http().post(`/v1/orders/${c.order.id}/checkout`).set(auth(c.token)).expect(200);
  await webhook(stripe.succeed(stripe.intents.get([...stripe.intents.keys()].pop()!)!.id)).expect(200);
  await h.flush();
  return { ...c, checkout };
}

describe('checkout', () => {
  it('charges the price stored on the order and returns what the payment form needs', async () => {
    const { token, order } = await customerWithOrder('pay@example.se');
    const res = await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    expect(res.body).toMatchObject({
      orderId: order.id,
      status: 'requires_action',
      amount: { amountMinor: 1600, currency: 'SEK' },
      provider: 'stripe',
      publishableKey: 'pk_test_fake',
      clientSecret: expect.stringMatching(/_secret$/),
    });
    expect((await getOrder(token, order.id)).state).toBe('AwaitingPayment');

    // Returning to checkout resumes the same payment instead of charging twice.
    const again = await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    expect(again.body.paymentId).toBe(res.body.paymentId);
  });

  it('only the customer who owns the order can pay for it', async () => {
    const { order } = await customerWithOrder('owner2@example.se');
    const { token: other } = await signUp(h, 'stranger@example.se');
    await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(other)).expect(404);
  });

  it('answers clearly when payments are switched off', async () => {
    const off = await startHarness();
    try {
      const { token } = await signUp(off, 'nokeys@example.se');
      const documentId = await readyDocument(off, token);
      const { body: order } = await off.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: {} }).expect(201);
      const res = await off.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(503);
      expect(res.body.error).toBe('payments_unavailable');
    } finally {
      await off.close();
    }
  });
});

describe('confirmed payments', () => {
  it('moves the order from awaiting payment to paid, once, even if Stripe repeats the webhook', async () => {
    const { token, order } = await customerWithOrder('confirm@example.se');
    const { body: checkout } = await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    const event = stripe.succeed([...stripe.intents.keys()].pop()!);
    await webhook(event).expect(200);
    await webhook(event).expect(200);
    await h.flush();

    expect((await getOrder(token, order.id)).state).toBe('Paid');
    const { body } = await h.http().get(`/v1/orders/${order.id}/payment`).set(auth(token)).expect(200);
    expect(body.payment).toMatchObject({ id: checkout.paymentId, status: 'succeeded', amount: { amountMinor: 1600 } });
    const history = await h.app.get(OrdersService).history(order.id);
    expect(history.filter((r) => r.toState === 'Paid')).toHaveLength(1);

    await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(409);
  });

  it('rejects webhooks with a bad signature', async () => {
    await webhook({ eventId: 'evt_forged', kind: 'payment.succeeded', providerPaymentId: 'pi_x', amount: { amountMinor: 1, currency: 'SEK' } }, 'forged').expect(400);
    await h.http().post('/v1/payments/webhooks/stripe').send({}).expect(400);
  });

  it('lets the customer try again after a declined payment, as a new attempt', async () => {
    const { token, order } = await customerWithOrder('declined@example.se');
    const first = await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    const pi = [...stripe.intents.keys()].pop()!;
    await webhook({ eventId: 'evt_declined', kind: 'payment.failed', providerPaymentId: pi }).expect(200);
    await h.flush();
    expect((await getOrder(token, order.id)).state).toBe('AwaitingPayment');

    const second = await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    expect(second.body.paymentId).not.toBe(first.body.paymentId);
    expect([...stripe.intents.keys()].pop()).not.toBe(pi);
  });

  it('cancels the open payment when the customer cancels the order', async () => {
    const { token, order } = await customerWithOrder('changed-mind@example.se');
    await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    const pi = [...stripe.intents.keys()].pop()!;
    await h.http().post(`/v1/orders/${order.id}/cancel`).set(auth(token)).expect(200);
    await h.flush();
    expect(stripe.intents.get(pi)!.status).toBe('cancelled');
  });

  it('refunds automatically when a payment completes after the order was cancelled', async () => {
    const { token, order } = await customerWithOrder('race@example.se');
    await h.http().post(`/v1/orders/${order.id}/checkout`).set(auth(token)).expect(200);
    const pi = [...stripe.intents.keys()].pop()!;
    const success = stripe.succeed(pi); // the customer paid at the same moment…
    await h.http().post(`/v1/orders/${order.id}/cancel`).set(auth(token)).expect(200); // …as they cancelled
    await h.flush();
    await webhook(success).expect(200);
    await h.flush();

    expect((await getOrder(token, order.id)).state).toBe('Cancelled');
    expect(stripe.refunds.filter((r) => r.providerPaymentId === pi)).toEqual([expect.objectContaining({ amount: { amountMinor: 1600, currency: 'SEK' } })]);
  });
});

describe('refunds', () => {
  it('only support and admin staff can refund', async () => {
    const { token, order } = await paidOrder('selfrefund@example.se');
    await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(token)).send({ reason: 'I want my money' }).expect(403);
  });

  it('refunds part of an order without changing it, then the rest, which marks it refunded', async () => {
    const { token, order } = await paidOrder('partial@example.se');
    const part = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ amountMinor: 600, reason: 'One page printed badly' }).expect(201);
    expect(part.body).toMatchObject({ status: 'succeeded', amount: { amountMinor: 600 } });
    await h.flush();
    expect((await getOrder(token, order.id)).state).toBe('Paid');

    const tooMuch = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ amountMinor: 1001, reason: 'Too much' }).expect(422);
    expect(tooMuch.body.message).toBe('At most 10,00 kr can still be refunded.');

    await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Customer cancelled' }).expect(201);
    await h.flush();
    // Two partial refunds that add up to everything are money back in full, but the order was not refunded in one go.
    const { body } = await h.http().get(`/v1/orders/${order.id}/payment`).set(auth(token)).expect(200);
    expect(body.payment.refundedMinor).toBe(1600);
    await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Again' }).expect(409);
  });

  it('a full refund moves the order to Refunded', async () => {
    const { token, order } = await paidOrder('full@example.se');
    const res = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Station out of paper' }).expect(201);
    expect(res.body).toMatchObject({ amount: { amountMinor: 1600 }, status: 'succeeded' });
    await h.flush();
    expect((await getOrder(token, order.id)).state).toBe('Refunded');
    const list = await h.http().get(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).expect(200);
    expect(list.body.refunds).toHaveLength(1);
  });

  it('will not refund in full while the order is printing, but allows a partial refund', async () => {
    const { order } = await paidOrder('printing@example.se');
    const orders = h.app.get(OrdersService);
    await orders.transition(order.id, 'Queued', system);
    await orders.transition(order.id, 'Printing', system);
    const res = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Wrong' }).expect(409);
    expect(res.body.error).toBe('not_refundable_now');
    await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ amountMinor: 100, reason: 'Late' }).expect(201);
  });

  it('waits for Stripe to confirm slow refunds (e.g. Klarna) before marking the order refunded', async () => {
    const { token, order } = await paidOrder('klarna@example.se');
    stripe.refundStatus = 'pending';
    try {
      const res = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Klarna refund' }).expect(201);
      expect(res.body.status).toBe('pending');
      await h.flush();
      expect((await getOrder(token, order.id)).state).toBe('Paid');

      await webhook({ eventId: 'evt_refund_done', kind: 'refund.updated', providerRefundId: stripe.refunds.at(-1)!.id, status: 'succeeded' }).expect(200);
      await h.flush();
      expect((await getOrder(token, order.id)).state).toBe('Refunded');
    } finally {
      stripe.refundStatus = 'succeeded';
    }
  });

  it('reports a refund Stripe refuses, without blocking a later refund', async () => {
    const { order } = await paidOrder('disputed@example.se');
    stripe.refundStatus = 'error';
    try {
      const res = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Try' }).expect(502);
      expect(res.body.message).toMatch(/refused the refund/);
    } finally {
      stripe.refundStatus = 'succeeded';
    }
    const retry = await h.http().post(`/v1/admin/orders/${order.id}/refunds`).set(auth(supportToken)).send({ reason: 'Try again' }).expect(201);
    expect(retry.body.amount.amountMinor).toBe(1600);
  });
});
