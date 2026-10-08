import { describe, expect, it } from 'vitest';
import { loadConfig, UnsafeProductionConfigError } from './config.js';

const base = { DATABASE_URL: 'postgres://localhost/pd' };
const production = {
  ...base,
  NODE_ENV: 'production',
  PUBLIC_WEB_URL: 'https://www.papperdash.se',
  S3_BUCKET: 'papperdash-documents',
  S3_KMS_KEY_ID: 'arn:aws:kms:eu-north-1:123456789012:key/abc',
  EMAIL_FROM: 'PapperDash <no-reply@papperdash.se>',
};

describe('loadConfig', () => {
  it('uses safe defaults in development and switches optional integrations off', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ port: 4000, cookieSecure: true, stripe: null, storage: null, email: null, stationKeys: {} });
    expect(c.oauthAudiences).toEqual({ google: [], apple: [] });
  });

  it('switches integrations on only when all their settings are present', () => {
    const c = loadConfig({
      ...base,
      STRIPE_SECRET_KEY: 'rk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      GOOGLE_CLIENT_IDS: ' web.apps.googleusercontent.com , ios.apps.googleusercontent.com ',
      S3_BUCKET: 'b',
      EMAIL_FROM: 'a@b.se',
    });
    expect(c.stripe).toEqual({ secretKey: 'rk_test_x', webhookSecret: 'whsec_x', automaticTax: false });
    expect(c.oauthAudiences.google).toEqual(['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com']);
    expect(c.storage).toMatchObject({ bucket: 'b', region: 'eu-north-1' });
    expect(c.email).toEqual({ from: 'a@b.se', region: 'eu-north-1' });
    expect(loadConfig({ ...base, STRIPE_SECRET_KEY: 'rk_test_x' }).stripe).toBeNull();
  });

  it('rejects malformed secrets and station keys', () => {
    expect(() => loadConfig({ ...base, STRIPE_SECRET_KEY: 'pk_test_publishable' })).toThrow(/secret \(sk_\) or restricted \(rk_\)/);
    expect(() => loadConfig({ ...base, STATION_KEYS: '{"lund-1":"short"}' })).toThrow(/STATION_KEYS/);
    expect(() => loadConfig({ ...base, STATION_KEYS: 'not json' })).toThrow(/STATION_KEYS/);
  });

  it('starts in production when every safety setting is present', () => {
    expect(loadConfig(production).email).toMatchObject({ from: 'PapperDash <no-reply@papperdash.se>' });
  });

  it.each([
    ['COOKIE_SECURE', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    ['document storage', { S3_BUCKET: undefined }, /S3_BUCKET/],
    ['encryption key', { S3_KMS_KEY_ID: undefined }, /S3_KMS_KEY_ID/],
    ['email sender (else reset links would be logged)', { EMAIL_FROM: undefined }, /EMAIL_FROM/],
    ['https site', { PUBLIC_WEB_URL: 'http://www.papperdash.se' }, /https/],
  ])('refuses to start in production without %s', (_name, change, message) => {
    const env = { ...production, ...change };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(UnsafeProductionConfigError);
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(message);
  });
});
