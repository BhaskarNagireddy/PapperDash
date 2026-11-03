import { boolean, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const stationsSchema = pgSchema('stations');

/** The station directory. Devices authenticate separately (STATION_KEYS now, mutual TLS later). */
export const stations = stationsSchema.table('stations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  lockers: boolean('lockers').notNull(),
  active: boolean('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
