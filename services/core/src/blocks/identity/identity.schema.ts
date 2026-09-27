import { index, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const identity = pgSchema('identity');

export const users = identity.table('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  /** Null for accounts that only sign in with Google or Apple. */
  passwordHash: text('password_hash'),
  roles: text('roles').array().notNull().default(['customer']),
  locale: text('locale').notNull().default('sv'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** Opaque sessions: only the SHA-256 of the token is stored. */
export const sessions = identity.table(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    /** 'web' = email + password; 'station' = opened by scanning a station QR code. */
    kind: text('kind').notNull(),
    stationId: text('station_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Single-use links sent by email: email verification and password reset. */
export const oneTimeTokens = identity.table('one_time_tokens', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/** QR codes shown on a station screen, approved from the customer's phone. */
export const qrChallenges = identity.table('qr_challenges', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  stationId: text('station_id').notNull(),
  status: text('status').notNull(),
  userId: text('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

/** Google and Apple accounts linked to a PapperDash user, keyed by the provider's stable subject ID. */
export const externalIdentities = identity.table(
  'external_identities',
  {
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    email: text('email'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.subject] }), index('external_identities_user_idx').on(t.userId)],
);
