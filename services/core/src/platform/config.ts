import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(4000),
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('eu-north-1'),
  S3_ENDPOINT: z.url().optional(),
  S3_KMS_KEY_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_/, 'Use a Stripe secret (sk_) or restricted (rk_) key').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  STRIPE_AUTOMATIC_TAX: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Sender for account emails through Amazon SES, e.g. "PapperDash <no-reply@papperdash.se>". Unset = emails are logged (development only). */
  EMAIL_FROM: z.string().min(3).optional(),
  SES_REGION: z.string().default('eu-north-1'),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  APPLE_CLIENT_IDS: z.string().default(''),
  STATION_KEYS: z
    .string()
    .default('{}')
    .transform((s, ctx) => {
      try {
        return z.record(z.string(), z.string().min(24)).parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'STATION_KEYS must be a JSON object of stationId -> key (24+ chars)' });
        return z.NEVER;
      }
    }),
});

export type AppConfig = {
  port: number;
  publicWebUrl: string;
  cookieSecure: boolean;
  stationKeys: Record<string, string>;
  /** Accepted ID-token audiences per sign-in provider. An empty list disables that provider. */
  oauthAudiences: { google: string[]; apple: string[] };
  /** Stripe keys; null switches payments off. */
  stripe: { secretKey: string; webhookSecret: string; automaticTax: boolean } | null;
  /** Amazon SES sender; null logs emails instead (development only — refused in production). */
  email: { from: string; region: string } | null;
  /** Document storage; null keeps files in memory (tests and quick local runs only). */
  storage: { bucket: string; region: string; endpoint?: string; kmsKeyId?: string } | null;
  /** Poll interval for the outbox relay; 0 disables the timer (tests flush manually). */
  outboxPollMs: number;
  /** How often expired documents are deleted; 0 disables the timer. */
  retentionSweepMs: number;
};

export class UnsafeProductionConfigError extends Error {}

/**
 * Reads configuration from the environment. In production it refuses settings that are only safe for
 * development, so a missing secret fails the deploy instead of silently weakening the live system.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig & { databaseUrl: string } {
  const e = Env.parse(env);
  if (e.NODE_ENV === 'production') {
    const problems = [
      !e.COOKIE_SECURE && 'COOKIE_SECURE must be true (session cookies only over HTTPS)',
      !e.S3_BUCKET && 'S3_BUCKET is required (in-memory document storage loses files and is not encrypted)',
      e.S3_BUCKET && !e.S3_KMS_KEY_ID && 'S3_KMS_KEY_ID is required (documents must be encrypted at rest with KMS)',
      // Without SES, emails (with password-reset and verification links) would be written to the logs.
      !e.EMAIL_FROM && 'EMAIL_FROM is required (account emails must be sent through SES, never logged)',
      !e.PUBLIC_WEB_URL.startsWith('https://') && 'PUBLIC_WEB_URL must use https',
    ].filter((p): p is string => !!p);
    if (problems.length) throw new UnsafeProductionConfigError(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  }
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    publicWebUrl: e.PUBLIC_WEB_URL,
    cookieSecure: e.COOKIE_SECURE,
    stationKeys: e.STATION_KEYS,
    oauthAudiences: { google: csv(e.GOOGLE_CLIENT_IDS), apple: csv(e.APPLE_CLIENT_IDS) },
    stripe:
      e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET
        ? { secretKey: e.STRIPE_SECRET_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET, automaticTax: e.STRIPE_AUTOMATIC_TAX }
        : null,
    email: e.EMAIL_FROM ? { from: e.EMAIL_FROM, region: e.SES_REGION } : null,
    storage: e.S3_BUCKET ? { bucket: e.S3_BUCKET, region: e.S3_REGION, endpoint: e.S3_ENDPOINT, kmsKeyId: e.S3_KMS_KEY_ID } : null,
    outboxPollMs: 500,
    retentionSweepMs: 5 * 60 * 1000,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
