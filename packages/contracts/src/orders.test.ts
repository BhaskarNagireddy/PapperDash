import { describe, expect, it } from 'vitest';
import { CreateOrderInput, ORDER_STATES, ORDER_TRANSITIONS, TERMINAL_STATES, canTransition } from './orders.js';

describe('order state machine', () => {
  it('lets each fulfilment method reach Completed only through its own path', () => {
    expect(canTransition('Printed', 'Collected', 'walk-up')).toBe(true);
    expect(canTransition('Printed', 'Collected', 'locker')).toBe(false);
    expect(canTransition('Printed', 'Ready', 'locker')).toBe(true);
    expect(canTransition('Printed', 'Ready', 'delivery')).toBe(false);
    expect(canTransition('Printed', 'ReadyForCourier', 'delivery')).toBe(true);
    expect(canTransition('ReadyForCourier', 'OutForDelivery', 'delivery')).toBe(true);
  });

  it('never marks an order ready before it is printed', () => {
    for (const from of ORDER_STATES) {
      if (from === 'Printed' || from === 'SupportRequired') continue;
      expect(canTransition(from, 'Ready', 'locker')).toBe(false);
    }
  });

  it('cannot collect an order twice', () => {
    expect(canTransition('Collected', 'Collected', 'locker')).toBe(false);
    expect(canTransition('OutForDelivery', 'OutForDelivery', 'delivery')).toBe(false);
  });

  it('retries a failed print without a new payment', () => {
    expect(canTransition('Failed', 'Queued', 'locker')).toBe(true);
  });

  it('has no way out of a terminal state', () => {
    for (const s of TERMINAL_STATES) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });

  it('every state can eventually reach a terminal state', () => {
    for (const start of ORDER_STATES) {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        for (const t of ORDER_TRANSITIONS[queue.shift()!]) {
          if (!seen.has(t.to)) {
            seen.add(t.to);
            queue.push(t.to);
          }
        }
      }
      expect(TERMINAL_STATES.some((t) => seen.has(t))).toBe(true);
    }
  });
});

describe('CreateOrderInput', () => {
  it('requires a station for walk-up and locker orders', () => {
    const base = { documentId: 'doc_1', settings: {} };
    expect(CreateOrderInput.safeParse({ ...base, fulfilment: 'locker' }).success).toBe(false);
    expect(CreateOrderInput.safeParse({ ...base, fulfilment: 'locker', stationId: 'lund-1' }).success).toBe(true);
    expect(CreateOrderInput.safeParse({ ...base, fulfilment: 'delivery' }).success).toBe(true);
  });

  it('rejects malformed page ranges', () => {
    const r = (pageRange: string) =>
      CreateOrderInput.safeParse({ documentId: 'd', fulfilment: 'delivery', settings: { pageRange } }).success;
    expect(r('1-3,5')).toBe(true);
    expect(r('1-')).toBe(false);
    expect(r('abc')).toBe(false);
  });
});
