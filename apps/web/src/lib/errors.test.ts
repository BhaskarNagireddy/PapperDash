import { JoinWaitlistInput, RegisterInput } from '@papperdash/contracts';
import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { sv } from '@/i18n/sv';
import { ApiError } from './api';
import { fill, toFormError, validate } from './errors';

describe('form errors in the visitor’s language', () => {
  it('maps the server’s error codes to Swedish messages', () => {
    expect(toFormError(new ApiError(401, 'invalid_credentials', 'Wrong email or password.'), sv.errors).form).toBe(sv.errors.invalidCredentials);
    expect(toFormError(new ApiError(409, 'email_taken', 'x'), sv.errors).form).toBe(sv.errors.emailTaken);
    expect(toFormError(new ApiError(429, 'rate_limited', 'x', 60), sv.errors).form).toBe(sv.errors.rateLimited);
    expect(toFormError(new ApiError(0, 'network', 'x'), sv.errors).form).toBe(sv.errors.network);
  });

  it('never shows an unknown server message or a crash to the customer', () => {
    expect(toFormError(new ApiError(500, 'http_500', 'TypeError: x is undefined'), en.errors).form).toBe(en.errors.generic);
    expect(toFormError(new Error('boom'), en.errors).form).toBe(en.errors.generic);
  });

  it('puts server validation problems on the right fields', () => {
    const err = new ApiError(400, 'validation_failed', 'x', undefined, [{ path: 'email', message: 'Invalid email' }]);
    expect(toFormError(err, sv.errors).fields).toEqual({ email: sv.errors.invalidEmail });
  });

  it('checks forms with the same contracts as the server', () => {
    const bad = validate(RegisterInput, { email: 'nope', password: 'short', locale: 'sv' }, sv.errors);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.fields).toEqual({ email: sv.errors.invalidEmail, password: sv.errors.passwordTooShort });

    const ok = validate(JoinWaitlistInput, { email: ' Eva@Example.se ', postcode: '223 50', consent: true }, sv.errors);
    expect(ok).toEqual({ ok: true, data: { email: 'eva@example.se', postcode: '22350', consent: true, locale: 'sv' } });
  });

  it('fills placeholders', () => {
    expect(fill(en.signup.doneBody, { email: 'a@b.se' })).toContain('a@b.se');
  });
});
