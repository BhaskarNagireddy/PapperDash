import { z } from 'zod';

const Env = z.object({
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
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
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
  stripe: { secretKey: string; publishableKey: string; webhookSecret: string } | null;
  /** Document storage; null keeps files in memory (tests and quick local runs only). */
  storage: { bucket: string; region: string; endpoint?: string; kmsKeyId?: string } | null;
  /** Poll interval for the outbox relay; 0 disables the timer (tests flush manually). */
  outboxPollMs: number;
  /** How often expired documents are deleted; 0 disables the timer. */
  retentionSweepMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig & { databaseUrl: string } {
  const e = Env.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    publicWebUrl: e.PUBLIC_WEB_URL,
    cookieSecure: e.COOKIE_SECURE,
    stationKeys: e.STATION_KEYS,
    oauthAudiences: { google: csv(e.GOOGLE_CLIENT_IDS), apple: csv(e.APPLE_CLIENT_IDS) },
    stripe:
      e.STRIPE_SECRET_KEY && e.STRIPE_PUBLISHABLE_KEY && e.STRIPE_WEBHOOK_SECRET
        ? { secretKey: e.STRIPE_SECRET_KEY, publishableKey: e.STRIPE_PUBLISHABLE_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET }
        : null,
    storage: e.S3_BUCKET ? { bucket: e.S3_BUCKET, region: e.S3_REGION, endpoint: e.S3_ENDPOINT, kmsKeyId: e.S3_KMS_KEY_ID } : null,
    outboxPollMs: 500,
    retentionSweepMs: 5 * 60 * 1000,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
