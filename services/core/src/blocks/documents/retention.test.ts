import { describe, expect, it } from 'vitest';
import { retainUntil } from './retention.js';

const t0 = new Date('2026-10-01T10:00:00Z');
const at = (hours: number) => new Date(t0.getTime() + hours * 3600 * 1000);

describe('retention policy', () => {
  it('deletes an unused upload 2 hours after upload', () => {
    expect(retainUntil(t0, [])).toEqual(at(2));
    expect(retainUntil(t0, [{ state: 'Draft', changedAt: at(1) }])).toEqual(at(2));
  });

  it('gives a customer who is paying 2 more hours', () => {
    expect(retainUntil(t0, [{ state: 'AwaitingPayment', changedAt: at(1.5) }])).toEqual(at(3.5));
  });

  it('keeps the file while any paid order is open, including support cases', () => {
    for (const state of ['Paid', 'Printing', 'Failed', 'SupportRequired', 'OutForDelivery'] as const) {
      expect(retainUntil(t0, [{ state, changedAt: at(1) }])).toBeNull();
    }
  });

  it('deletes 24 hours after the last order using it is completed or refunded', () => {
    expect(
      retainUntil(t0, [
        { state: 'Completed', changedAt: at(5) },
        { state: 'Refunded', changedAt: at(9) },
      ]),
    ).toEqual(at(33));
    expect(retainUntil(t0, [{ state: 'Completed', changedAt: at(5) }, { state: 'Printing', changedAt: at(6) }])).toBeNull();
  });

  it('does not extend retention for cancelled, never-paid orders', () => {
    expect(retainUntil(t0, [{ state: 'Cancelled', changedAt: at(1) }])).toEqual(at(2));
  });
});
