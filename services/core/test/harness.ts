import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { configureApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { OAuthVerifier } from '../src/blocks/identity/index.js';
import { Clock } from '../src/platform/clock.js';
import type { Db } from '../src/platform/database.js';
import { LogEmailProvider } from '../src/platform/email.js';

export class FakeClock extends Clock {
  private t = new Date('2026-10-01T09:00:00Z').getTime();
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export const STATION = { id: 'lund-sim-1', key: 'test-station-key-0123456789abcdef' };

export interface Harness {
  app: NestExpressApplication;
  db: Db;
  clock: FakeClock;
  email: LogEmailProvider;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** A full core app on an in-memory Postgres (PGlite) with real migrations. Pass `oauth` to replace the Google/Apple verifier. */
export async function startHarness(opts: { oauth?: OAuthVerifier } = {}): Promise<Harness> {
  const pglite = new PGlite();
  const db = drizzle(pglite) as unknown as Db;
  await migrate(drizzle(pglite), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const clock = new FakeClock();
  const email = new LogEmailProvider();
  let builder = Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        db,
        clock,
        email,
        config: {
          port: 0,
          publicWebUrl: 'https://papperdash.test',
          cookieSecure: false,
          stationKeys: { [STATION.id]: STATION.key },
          oauthAudiences: { google: [], apple: [] },
          outboxPollMs: 0,
        },
      }),
    ],
  });
  if (opts.oauth) builder = builder.overrideProvider(OAuthVerifier).useValue(opts.oauth);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: false }));
  await app.init();
  return {
    app,
    db,
    clock,
    email,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await pglite.close();
    },
  };
}

export function lastToken(email: LogEmailProvider, to: string): string {
  const msg = [...email.sent].reverse().find((m) => m.to === to);
  const m = msg?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!m?.[1]) throw new Error(`No token email for ${to}`);
  return m[1];
}

/** Registers, optionally verifies, logs in; returns the Bearer token and user. */
export async function signUp(h: Harness, email: string, { verify = true } = {}) {
  const password = 'correct horse battery';
  await h.http().post('/v1/auth/register').send({ email, password, locale: 'en' }).expect(201);
  if (verify) await h.http().post('/v1/auth/verify-email').send({ token: lastToken(h.email, email) }).expect(204);
  const res = await h.http().post('/v1/auth/login').send({ email, password }).expect(200);
  return { token: res.body.token as string, user: res.body.user as { id: string }, password };
}
