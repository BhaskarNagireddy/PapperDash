import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../src/platform/config.js';
import { signUp, startHarness, type Harness } from './harness.js';

let h: Harness;
let closed: Harness;
beforeAll(async () => {
  h = await startHarness();
  closed = await startHarness({ config: { orderingEnabled: false } });
});
afterAll(async () => {
  await h.close();
  await closed.close();
});

const leaveToken = (to: string) => {
  const msg = [...h.email.sent].reverse().find((m) => m.to === to);
  return msg?.text.match(/waitlist\/leave\?token=([A-Za-z0-9_-]+)/)?.[1];
};

describe('waitlist', () => {
  it('needs consent and a valid email and postcode', async () => {
    const res = await h.http().post('/v1/waitlist').send({ email: 'nope', postcode: '12', consent: false }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['consent', 'email', 'postcode']);
  });

  it('joins once, emails a removal link in the visitor’s language, and does not email again on a repeat', async () => {
    await h.http().post('/v1/waitlist').send({ email: ' Eva@Example.se ', locale: 'sv', postcode: '223 50', consent: true }).expect(202);
    const first = h.email.sent.filter((m) => m.to === 'eva@example.se');
    expect(first).toHaveLength(1);
    expect(first[0]!.subject).toContain('väntelista');
    expect(first[0]!.text).toContain('https://papperdash.test/sv/waitlist/leave?token=');

    // Same answer for a repeat, so the form reveals nothing and cannot flood an inbox.
    const again = await h.http().post('/v1/waitlist').send({ email: 'eva@example.se', locale: 'en', consent: true }).expect(202);
    expect(again.body.message).toBeTruthy();
    expect(h.email.sent.filter((m) => m.to === 'eva@example.se')).toHaveLength(1);
  });

  it('removes the entry with the link, once', async () => {
    await h.http().post('/v1/waitlist').send({ email: 'leave@example.se', locale: 'en', consent: true }).expect(202);
    const token = leaveToken('leave@example.se')!;
    await h.http().post('/v1/waitlist/leave').send({ token }).expect(204);
    await h.http().post('/v1/waitlist/leave').send({ token }).expect(410);
    // Joining again after leaving is a new entry with a new email.
    await h.http().post('/v1/waitlist').send({ email: 'leave@example.se', locale: 'en', consent: true }).expect(202);
    expect(leaveToken('leave@example.se')).not.toBe(token);
  });

  it('limits sign-ups per network', async () => {
    const limited = await startHarness({ config: { rateLimits: { ...DEFAULT_RATE_LIMITS, waitlistPerIp: { max: 2, windowMs: 3600_000 } } } });
    try {
      await limited.http().post('/v1/waitlist').send({ email: 'a@example.se', consent: true }).expect(202);
      await limited.http().post('/v1/waitlist').send({ email: 'b@example.se', consent: true }).expect(202);
      const res = await limited.http().post('/v1/waitlist').send({ email: 'c@example.se', consent: true }).expect(429);
      expect(res.body.error).toBe('rate_limited');
    } finally {
      await limited.close();
    }
  });
});

describe('service status and the ordering switch', () => {
  it('reports whether ordering is open', async () => {
    expect((await h.http().get('/v1/status').expect(200)).body).toEqual({ ordering: true });
    expect((await closed.http().get('/v1/status').expect(200)).body).toEqual({ ordering: false });
  });

  it('refuses new orders while ordering is closed, but accounts still work', async () => {
    const { token } = await signUp(closed, 'early@example.se');
    const res = await closed
      .http()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentId: 'doc_x', settings: { copies: 1, colour: 'bw', duplex: false, paperSize: 'A4' }, fulfilment: 'delivery' })
      .expect(503);
    expect(res.body.error).toBe('ordering_closed');
    await closed.http().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  });
});
