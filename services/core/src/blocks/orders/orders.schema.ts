import { index, integer, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const ordersSchema = pgSchema('orders');

export const orders = ordersSchema.table(
  'orders',
  {
    id: text('id').primaryKey(),
    reference: text('reference').notNull().unique(),
    // IDs from other blocks are stored as plain values: no cross-schema foreign keys, so blocks stay separable.
    customerId: text('customer_id').notNull(),
    documentId: text('document_id').notNull(),
    settings: jsonb('settings').notNull(),
    /** Pages printed per copy, after the page range is applied to the document. */
    pages: integer('pages').notNull(),
    fulfilment: text('fulfilment').notNull(),
    stationId: text('station_id'),
    state: text('state').notNull(),
    totalMinor: integer('total_minor'),
    currency: text('currency'),
    /** Optimistic lock: every transition increments it, so two concurrent transitions cannot both win. */
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('orders_customer_idx').on(t.customerId, t.createdAt), index('orders_state_idx').on(t.state)],
);

/** Timestamped record of every transition: who, from, to, why. */
export const orderStateHistory = ordersSchema.table(
  'order_state_history',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    fromState: text('from_state').notNull(),
    toState: text('to_state').notNull(),
    actor: jsonb('actor').notNull(),
    reason: text('reason'),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [index('order_history_order_idx').on(t.orderId, t.at)],
);
