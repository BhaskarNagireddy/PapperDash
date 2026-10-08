import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/blocks/identity/identity.service.js';
import { PAYMENT_PROVIDER } from '../src/blocks/payments/index.js';
import { FakePaymentProvider } from './fake-payments.js';
import { CapturingLogger, lastToken, readyDocument, startHarness, STATION, type Harness } from './harness.js';

/**
 * Data-leak checks across the whole API: runs every customer, station and staff flow once, records every
 * response and every log line, then asserts that no secret or internal field ever leaves the server.
 * A new endpoint that leaks a password hash, token, storage key or another customer's data fails here.
 */

const PASSWORD = 'a very secret password 123';
const FORBIDDEN_KEYS = [
  'passwordHash', 'password_hash', 'password',
  'tokenHash', 'token_hash',
  'sourceKey', 'source_key', 'printKey', 'print_key', // where files live in S3
  'paymentReference', 'providerPaymentId', // Stripe internals
  'secretKey', 'webhookSecret', 'stationKeys',
];

let h: Harness;
const logs = new CapturingLogger();
const stripe = new FakePaymentProvider();
const responses: { route: string; res: Response }[] = [];
const secrets: string[] = [PASSWORD];
let victim: { id: string; email: string };

const record = (route: string) => (res: Response) => {
  responses.push({ route, res });
  return res;
};
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  h = await startHarness({ overrides: [[PAYMENT_PROVIDER, stripe]], logger: logs });

  // Another customer whose data must never appear in anyone else's responses.
  await h.http().post('/v1/auth/register').send({ email: 'victim@example.se', password: PASSWORD }).then(record('register'));
  await h.http().post('/v1/auth/verify-email').send({ token: lastToken(h.email, 'victim@example.se') });
  const vLogin = await h.http().post('/v1/auth/login').send({ email: 'victim@example.se', password: PASSWORD });
  victim = vLogin.body.user;
  secrets.push(vLogin.body.token);
  await readyDocument(h, vLogin.body.token);

  // The customer under test: every flow once.
  await h.http().post('/v1/auth/register').send({ email: 'me@example.se', password: PASSWORD }).then(record('register'));
  const verifyToken = lastToken(h.email, 'me@example.se');
  secrets.push(verifyToken);
  await h.http().post('/v1/auth/verify-email').send({ token: verifyToken }).then(record('verify-email'));
  const login = await h.http().post('/v1/auth/login').send({ email: 'me@example.se', password: PASSWORD }).then(record('login'));
  const token = login.body.token as string;
  secrets.push(token);
  await h.http().post('/v1/auth/login').send({ email: 'me@example.se', password: 'wrong password' }).then(record('login (wrong)'));
  await h.http().get('/v1/auth/me').set(auth(token)).then(record('me'));
  await h.http().post('/v1/auth/password-reset/request').send({ email: 'me@example.se' }).then(record('reset request'));
  secrets.push(lastToken(h.email, 'me@example.se'));

  const st = { 'x-station-id': STATION.id, 'x-station-key': STATION.key };
  secrets.push(STATION.key);
  const qr = await h.http().post('/v1/auth/qr/challenges').set(st).then(record('qr create'));
  secrets.push(qr.body.qrUrl.split('/').pop());
  await h.http().post('/v1/auth/qr/approve').set(auth(token)).send({ token: qr.body.qrUrl.split('/').pop() }).then(record('qr approve'));
  const claim = await h.http().get(`/v1/auth/qr/challenges/${qr.body.id}`).set(st).then(record('qr claim'));
  secrets.push(claim.body.token);

  const created = await h.http().post('/v1/documents').set(auth(token)).send({ fileName: 'cv.pdf', contentType: 'application/pdf', sizeBytes: 100 }).then(record('document create'));
  const documentId = await readyDocument(h, token);
  await h.http().get(`/v1/documents/${documentId}`).set(auth(token)).then(record('document get'));
  await h.http().get('/v1/documents').set(auth(token)).then(record('documents list'));
  void created;

  const order = await h.http().post('/v1/orders').set(auth(token)).send({ documentId, fulfilment: 'delivery', settings: {} }).then(record('order create'));
  await h.http().get('/v1/orders').set(auth(token)).then(record('orders list'));
  await h.http().get(`/v1/orders/${order.body.id}`).set(auth(token)).then(record('order get'));
  await h.http().post(`/v1/orders/${order.body.id}/checkout`).set(auth(token)).then(record('checkout'));
  await h
    .http()
    .post('/v1/payments/webhooks/stripe')
    .set('stripe-signature', 'fake-valid-signature')
    .set('content-type', 'application/json')
    .send(JSON.stringify(stripe.pay(stripe.latest().id)))
    .then(record('webhook'));
  await h.flush();
  await h.http().get(`/v1/orders/${order.body.id}/payment`).set(auth(token)).then(record('payment get'));

  const support = await h.http().post('/v1/auth/register').send({ email: 'support@papperdash.se', password: PASSWORD });
  await h.app.get(IdentityService).setRoles(support.body.user.id, ['support']);
  await h.http().post('/v1/auth/verify-email').send({ token: lastToken(h.email, 'support@papperdash.se') });
  const sLogin = await h.http().post('/v1/auth/login').send({ email: 'support@papperdash.se', password: PASSWORD });
  secrets.push(sLogin.body.token);
  await h.http().post(`/v1/admin/orders/${order.body.id}/refunds`).set(auth(sLogin.body.token)).send({ amountMinor: 100, reason: 'Goodwill' }).then(record('refund'));
  await h.http().get(`/v1/orders/${order.body.id}/history`).set(auth(sLogin.body.token)).then(record('order history (staff)'));

  await h.http().get('/v1/orders/ord_does_not_exist').set(auth(token)).then(record('not found'));
  await h.http().post('/v1/orders').set(auth(token)).send({ nonsense: true }).then(record('validation error'));
});
afterAll(() => h.close());

/**
 * Reviewed exceptions (false positives). Each entry says what is allowed, where, and why; anything not
 * listed here still fails the test. Add an entry only with a reason a reviewer can check.
 */
const ALLOWED: { route: string; path: string[]; reason: string }[] = [
  {
    route: 'document create',
    path: ['upload', 'fields'],
    reason: 'S3 presigned POST requires the object key ("source/doc_…") in the form; the signed policy only allows writing that one key, once, within 15 minutes.',
  },
];

function withoutAllowed(route: string, body: unknown): unknown {
  const copy = structuredClone(body) as Record<string, unknown>;
  for (const a of ALLOWED.filter((x) => x.route === route)) {
    let node: Record<string, unknown> | undefined = copy;
    for (const k of a.path.slice(0, -1)) node = node?.[k] as Record<string, unknown> | undefined;
    if (node) delete node[a.path.at(-1)!];
  }
  return copy;
}

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('API responses', () => {
  it('only allows reviewed exceptions that still occur (stale exceptions must be removed)', () => {
    for (const a of ALLOWED) expect(responses.some((r) => r.route === a.route), `unused exception for ${a.route}`).toBe(true);
  });

  it('ran every flow', () => {
    expect(responses.length).toBeGreaterThan(20);
  });

  it('never contain password hashes, token hashes, storage keys, Stripe internals or server secrets', () => {
    for (const { route, res } of responses) {
      const body = withoutAllowed(route, res.body);
      const leaked = [...keysDeep(body)].filter((k) => FORBIDDEN_KEYS.includes(k));
      expect(leaked, `${route} returned ${leaked.join(', ')}`).toEqual([]);
      expect(JSON.stringify(body), route).not.toMatch(/source\/doc_|print\/doc_|\$argon2/);
    }
  });

  it("never contain another customer's email or ID", () => {
    for (const { route, res } of responses) {
      const text = JSON.stringify(res.body);
      if (route === 'register' && res.body?.user?.id === victim.id) continue; // the victim's own sign-up
      expect(text, route).not.toContain(victim.email);
      expect(text, route).not.toContain(victim.id);
    }
  });

  it('do not reveal the framework, and carry standard security headers', () => {
    for (const { route, res } of responses) {
      expect(res.headers['x-powered-by'], route).toBeUndefined();
      expect(res.headers['x-content-type-options'], route).toBe('nosniff');
      expect(res.headers['strict-transport-security'], route).toMatch(/max-age=/);
    }
  });

  it('send session cookies only as HttpOnly', () => {
    const cookie = responses.find((r) => r.route === 'login')!.res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('give the same answer for a wrong password as for an unknown account', async () => {
    const wrong = responses.find((r) => r.route === 'login (wrong)')!.res;
    const unknown = await h.http().post('/v1/auth/login').send({ email: 'nobody@example.se', password: 'whatever' });
    expect(wrong.status).toBe(unknown.status);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe('server logs', () => {
  it('captured the run', () => {
    expect(logs.lines.length).toBeGreaterThan(0);
  });

  it('never contain passwords, session tokens, email-link tokens, QR codes or station keys', () => {
    const all = logs.lines.join('\n');
    for (const s of secrets) expect(all.includes(s), `a secret starting "${s.slice(0, 6)}…" was logged`).toBe(false);
  });
});
