import type { PaymentProviderEvent } from '@papperdash/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../src/blocks/orders/index.js';
import { PAYMENT_PROVIDER, PaymentsService } from '../src/blocks/payments/index.js';
import { DEFAULT_RATE_LIMITS } from '../src/platform/config.js';
import { EventBus } from '../src/platform/events.js';
import { Leases } from '../src/platform/leases.js';
import { RateLimiter } from '../src/platform/rate-limit.js';
import { FakePaymentProvider } from './fake-payments.js';
import { readyDocument, signUp, startHarness, STATION, type Harness } from './harness.js';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const HOUR = 60 * 60 * 1000;

describe('CORS: only the website may call the API from a browser', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ config: { corsOrigins: ['https://papperdash.se'] } });
  });
  afterAll(() => h.close());

  it('answers the preflight for an allowed origin, with cookies allowed', async () => {
    const res = await h
      .http()
      .options('/v1/auth/login')
      .set('Origin', 'https://papperdash.se')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://papperdash.se');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-headers']).toBe('content-type,authorization');
  });

  it('never grants another origin, a lookalike, or a wildcard', async () => {
    for (const origin of ['https://evil.example', 'https://papperdash.se.evil.example', 'http://papperdash.se', 'null']) {
      const pre = await h.http().options('/v1/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
      const get = await h.http().get('/health').set('Origin', origin);
      expect(get.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('lets apps, stations and webhooks (no Origin header) through unchanged', async () => {
    const res = await h.http().get('/health').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request limits shared by every server instance', () => {
  let h: Harness;
  const tight = { max: 2, windowMs: HOUR };
  beforeAll(async () => {
    h = await startHarness({
      config: {
        rateLimits: { ...DEFAULT_RATE_LIMITS, registerPerIp: { max: 3, windowMs: HOUR }, resetPerEmail: tight, resetPerIp: { max: 4, windowMs: HOUR }, uploadsPerUser: tight, qrPerStation: tight },
      },
    });
  });
  afterAll(() => h.close());

  it('limits sign-ups per network and says when to retry', async () => {
    const { token } = await signUp(h, 'first@example.se');
    await h.http().post('/v1/auth/register').send({ email: 'second@example.se', password: 'correct horse battery', locale: 'en' }).expect(201);
    await h.http().post('/v1/auth/register').send({ email: 'third@example.se', password: 'correct horse battery', locale: 'en' }).expect(201);
    const res = await h.http().post('/v1/auth/register').send({ email: 'fourth@example.se', password: 'correct horse battery', locale: 'en' }).expect(429);
    expect(res.body).toMatchObject({ error: 'rate_limited', retryAfterSec: expect.any(Number) });
    expect(res.body.retryAfterSec).toBeGreaterThan(0);
    expect(res.body.retryAfterSec).toBeLessThanOrEqual(3600);

    // Uploads are limited per customer.
    await readyDocument(h, token, 1);
    await readyDocument(h, token, 1);
    const upload = await h.http().post('/v1/documents').set(auth(token)).send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100 }).expect(429);
    expect(upload.body.error).toBe('rate_limited');

    // A new window opens after an hour.
    h.clock.advance(HOUR);
    await h.http().post('/v1/auth/register').send({ email: 'fourth@example.se', password: 'correct horse battery', locale: 'en' }).expect(201);
  });

  it('quietly stops sending reset emails for one address, without revealing it, then limits the network', async () => {
    await signUp(h, 'reset@example.se', { verify: false });
    const before = h.email.sent.length;
    for (let i = 0; i < 3; i++) {
      const res = await h.http().post('/v1/auth/password-reset/request').send({ email: 'reset@example.se' }).expect(202);
      expect(res.body.message).toMatch(/If an account exists/);
    }
    expect(h.email.sent.slice(before).filter((m) => m.to === 'reset@example.se')).toHaveLength(2);
    await h.http().post('/v1/auth/password-reset/request').send({ email: 'other@example.se' }).expect(202);
    await h.http().post('/v1/auth/password-reset/request').send({ email: 'another@example.se' }).expect(429);
  });

  it('limits QR codes per station', async () => {
    const qr = () => h.http().post('/v1/auth/qr/challenges').set('x-station-id', STATION.id).set('x-station-key', STATION.key);
    await qr().expect(201);
    await qr().expect(201);
    await qr().expect(429);
  });

  it('counts across instances and prunes old windows', async () => {
    const limiter = h.app.get(RateLimiter);
    const limit = { max: 1, windowMs: HOUR };
    expect((await limiter.hit('shared-key', limit)).allowed).toBe(true);
    expect((await limiter.hit('shared-key', limit)).allowed).toBe(false);
    h.clock.advance(2 * HOUR);
    await limiter.prune(new Date(h.clock.now().getTime() - HOUR));
    expect((await limiter.current('shared-key', limit)).count).toBe(0);
  });
});

describe('one background worker across instances', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  it('only the instance holding the relay lease delivers events; another takes over when it lapses', async () => {
    const bus = h.app.get(EventBus);
    const delivered: string[] = [];
    bus.subscribe('identity.UserRegistered', 'test.lease-probe', async (e) => {
      delivered.push(e.aggregateId);
    });
    // Another instance (its own holder id, same database) holds the relay.
    const other = new Leases(h.db, h.clock);
    expect(await other.tryAcquire('outbox-relay', 60_000)).toBe(true);

    await h.http().post('/v1/auth/register').send({ email: 'lease@example.se', password: 'correct horse battery', locale: 'en' }).expect(201);
    expect(await bus.flush()).toBe(0);
    expect(delivered).toHaveLength(0);
    expect(await other.tryAcquire('outbox-relay', 60_000)).toBe(true); // the holder renews freely

    h.clock.advance(61_000); // the other instance stopped renewing (crashed)
    await h.flush();
    expect(delivered).toHaveLength(1);
    expect(await other.tryAcquire('outbox-relay', 60_000)).toBe(false);

    // Releasing on shutdown hands over at once.
    await h.app.get(Leases).release('outbox-relay');
    expect(await other.tryAcquire('outbox-relay', 60_000)).toBe(true);
    await other.release('outbox-relay');
  });

  it('runs an exclusive job once per lease period', async () => {
    const a = new Leases(h.db, h.clock);
    const b = new Leases(h.db, h.clock);
    expect(await a.runExclusive('nightly', 5 * 60_000, async () => 'ran')).toBe('ran');
    expect(await b.runExclusive('nightly', 5 * 60_000, async () => 'ran')).toBeUndefined();
    h.clock.advance(5 * 60_000 + 1);
    expect(await b.runExclusive('nightly', 5 * 60_000, async () => 'ran')).toBe('ran');
  });
});

describe('abandoned orders expire', () => {
  let h: Harness;
  let stripe: FakePaymentProvider;
  beforeAll(async () => {
    stripe = new FakePaymentProvider();
    h = await startHarness({ overrides: [[PAYMENT_PROVIDER, stripe]] });
  });
  afterAll(() => h.close());

  const webhook = (event: PaymentProviderEvent) =>
    h.http().post('/v1/payments/webhooks/stripe').set('stripe-signature', 'fake-valid-signature').set('content-type', 'application/json').send(JSON.stringify(event));
  const state = async (token: string, id: string) => (await h.http().get(`/v1/orders/${id}`).set(auth(token)).expect(200)).body.state;

  async function order(email: string) {
    const { token } = await signUp(h, email);
    const documentId = await readyDocument(h, token, 2);
    const { body } = await h.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: { copies: 1 } }).expect(201);
    return { token, id: body.id as string };
  }

  it('cancels drafts after 24 hours, and not before', async () => {
    const orders = h.app.get(OrdersService);
    const { token, id } = await order('draft@example.se');
    h.clock.advance(23 * HOUR);
    expect(await orders.expireDrafts()).toBe(0);
    h.clock.advance(HOUR + 1);
    expect(await orders.expireDrafts()).toBe(1);
    expect(await state(token, id)).toBe('Cancelled');
    const history = await orders.history(id);
    expect(history.at(-1)).toMatchObject({ toState: 'Cancelled', actor: { kind: 'system', block: 'orders' }, reason: 'Not paid within 24 hours' });
    expect(await orders.expireDrafts()).toBe(0);
  });

  it('cancels unpaid checkouts after 2 hours and closes the Stripe page', async () => {
    const payments = h.app.get(PaymentsService);
    const { token, id } = await order('abandon@example.se');
    await h.http().post(`/v1/orders/${id}/checkout`).set(auth(token)).expect(200);
    const session = stripe.latest().id;
    h.clock.advance(HOUR);
    expect(await payments.expireAbandonedCheckouts()).toBe(0);
    h.clock.advance(HOUR + 1);
    expect(await payments.expireAbandonedCheckouts()).toBe(1);
    await h.flush();
    expect(await state(token, id)).toBe('Cancelled');
    expect(stripe.sessions.get(session)!.status).toBe('cancelled');
  });

  it('keeps an order whose customer retried checkout recently', async () => {
    const payments = h.app.get(PaymentsService);
    const { token, id } = await order('retry@example.se');
    await h.http().post(`/v1/orders/${id}/checkout`).set(auth(token)).expect(200);
    h.clock.advance(HOUR + 30 * 60 * 1000);
    await h.http().post(`/v1/orders/${id}/checkout`).set(auth(token)).expect(200); // a fresh session
    h.clock.advance(HOUR);
    expect(await payments.expireAbandonedCheckouts()).toBe(0);
    expect(await state(token, id)).toBe('AwaitingPayment');
    h.clock.advance(HOUR + 1); // 2 hours after the retry
    expect(await payments.expireAbandonedCheckouts()).toBe(1);
  });

  it('never cancels a Klarna or bank payment that is still being confirmed', async () => {
    const payments = h.app.get(PaymentsService);
    const { token, id } = await order('klarna@example.se');
    await h.http().post(`/v1/orders/${id}/checkout`).set(auth(token)).expect(200);
    await webhook(stripe.payLater(stripe.latest().id)).expect(200);
    await h.flush();
    h.clock.advance(3 * HOUR);
    expect(await payments.expireAbandonedCheckouts()).toBe(0);
    expect(await state(token, id)).toBe('AwaitingPayment');
  });

  it('refunds automatically if a payment still lands after the order expired', async () => {
    const payments = h.app.get(PaymentsService);
    const { token, id } = await order('late@example.se');
    await h.http().post(`/v1/orders/${id}/checkout`).set(auth(token)).expect(200);
    const session = stripe.latest().id;
    h.clock.advance(2 * HOUR + 1);
    // Stripe already completed the payment, but its webhook has not arrived yet: closing the page fails.
    stripe.sessions.get(session)!.status = 'succeeded';
    expect(await payments.expireAbandonedCheckouts()).toBe(1);
    await h.flush();
    const refundsBefore = stripe.refunds.length;
    await webhook(stripe.pay(session)).expect(200);
    await h.flush();
    expect(stripe.refunds.length).toBe(refundsBefore + 1);
    expect(await state(token, id)).toBe('Cancelled');
  });
});

describe('background jobs on their production timers', () => {
  it('relays events, expires orders, sweeps files and prunes limits by themselves, then stops cleanly', async () => {
    const stripe = new FakePaymentProvider();
    const h = await startHarness({ overrides: [[PAYMENT_PROVIDER, stripe]], config: { outboxPollMs: 20, expirySweepMs: 20, retentionSweepMs: 20 } });
    try {
      const { token } = await signUp(h, 'timers@example.se');
      const documentId = await readyDocument(h, token, 1);
      const draft = (await h.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: { copies: 1 } }).expect(201)).body;
      const unpaid = (await h.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: { copies: 1 } }).expect(201)).body;
      await h.http().post(`/v1/orders/${unpaid.id}/checkout`).set(auth(token)).expect(200);
      await h.app.get(RateLimiter).hit('old-window', { max: 1, windowMs: HOUR });
      h.clock.advance(25 * HOUR);

      await vi.waitFor(
        async () => {
          const states = await Promise.all([draft.id, unpaid.id].map(async (id) => (await h.http().get(`/v1/orders/${id}`).set(auth(token))).body.state));
          expect(states).toEqual(['Cancelled', 'Cancelled']);
          expect((await h.app.get(RateLimiter).current('old-window', { max: 1, windowMs: HOUR })).count).toBe(0);
        },
        { timeout: 5000, interval: 50 },
      );
    } finally {
      await h.close();
    }
  });
});
