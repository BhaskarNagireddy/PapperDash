import type { OrderCreated, OrderEvent } from '@papperdash/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrdersService } from '../src/blocks/orders/index.js';
import { EventBus } from '../src/platform/events.js';
import { readyDocument, signUp, startHarness, STATION, upload, type Harness } from './harness.js';

let h: Harness;
let orders: OrdersService;
beforeAll(async () => {
  h = await startHarness();
  orders = h.app.get(OrdersService);
});
afterAll(() => h.close());

const order = (documentId: string, extra: Record<string, unknown> = {}) => ({ documentId, fulfilment: 'delivery', settings: { colour: 'bw', copies: 2 }, ...extra });
const system = { kind: 'system', block: 'test' } as const;

describe('placing orders', () => {
  it('requires a verified email', async () => {
    const { token } = await signUp(h, 'unverified@example.se', { verify: false });
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order('doc_x')).expect(403);
    expect(res.body.error).toBe('email_not_verified');
  });

  it('creates a priced draft with defaults and a readable reference, visible only to its owner', async () => {
    const { token } = await signUp(h, 'owner@example.se');
    const { token: other } = await signUp(h, 'other@example.se');
    const doc = await readyDocument(h, token, 3);
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc)).expect(201);
    // 3 pages x 2 copies = 6 printed pages -> the 6-15 tier, 16 kr.
    expect(res.body).toMatchObject({ state: 'Draft', fulfilment: 'delivery', pages: 3, total: { amountMinor: 1600, currency: 'SEK' }, settings: { colour: 'bw', copies: 2, duplex: false, paperSize: 'A4' } });
    expect(res.body.reference).toMatch(/^PD-[0-9A-HJKMNP-TV-Z]{6}$/);

    const list = await h.http().get('/v1/orders').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.orders).toHaveLength(1);
    await h.http().get(`/v1/orders/${res.body.id}`).set('Authorization', `Bearer ${other}`).expect(404);
    await h.http().get(`/v1/orders/${res.body.id}/history`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('requires a station for locker pickup', async () => {
    const { token } = await signUp(h, 'locker@example.se');
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order('doc_x', { fulfilment: 'locker' })).expect(400);
  });

  it('only prints documents the customer owns and that are processed', async () => {
    const { token } = await signUp(h, 'files@example.se');
    const { token: other } = await signUp(h, 'files-other@example.se');
    const othersDoc = await readyDocument(h, other);
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(othersDoc)).expect(404);
    const rejected = await upload(h, token, Buffer.from('%PDF-1.7 not really a pdf'));
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(rejected.id)).expect(409);
    expect(res.body.message).toMatch(/could not be read/);
  });

  it('checks the page range and the 50-page limit against the real document', async () => {
    const { token } = await signUp(h, 'range@example.se');
    const doc = await readyDocument(h, token, 10);
    const bad = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc, { settings: { pageRange: '8-12' } })).expect(400);
    expect(bad.body.message).toBe('The document has 10 pages; page 12 does not exist.');
    const ok = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc, { settings: { pageRange: '1-2,9', copies: 1 } })).expect(201);
    expect(ok.body).toMatchObject({ pages: 3, total: { amountMinor: 1000 } });
    const tooMany = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc, { settings: { copies: 6 } })).expect(422);
    expect(tooMany.body.error).toBe('too_many_pages');
    const colour = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc, { settings: { colour: 'colour' } })).expect(422);
    expect(colour.body.error).toBe('colour_unavailable');
  });

  it('lets customers cancel only before payment', async () => {
    const { token } = await signUp(h, 'cancel@example.se');
    const { body: o } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(await readyDocument(h, token))).expect(201);
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
    // Uploaded from the phone, printed from the station session: same account, same file.
    const doc = await readyDocument(h, phone);

    await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send(order(doc)).expect(403);
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send(order(doc, { fulfilment: 'walk-up', stationId: 'malmo-2' })).expect(403);
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${claim.token}`).send(order(doc, { fulfilment: 'walk-up', stationId: STATION.id })).expect(201);
    expect(res.body.stationId).toBe(STATION.id);
  });
});

describe('order state machine', () => {
  async function newOrder(email: string, fulfilment = 'delivery') {
    const { token } = await signUp(h, email);
    const doc = await readyDocument(h, token);
    const body = fulfilment === 'delivery' ? order(doc) : order(doc, { fulfilment, stationId: STATION.id });
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
    const doc = await readyDocument(h, token);
    const { body } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(doc)).expect(201);
    await bus.flush();
    await bus.flush();
    expect(seen.slice(before)).toEqual([body.id]);
  });

  it('keeps delivering other events when one consumer keeps failing', async () => {
    const bus = h.app.get(EventBus);
    await bus.flush(10_000);
    const seen: string[] = [];
    bus.subscribe<OrderCreated>('orders.OrderCreated', 'test.flaky', async (e) => {
      if (e.payload.customerId === failingCustomer) throw new Error('boom');
      seen.push(e.aggregateId);
    });
    const { token: bad, user } = await signUp(h, 'poison@example.se');
    const failingCustomer = user.id;
    const { token: good } = await signUp(h, 'healthy@example.se');
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${bad}`).send(order(await readyDocument(h, bad))).expect(201);
    const { body: ok } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${good}`).send(order(await readyDocument(h, good))).expect(201);
    await bus.flush();
    expect(seen).toContain(ok.id);
  });

  it('retries a non-transactional handler until it succeeds, then never runs it again', async () => {
    const bus = h.app.get(EventBus);
    await bus.flush(10_000);
    let calls = 0;
    const { token, user } = await signUp(h, 'external@example.se');
    bus.subscribe<OrderCreated>(
      'orders.OrderCreated',
      'test.external-call',
      async (e) => {
        if (e.payload.customerId !== user.id) return; // the earlier test's poison event is still being retried
        calls++;
        if (calls === 1) throw new Error('provider timeout');
      },
      { transactional: false },
    );
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send(order(await readyDocument(h, token))).expect(201);
    await bus.flush();
    await bus.flush();
    await bus.flush();
    expect(calls).toBe(2);
  });
});
