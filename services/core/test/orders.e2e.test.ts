import type { OrderEvent } from '@papperdash/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrdersService } from '../src/blocks/orders/index.js';
import { EventBus } from '../src/platform/events.js';
import { signUp, startHarness, STATION, type Harness } from './harness.js';

let h: Harness;
let orders: OrdersService;
beforeAll(async () => {
  h = await startHarness();
  orders = h.app.get(OrdersService);
});
afterAll(() => h.close());

const delivery = { documentId: 'doc_1', fulfilment: 'delivery', settings: { colour: 'bw', copies: 2 } };
const system = { kind: 'system', block: 'test' } as const;

describe('placing orders', () => {
  it('requires a verified email', async () => {
    const { token } = await signUp(h, 'unverified@example.se', { verify: false });
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(delivery).expect(403);
    expect(res.body.error).toBe('email_not_verified');
  });

  it('creates a draft with defaults and a readable reference, visible only to its owner', async () => {
    const { token } = await signUp(h, 'owner@example.se');
    const { token: other } = await signUp(h, 'other@example.se');
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(delivery).expect(201);
    expect(res.body).toMatchObject({ state: 'Draft', fulfilment: 'delivery', settings: { colour: 'bw', copies: 2, duplex: false, paperSize: 'A4' } });
    expect(res.body.reference).toMatch(/^PD-[0-9A-HJKMNP-TV-Z]{6}$/);

    const list = await h.http().get('/v1/orders').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.orders).toHaveLength(1);
    await h.http().get(`/v1/orders/${res.body.id}`).set('Authorization', `Bearer ${other}`).expect(404);
    await h.http().get(`/v1/orders/${res.body.id}/history`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('requires a station for locker pickup', async () => {
    const { token } = await signUp(h, 'locker@example.se');
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send({ ...delivery, fulfilment: 'locker' }).expect(400);
  });

  it('lets customers cancel only before payment', async () => {
    const { token } = await signUp(h, 'cancel@example.se');
    const { body: o } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(delivery).expect(201);
    const res = await h.http().post(`/v1/orders/${o.id}/cancel`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.state).toBe('Cancelled');
    await h.http().post(`/v1/orders/${o.id}/cancel`).set('Authorization', `Bearer ${token}`).expect(409);
  });

  it('restricts a QR station session to walk-up printing at that station', async () => {
    const { token: phone } = await signUp(h, 'walkup@example.se');
    const st = (r: ReturnType<ReturnType<Harness['http']>['get']>) => r.set('x-station-id', STATION.id).set('x-station-key', STATION.key);
    const qr = await st(h.http().post('/v1/auth/qr/challenges')).expect(201);
    await h.http().post('/v1/auth/qr/approve').set('Authorization', `Bearer ${phone}`).send({ token: qr.body.qrUrl.split('/').pop() }).expect(200);
    const { body: claim } = await st(h.http().get(`/v1/auth/qr/challenges/${qr.body.id}`)).expect(200);

    await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send(delivery).expect(403);
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send({ ...delivery, fulfilment: 'walk-up', stationId: 'malmo-2' }).expect(403);
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send({ ...delivery, fulfilment: 'walk-up', stationId: STATION.id }).expect(201);
    expect(res.body.stationId).toBe(STATION.id);
  });
});

describe('order state machine', () => {
  async function newOrder(email: string, fulfilment = 'delivery') {
    const { token } = await signUp(h, email);
    const body = fulfilment === 'delivery' ? delivery : { ...delivery, fulfilment, stationId: STATION.id };
    return (await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(body).expect(201)).body.id as string;
  }

  it('walks a delivery order from draft to completed, recording every step', async () => {
    const id = await newOrder('path@example.se');
    await orders.awaitPayment(id, { amountMinor: 1250, currency: 'SEK' }, system);
    for (const s of ['Paid', 'Queued', 'Printing', 'Printed', 'ReadyForCourier', 'OutForDelivery', 'Delivered', 'Completed'] as const) {
      await orders.transition(id, s, system);
    }
    const history = await orders.history(id);
    expect(history.map((r) => r.toState)).toEqual(['AwaitingPayment', 'Paid', 'Queued', 'Printing', 'Printed', 'ReadyForCourier', 'OutForDelivery', 'Delivered', 'Completed']);
  });

  it('refuses transitions that skip printing or cross fulfilment methods', async () => {
    const id = await newOrder('skip@example.se', 'locker');
    await expect(orders.transition(id, 'Ready', system)).rejects.toThrow(/cannot go from Draft to Ready/);
    await orders.awaitPayment(id, { amountMinor: 500, currency: 'SEK' }, system);
    for (const s of ['Paid', 'Queued', 'Printing', 'Printed'] as const) await orders.transition(id, s, system);
    await expect(orders.transition(id, 'ReadyForCourier', system)).rejects.toThrow(/cannot go/);
  });

  it('lets only one of two concurrent collections win', async () => {
    const id = await newOrder('race@example.se', 'locker');
    await orders.awaitPayment(id, { amountMinor: 500, currency: 'SEK' }, system);
    for (const s of ['Paid', 'Queued', 'Printing', 'Printed', 'Ready'] as const) await orders.transition(id, s, system);
    const results = await Promise.allSettled([orders.transition(id, 'Collected', system), orders.transition(id, 'Collected', system)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('events', () => {
  it('delivers each outbox event once, even when flushed again', async () => {
    const bus = h.app.get(EventBus);
    const seen: string[] = [];
    bus.subscribe<OrderEvent>('orders.OrderCreated', 'test.order-created', async (e) => {
      seen.push(e.aggregateId);
    });
    await bus.flush(10_000);
    const before = seen.length;
    const { token } = await signUp(h, 'events@example.se');
    const { body } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(delivery).expect(201);
    await bus.flush();
    await bus.flush();
    expect(seen.slice(before)).toEqual([body.id]);
  });
});
