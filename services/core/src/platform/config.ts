import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(4000),
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
  /** Poll interval for the outbox relay; 0 disables the timer (tests flush manually). */
  outboxPollMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig & { databaseUrl: string } {
  const e = Env.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    publicWebUrl: e.PUBLIC_WEB_URL,
    cookieSecure: e.COOKIE_SECURE,
    stationKeys: e.STATION_KEYS,
    outboxPollMs: 500,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
