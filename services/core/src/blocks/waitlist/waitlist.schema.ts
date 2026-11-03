import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const waitlist = pgSchema('waitlist');

/** One row per address. Deleted (not flagged) when the person leaves, so nothing is kept after consent ends. */
export const waitlistEntries = waitlist.table('entries', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  locale: text('locale').notNull(),
  postcode: text('postcode'),
  /** When the visitor ticked the consent box (GDPR art. 7: the controller must be able to show consent). */
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  /** SHA-256 of the secret in the "remove me" link. */
  leaveTokenHash: text('leave_token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
