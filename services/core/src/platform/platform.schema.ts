import { index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Shared infrastructure tables. No business data lives here. */
export const platform = pgSchema('platform');

/** Transactional outbox: events are written in the same transaction as the change they describe. */
export const outbox = platform.table(
  'outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    version: integer('version').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_unpublished_idx').on(t.publishedAt, t.id)],
);

/** Which consumer has handled which event, so redelivery never runs a handler twice. */
export const processedEvents = platform.table(
  'processed_events',
  {
    consumer: text('consumer').notNull(),
    eventId: text('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

/**
 * Leases: which server instance currently runs a background job (the event relay, retention, expiry).
 * Taking a lease is one atomic upsert, so with several instances exactly one runs each job; if that
 * instance dies, its lease expires and another takes over.
 */
export const leases = platform.table('leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Request counters per key and fixed time window, shared by every server instance. */
export const rateLimits = platform.table(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index('rate_limits_window_idx').on(t.windowStart)],
);
