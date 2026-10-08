import { describe, expect, it } from 'vitest';
import { ApproveQrChallengeInput, LoginInput, OAuthSignInInput, PASSWORD_MIN_LENGTH, RegisterInput, ResetPasswordInput } from './identity.js';

describe('identity inputs', () => {
  it('normalises emails so one person has one account', () => {
    expect(RegisterInput.parse({ email: '  Anna.Svensson@Example.SE ', password: 'x'.repeat(PASSWORD_MIN_LENGTH) })).toEqual({
      email: 'anna.svensson@example.se',
      password: 'x'.repeat(PASSWORD_MIN_LENGTH),
      locale: 'sv',
    });
    expect(LoginInput.parse({ email: 'ANNA@example.se', password: 'p' }).email).toBe('anna@example.se');
  });

  it('requires passwords of at least 10 characters for new accounts and resets', () => {
    expect(RegisterInput.safeParse({ email: 'a@b.se', password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1) }).success).toBe(false);
    expect(ResetPasswordInput.safeParse({ token: 't'.repeat(43), password: 'short' }).success).toBe(false);
    expect(ResetPasswordInput.safeParse({ token: 't'.repeat(43), password: 'long enough pw' }).success).toBe(true);
  });

  it('rejects malformed emails and unknown languages', () => {
    expect(RegisterInput.safeParse({ email: 'not-an-email', password: 'long enough pw' }).success).toBe(false);
    expect(RegisterInput.safeParse({ email: 'a@b.se', password: 'long enough pw', locale: 'de' }).success).toBe(false);
  });

  it('bounds tokens to sane lengths', () => {
    expect(ApproveQrChallengeInput.safeParse({ token: 'short' }).success).toBe(false);
    expect(OAuthSignInInput.safeParse({ idToken: 'x'.repeat(9000) }).success).toBe(false);
    expect(OAuthSignInInput.parse({ idToken: 'x'.repeat(100) }).locale).toBe('sv');
  });
});
