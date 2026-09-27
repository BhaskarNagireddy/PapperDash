import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JoseOAuthVerifier } from '../src/blocks/identity/index.js';
import { readyDocument, signUp, startHarness, type Harness } from './harness.js';

// A stand-in for Google's and Apple's signing keys, so the real verifier runs end to end.
let h: Harness;
type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let privateKey: SigningKey;
let otherKey: SigningKey;

const GOOGLE = { iss: 'https://accounts.google.com', aud: 'google-client.apps.googleusercontent.com' };
const APPLE = { iss: 'https://appleid.apple.com', aud: 'se.papperdash.app' };

async function idToken(claims: Record<string, unknown>, { key = privateKey, iss = GOOGLE.iss, aud = GOOGLE.aud, expiresIn = '10m' } = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(expiresIn).sign(key);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  h = await startHarness({
    oauth: new JoseOAuthVerifier({
      google: { audiences: [GOOGLE.aud], issuers: [GOOGLE.iss], keys },
      apple: { audiences: [APPLE.aud], issuers: [APPLE.iss], keys },
    }),
  });
});
afterAll(() => h.close());

const signIn = (provider: string, token: string) => h.http().post(`/v1/auth/oauth/${provider}`).send({ idToken: token, locale: 'en' });

describe('Google sign-in', () => {
  it('creates a verified account on first sign-in and reuses it after', async () => {
    const token = await idToken({ sub: 'g-1', email: 'Greta@Gmail.com', email_verified: true });
    const first = await signIn('google', token).expect(200);
    expect(first.body).toMatchObject({ created: true, user: { email: 'greta@gmail.com', emailVerified: true } });
    expect(first.headers['set-cookie']![0]).toMatch(/pd_session=/);

    const second = await signIn('google', await idToken({ sub: 'g-1', email: 'greta@gmail.com', email_verified: true })).expect(200);
    expect(second.body).toMatchObject({ created: false, user: { id: first.body.user.id } });
    await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${second.body.token}`).expect(200);
  });

  it('lets a Google-only account order straight away, but not log in with a password', async () => {
    const res = await signIn('google', await idToken({ sub: 'g-2', email: 'nopw@gmail.com', email_verified: true })).expect(200);
    const documentId = await readyDocument(h, res.body.token);
    await h.http().post('/v1/orders').set('Authorization', `Bearer ${res.body.token}`).send({ documentId, fulfilment: 'delivery', settings: {} }).expect(201);
    await h.http().post('/v1/auth/login').send({ email: 'nopw@gmail.com', password: 'anything at all' }).expect(401);
  });

  it('links to an existing verified email account instead of creating a second one', async () => {
    const { user } = await signUp(h, 'both@example.se');
    const res = await signIn('google', await idToken({ sub: 'g-3', email: 'both@example.se', email_verified: true })).expect(200);
    expect(res.body).toMatchObject({ created: false, user: { id: user.id } });
    // The password still works too.
    await h.http().post('/v1/auth/login').send({ email: 'both@example.se', password: 'correct horse battery' }).expect(200);
  });

  it('protects against pre-registration takeover of an unverified email', async () => {
    const { token: attacker } = await signUp(h, 'victim@example.se', { verify: false });
    const res = await signIn('google', await idToken({ sub: 'g-4', email: 'victim@example.se', email_verified: true })).expect(200);
    expect(res.body.user.emailVerified).toBe(true);
    await h.http().get('/v1/auth/me').set('Authorization', `Bearer ${attacker}`).expect(401);
    await h.http().post('/v1/auth/login').send({ email: 'victim@example.se', password: 'correct horse battery' }).expect(401);
  });

  it('rejects forged, expired, wrong-audience and unverified-email tokens', async () => {
    await signIn('google', await idToken({ sub: 'x', email: 'a@b.se', email_verified: true }, { key: otherKey })).expect(401);
    await signIn('google', await idToken({ sub: 'x', email: 'a@b.se', email_verified: true }, { expiresIn: '-5m' })).expect(401);
    await signIn('google', await idToken({ sub: 'x', email: 'a@b.se', email_verified: true }, { aud: 'someone-else' })).expect(401);
    await signIn('google', await idToken({ sub: 'x', email: 'a@b.se', email_verified: true }, { iss: APPLE.iss })).expect(401);
    const res = await signIn('google', await idToken({ sub: 'x', email: 'a@b.se', email_verified: false })).expect(400);
    expect(res.body.error).toBe('email_required');
    await signIn('facebook', await idToken({ sub: 'x' })).expect(404);
  });
});

describe('Apple sign-in', () => {
  it('accepts Apple tokens (email_verified as a string, private relay email)', async () => {
    const token = await idToken({ sub: 'a-1', email: 'abc123@privaterelay.appleid.com', email_verified: 'true' }, { iss: APPLE.iss, aud: APPLE.aud });
    const res = await signIn('apple', token).expect(200);
    expect(res.body).toMatchObject({ created: true, user: { email: 'abc123@privaterelay.appleid.com', emailVerified: true } });
  });

  it('recognises a returning Apple user whose later tokens omit the email', async () => {
    const first = await signIn('apple', await idToken({ sub: 'a-2', email: 'x2@privaterelay.appleid.com', email_verified: 'true' }, { iss: APPLE.iss, aud: APPLE.aud })).expect(200);
    const again = await signIn('apple', await idToken({ sub: 'a-2' }, { iss: APPLE.iss, aud: APPLE.aud })).expect(200);
    expect(again.body.user.id).toBe(first.body.user.id);
  });
});

describe('when a provider is not configured', () => {
  it('answers that the provider is not available', async () => {
    const plain = await startHarness();
    try {
      const res = await plain.http().post('/v1/auth/oauth/google').send({ idToken: await idToken({ sub: 'g' }) }).expect(404);
      expect(res.body.error).toBe('provider_not_enabled');
    } finally {
      await plain.close();
    }
  });
});
