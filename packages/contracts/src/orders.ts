import { z } from 'zod';
import type { DomainEvent } from './events.js';

export const FULFILMENT_METHODS = ['walk-up', 'locker', 'delivery'] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];

export const ORDER_STATES = [
  'Draft',
  'AwaitingPayment',
  'Paid',
  'Queued',
  'Printing',
  'Printed',
  'Ready',
  'ReadyForCourier',
  'OutForDelivery',
  'Delivered',
  'DeliveryFailed',
  'Collected',
  'Completed',
  'Failed',
  'SupportRequired',
  'Refunded',
  'Cancelled',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const TERMINAL_STATES: readonly OrderState[] = ['Completed', 'Refunded', 'Cancelled'];

interface Transition {
  to: OrderState;
  /** Restricts the transition to these fulfilment methods; absent = any method. */
  only?: readonly FulfilmentMethod[];
}

/**
 * The single order state machine (see docs/architecture/order-lifecycle.md).
 * Every surface uses it; the orders block rejects anything not listed here.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderState, readonly Transition[]>> = {
  Draft: [{ to: 'AwaitingPayment' }, { to: 'Cancelled' }],
  AwaitingPayment: [{ to: 'Paid' }, { to: 'Cancelled' }],
  Paid: [{ to: 'Queued' }, { to: 'SupportRequired' }, { to: 'Refunded' }],
  Queued: [{ to: 'Printing' }, { to: 'Failed' }],
  Printing: [{ to: 'Printed' }, { to: 'Failed' }],
  Printed: [
    { to: 'Collected', only: ['walk-up'] },
    { to: 'Ready', only: ['locker'] },
    { to: 'ReadyForCourier', only: ['delivery'] },
    { to: 'SupportRequired' },
  ],
  Ready: [{ to: 'Collected', only: ['locker'] }, { to: 'SupportRequired' }],
  ReadyForCourier: [{ to: 'OutForDelivery', only: ['delivery'] }, { to: 'SupportRequired' }],
  OutForDelivery: [{ to: 'Delivered' }, { to: 'DeliveryFailed' }],
  DeliveryFailed: [{ to: 'SupportRequired' }],
  Delivered: [{ to: 'Completed' }],
  Collected: [{ to: 'Completed' }],
  Failed: [{ to: 'Queued' }, { to: 'SupportRequired' }, { to: 'Refunded' }],
  SupportRequired: [{ to: 'Queued' }, { to: 'Ready' }, { to: 'ReadyForCourier' }, { to: 'Completed' }, { to: 'Refunded' }],
  Completed: [],
  Refunded: [],
  Cancelled: [],
};

export function canTransition(from: OrderState, to: OrderState, method: FulfilmentMethod): boolean {
  return ORDER_TRANSITIONS[from].some((t) => t.to === to && (!t.only || t.only.includes(method)));
}

/** Customer-facing wording, identical on every surface. */
export const ORDER_STATE_LABELS: Readonly<Record<OrderState, { en: string; sv: string }>> = {
  Draft: { en: 'Uploaded', sv: 'Uppladdad' },
  AwaitingPayment: { en: 'Awaiting payment', sv: 'Väntar på betalning' },
  Paid: { en: 'Paid', sv: 'Betald' },
  Queued: { en: 'Queued', sv: 'I kö' },
  Printing: { en: 'Printing', sv: 'Skrivs ut' },
  Printed: { en: 'Printed', sv: 'Utskriven' },
  Ready: { en: 'Ready for pickup', sv: 'Redo att hämta' },
  ReadyForCourier: { en: 'Waiting for courier', sv: 'Väntar på bud' },
  OutForDelivery: { en: 'Out for delivery', sv: 'Ute för leverans' },
  Delivered: { en: 'Delivered', sv: 'Levererad' },
  DeliveryFailed: { en: 'Delivery failed', sv: 'Leveransen misslyckades' },
  Collected: { en: 'Collected', sv: 'Hämtad' },
  Completed: { en: 'Completed', sv: 'Klar' },
  Failed: { en: 'Failed', sv: 'Misslyckades' },
  SupportRequired: { en: 'Being handled by support', sv: 'Hanteras av support' },
  Refunded: { en: 'Refunded', sv: 'Återbetald' },
  Cancelled: { en: 'Cancelled', sv: 'Avbruten' },
};

export const COLOUR_MODES = ['bw', 'colour'] as const;
export const PAPER_SIZES = ['A4', 'A3'] as const;

/** "1-3,5,8-10" — validated for shape here; checked against the document's page count by the documents block. */
const PAGE_RANGE_RE = /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/;

export const PrintSettings = z.object({
  colour: z.enum(COLOUR_MODES).default('bw'),
  duplex: z.boolean().default(false),
  copies: z.int().min(1).max(100).default(1),
  paperSize: z.enum(PAPER_SIZES).default('A4'),
  pageRange: z.string().regex(PAGE_RANGE_RE, 'Use a range like 1-3,5').optional(),
});
export type PrintSettings = z.infer<typeof PrintSettings>;

export const CreateOrderInput = z
  .object({
    documentId: z.string().min(1).max(64),
    settings: PrintSettings,
    fulfilment: z.enum(FULFILMENT_METHODS),
    stationId: z.string().min(1).max(64).optional(),
  })
  .refine((o) => o.fulfilment === 'delivery' || !!o.stationId, {
    message: 'Walk-up and locker orders need a station',
    path: ['stationId'],
  });
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export interface Money {
  /** Amount in minor units (öre, cents). */
  amountMinor: number;
  currency: 'SEK' | 'DKK' | 'EUR';
}

export interface OrderView {
  id: string;
  /** Human-readable reference shown to customers, e.g. PD-7K3M9Q. */
  reference: string;
  customerId: string;
  documentId: string;
  settings: PrintSettings;
  /** Pages printed from the document (after the page range), per copy. */
  pages: number;
  fulfilment: FulfilmentMethod;
  stationId: string | null;
  state: OrderState;
  total: Money | null;
  createdAt: string;
  updatedAt: string;
}

export type OrderActor =
  | { kind: 'customer'; userId: string }
  | { kind: 'staff'; userId: string }
  | { kind: 'courier'; userId: string }
  | { kind: 'system'; block: string };

export type OrderCreated = DomainEvent<
  'orders.OrderCreated',
  { orderId: string; customerId: string; fulfilment: FulfilmentMethod; stationId: string | null; documentId: string }
>;
export type OrderStateChanged = DomainEvent<
  'orders.OrderStateChanged',
  { orderId: string; from: OrderState; to: OrderState; actor: OrderActor; reason?: string }
>;
export type OrderEvent = OrderCreated | OrderStateChanged;
