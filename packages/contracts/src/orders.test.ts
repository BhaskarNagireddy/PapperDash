import { describe, expect, it } from 'vitest';
import { CreateOrderInput, ORDER_STATES, ORDER_TRANSITIONS, TERMINAL_STATES, TRACKING_STEPS, canTransition, isOrderActive, orderTracking, type FulfilmentMethod, type OrderState } from './orders.js';

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

describe('orderTracking (where the customer sees their order)', () => {
  it('follows each way of getting the printout', () => {
    expect(orderTracking('walk-up', 'Paid')!.map((s) => s.status)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(orderTracking('walk-up', 'Queued')!.map((s) => s.status)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(orderTracking('locker', 'Ready')!.map((s) => `${s.state}:${s.status}`)).toEqual(['Paid:done', 'Printing:done', 'Ready:current', 'Collected:upcoming']);
    expect(orderTracking('delivery', 'OutForDelivery')!.map((s) => s.status)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
  });

  it('marks the last step done when it is reached, and everything done when completed', () => {
    expect(orderTracking('walk-up', 'Collected')!.every((s) => s.status === 'done')).toBe(true);
    expect(orderTracking('delivery', 'Completed')!.every((s) => s.status === 'done')).toBe(true);
  });

  it('has no progress view off the normal path', () => {
    for (const state of ['Draft', 'AwaitingPayment', 'Cancelled', 'Refunded', 'SupportRequired', 'Failed', 'DeliveryFailed'] as const) {
      expect(orderTracking('delivery', state), state).toBeNull();
    }
  });

  it('each milestone follows the previous one in the state machine, on that path only', () => {
    /** States reachable from `from` on the normal path (no support or failure detours). */
    const reachable = (from: OrderState, method: FulfilmentMethod) => {
      const seen = new Set<OrderState>([from]);
      const queue = [from];
      while (queue.length) {
        const s = queue.shift()!;
        for (const t of ORDER_TRANSITIONS[s]) {
          if (['SupportRequired', 'Failed', 'Refunded', 'DeliveryFailed'].includes(t.to) || seen.has(t.to) || !canTransition(s, t.to, method)) continue;
          seen.add(t.to);
          queue.push(t.to);
        }
      }
      return seen;
    };
    for (const [method, steps] of Object.entries(TRACKING_STEPS) as Array<[FulfilmentMethod, readonly OrderState[]]>) {
      for (let i = 1; i < steps.length; i++) expect(reachable(steps[i - 1]!, method).has(steps[i]!), `${method}: ${steps[i - 1]} -> ${steps[i]}`).toBe(true);
      expect(reachable(steps.at(-1)!, method).has('Completed'), `${method} ends in Completed`).toBe(true);
    }
  });

  it('knows which orders still change by themselves', () => {
    expect(isOrderActive('Printing')).toBe(true);
    expect(isOrderActive('AwaitingPayment')).toBe(true);
    expect(isOrderActive('Completed')).toBe(false);
    expect(isOrderActive('Cancelled')).toBe(false);
  });
});
