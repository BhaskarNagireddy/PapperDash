import { index, integer, jsonb, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const pricingSchema = pgSchema('pricing');

/**
 * Append-only: a price change inserts a new row effective from `active_from`, so every past
 * quote can be explained and the full price history is kept for audit.
 */
export const priceLists = pricingSchema.table(
  'price_lists',
  {
    id: text('id').primaryKey(),
    market: text('market').notNull(),
    currency: text('currency').notNull(),
    vatRateBp: integer('vat_rate_bp').notNull(),
    maxPages: integer('max_pages').notNull(),
    maxFileMb: integer('max_file_mb').notNull(),
    bwTiers: jsonb('bw_tiers').notNull(),
    /** Null = colour not offered. */
    colourTiers: jsonb('colour_tiers'),
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('price_lists_market_active_idx').on(t.market, t.activeFrom)],
);
