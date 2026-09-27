import { boolean, index, integer, pgSchema, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const paymentsSchema = pgSchema('payments');

/** One row per checkout attempt. A failed or cancelled attempt is kept; the next checkout makes attempt n+1. */
export const payments = paymentsSchema.table(
  'payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull(),
    customerId: text('customer_id').notNull(),
    attempt: integer('attempt').notNull(),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull().unique(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    succeededAt: timestamp('succeeded_at', { withTimezone: true }),
  },
  (t) => [unique('payments_order_attempt_uq').on(t.orderId, t.attempt), index('payments_order_idx').on(t.orderId)],
);

export const refunds = paymentsSchema.table(
  'refunds',
  {
    id: text('id').primaryKey(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    orderId: text('order_id').notNull(),
    providerRefundId: text('provider_refund_id').unique(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    /** Refunds the whole payment; a confirmed full refund moves the order to Refunded. */
    full: boolean('full').notNull(),
    reason: text('reason').notNull(),
    /** User ID of the staff member, or "system" for automatic refunds. */
    requestedBy: text('requested_by').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('refunds_payment_idx').on(t.paymentId)],
);

/** Provider webhook IDs already handled: providers deliver at least once, so each is applied exactly once. */
export const webhookEvents = paymentsSchema.table(
  'webhook_events',
  {
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    kind: text('kind').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.eventId] })],
);
