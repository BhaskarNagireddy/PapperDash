import { describe, expect, it } from 'vitest';
import { JoinWaitlistInput } from './waitlist.js';

describe('JoinWaitlistInput', () => {
  it('normalises the email and postcode and defaults to Swedish', () => {
    expect(JoinWaitlistInput.parse({ email: ' Eva@Example.se ', postcode: ' 223 50 ', consent: true })).toEqual({ email: 'eva@example.se', postcode: '22350', consent: true, locale: 'sv' });
  });

  it('needs explicit consent', () => {
    expect(JoinWaitlistInput.safeParse({ email: 'eva@example.se', consent: false }).success).toBe(false);
    expect(JoinWaitlistInput.safeParse({ email: 'eva@example.se' }).success).toBe(false);
  });

  it('accepts only Swedish postcodes', () => {
    expect(JoinWaitlistInput.safeParse({ email: 'eva@example.se', postcode: '2235', consent: true }).success).toBe(false);
    expect(JoinWaitlistInput.safeParse({ email: 'eva@example.se', postcode: 'SW1A 1AA', consent: true }).success).toBe(false);
  });
});
