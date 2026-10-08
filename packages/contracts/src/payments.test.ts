import { describe, expect, it } from 'vitest';
import { OPEN_PAYMENT_STATUSES, RefundInput } from './payments.js';

describe('payment inputs', () => {
  it('requires a reason for every refund and a positive whole amount when given', () => {
    expect(RefundInput.safeParse({ reason: 'Wrong paper' }).success).toBe(true);
    expect(RefundInput.safeParse({}).success).toBe(false);
    expect(RefundInput.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(RefundInput.safeParse({ reason: 'Goodwill', amountMinor: 0 }).success).toBe(false);
    expect(RefundInput.safeParse({ reason: 'Goodwill', amountMinor: 12.5 }).success).toBe(false);
    expect(RefundInput.parse({ reason: '  Goodwill  ', amountMinor: 500 })).toEqual({ reason: 'Goodwill', amountMinor: 500 });
  });

  it('treats only unfinished payments as open (so checkout resumes them instead of charging twice)', () => {
    expect([...OPEN_PAYMENT_STATUSES].sort()).toEqual(['processing', 'requires_action']);
  });
});
