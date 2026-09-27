import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lastToken, signUp, startHarness, STATION, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

describe('email + password', () => {
  it('registers with only an email, sends a verification link, and rejects duplicates', async () => {
    const res = await h.http().post('/v1/auth/register').send({ email: ' Anna@Example.se ', password: 'long enough pw', locale: 'sv' }).expect(201);
    expect(res.body.user).toMatchObject({ email: 'anna@example.se', roles: ['customer'], emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(h.email.sent.at(-1)?.subject).toContain('Bekräfta');
    await h.http().post('/v1/auth/register').send({ email: 'anna@example.se', password: 'long enough pw' }).expect(409);
  });

  it('rejects weak input with field-level messages', async () => {
    const res = await h.http().post('/v1/auth/register').send({ email: 'nope', password: 'short' }).expect(400);
    expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['email', 'password']);
  });

  it('verification links work once', async () => {
    await h.http().post('/v1/auth/register').send({ email: 'ver@example.se', password: 'long enough pw' }).expect(201);
    const token = lastToken(h.email, 'ver@example.se');
    await h.http().post('/v1/auth/verify-email').send({ token }).expect(204);
    await h.http().post('/v1/auth/verify-email').send({ token }).expect(410);
  });

  it('logs in with a cookie session, serves /me, and logs out', async () => {
    const { token } = await signUp(h, 'bo@example.se');
    const agent = h.http();
    const login = await h.http().post('/v1/auth/login').send({ email: 'bo@example.se', password: 'correct horse battery' }).expect(200);
    const cookie = login.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/pd_session=.*HttpOnly/);
    const me = await h.http().get('/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user).toMatchObject({ email: 'bo@example.se', emailVerified: true });

    await agent.post('/v1/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('gives the same answer for a wrong password and an unknown email, and locks after 5 failures', async () => {
    await signUp(h, 'lock@example.se');
    const bad = await h.http().post('/v1/auth/login').send({ email: 'lock@example.se', password: 'wrong' }).expect(401);
    const unknown = await h.http().post('/v1/auth/login').send({ email: 'ghost@example.se', password: 'wrong' }).expect(401);
    expect(bad.body).toEqual(unknown.body);
    for (let i = 0; i < 4; i++) await h.http().post('/v1/auth/login').send({ email: 'lock@example.se', password: 'wrong' });
    await h.http().post('/v1/auth/login').send({ email: 'lock@example.se', password: 'correct horse battery' }).expect(429);
    h.clock.advance(16 * 60 * 1000);
    await h.http().post('/v1/auth/login').send({ email: 'lock@example.se', password: 'correct horse battery' }).expect(200);
  });

  it('resets a password and signs out every existing session', async () => {
    const { token } = await signUp(h, 'reset@example.se');
    await h.http().post('/v1/auth/password-reset/request').send({ email: 'nobody@example.se' }).expect(202);
    await h.http().post('/v1/auth/password-reset/request').send({ email: 'reset@example.se' }).expect(202);
    await h.http().post('/v1/auth/password-reset/confirm').send({ token: lastToken(h.email, 'reset@example.se'), password: 'a brand new password' }).expect(204);
    await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    await h.http().post('/v1/auth/login').send({ email: 'reset@example.se', password: 'a brand new password' }).expect(200);
  });
});

describe('QR sign-in at a station', () => {
  const station = (req: ReturnType<ReturnType<Harness['http']>['get']>) => req.set('x-station-id', STATION.id).set('x-station-key', STATION.key);

  it('rejects unknown stations', async () => {
    await h.http().post('/v1/auth/qr/challenges').set('x-station-id', STATION.id).set('x-station-key', 'wrong-key-wrong-key-wrong-key').expect(401);
  });

  it('station shows QR → phone approves → station gets a one-time session bound to that station', async () => {
    const { token: phone, user } = await signUp(h, 'qr@example.se');
    const created = await station(h.http().post('/v1/auth/qr/challenges')).expect(201);
    expect(created.body.qrUrl).toMatch(/^https:\/\/papperdash\.test\/qr\/[A-Za-z0-9_-]{40,}$/);
    const qrToken = created.body.qrUrl.split('/').pop();

    const pending = await station(h.http().get(`/v1/auth/qr/challenges/${created.body.id}`)).expect(200);
    expect(pending.body).toEqual({ status: 'pending' });

    const approved = await h.http().post('/v1/auth/qr/approve').set('Authorization', `Bearer ${phone}`).send({ token: qrToken }).expect(200);
    expect(approved.body).toEqual({ stationId: STATION.id });

    const claimed = await station(h.http().get(`/v1/auth/qr/challenges/${created.body.id}`)).expect(200);
    expect(claimed.body).toMatchObject({ status: 'consumed', user: { id: user.id } });
    expect(claimed.body.token).toBeTruthy();

    const again = await station(h.http().get(`/v1/auth/qr/challenges/${created.body.id}`)).expect(200);
    expect(again.body).toEqual({ status: 'consumed' });

    const me = await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${claimed.body.token}`).expect(200);
    expect(me.body.user).toMatchObject({ id: user.id, stationId: STATION.id });

    // A QR code cannot be approved twice.
    await h.http().post('/v1/auth/qr/approve').set('Authorization', `Bearer ${phone}`).send({ token: qrToken }).expect(410);

    // Station sessions are short-lived.
    h.clock.advance(11 * 60 * 1000);
    await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${claimed.body.token}`).expect(401);
  });

  it('expires unapproved QR codes after two minutes', async () => {
    const { token: phone } = await signUp(h, 'late@example.se');
    const created = await station(h.http().post('/v1/auth/qr/challenges')).expect(201);
    h.clock.advance(121 * 1000);
    await h.http().post('/v1/auth/qr/approve').set('Authorization', `Bearer ${phone}`).send({ token: created.body.qrUrl.split('/').pop() }).expect(410);
    const r = await station(h.http().get(`/v1/auth/qr/challenges/${created.body.id}`)).expect(200);
    expect(r.body).toEqual({ status: 'expired' });
  });

  it('requires the phone to be signed in', async () => {
    const created = await station(h.http().post('/v1/auth/qr/challenges')).expect(201);
    await h.http().post('/v1/auth/qr/approve').send({ token: created.body.qrUrl.split('/').pop() }).expect(401);
  });
});
