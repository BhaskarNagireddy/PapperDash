import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import { configureApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { InMemoryObjectStorage, ObjectStorage } from '../src/blocks/documents/index.js';
import { OAuthVerifier } from '../src/blocks/identity/index.js';
import { EventBus } from '../src/platform/events.js';
import { pdfWithPages } from './fixtures.js';
import { Clock } from '../src/platform/clock.js';
import type { Db } from '../src/platform/database.js';
import type { EmailMessage, EmailProvider } from '@papperdash/contracts';
import type { LoggerService } from '@nestjs/common';

/** Records emails without logging them, like the production SES adapter (tests read links from `sent`). */
export class RecordingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

/** Collects everything the app logs, so tests can prove secrets never reach the logs. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private add = (...args: unknown[]) => void this.lines.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  log = this.add;
  error = this.add;
  warn = this.add;
  debug = this.add;
  verbose = this.add;
  fatal = this.add;
}

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
  email: RecordingEmailProvider;
  http: () => ReturnType<typeof request>;
  storage: InMemoryObjectStorage;
  /** Runs pending events (document processing, order tracking) as the background relay would. */
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * The database for one test file, migrated from scratch.
 * - Default: in-memory PGlite (no Docker needed).
 * - With TEST_DATABASE_URL (CI): a fresh database on a real PostgreSQL 16 server, dropped afterwards,
 *   so the same tests also prove the migrations and locking on the production engine.
 */
async function testDatabase(): Promise<{ db: Db; close: () => Promise<void> }> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    const pglite = new PGlite();
    await migrate(drizzle(pglite), { migrationsFolder: MIGRATIONS });
    return { db: drizzle(pglite) as unknown as Db, close: () => pglite.close() };
  }
  const name = `pd_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 10 });
  await migratePg(drizzlePg(pool), { migrationsFolder: MIGRATIONS });
  return {
    db: drizzlePg(pool) as unknown as Db,
    close: async () => {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: serverUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}

/** A full core app on a freshly migrated database. Pass `oauth` to replace the Google/Apple verifier. */
export async function startHarness(opts: { oauth?: OAuthVerifier; overrides?: Array<[unknown, unknown]>; logger?: LoggerService } = {}): Promise<Harness> {
  const database = await testDatabase();
  const db = database.db;
  const clock = new FakeClock();
  const email = new RecordingEmailProvider();
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
          stripe: null,
          email: null,
          storage: null,
          outboxPollMs: 0,
          retentionSweepMs: 0,
        },
      }),
    ],
  });
  if (opts.oauth) builder = builder.overrideProvider(OAuthVerifier).useValue(opts.oauth);
  for (const [token, value] of opts.overrides ?? []) builder = builder.overrideProvider(token as never).useValue(value);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ logger: opts.logger ?? false, rawBody: true }));
  // Listen once; letting supertest start and stop the server per request races and refuses connections.
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const bus = app.get(EventBus);
  return {
    app,
    db,
    clock,
    email,
    http: () => request(url),
    storage: app.get(ObjectStorage) as InMemoryObjectStorage,
    flush: async () => {
      while ((await bus.flush()) > 0);
    },
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export function lastToken(email: RecordingEmailProvider, to: string): string {
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

/** Uploads a file through the real API (the in-memory store stands in for S3) and processes it. */
export async function upload(h: Harness, token: string, file: Buffer, fileName = 'notes.pdf', contentType = 'application/pdf') {
  const created = await h.http().post('/v1/documents').set('Authorization', `Bearer ${token}`).send({ fileName, contentType, sizeBytes: file.length }).expect(201);
  await h.storage.put(created.body.upload.fields.key, file, contentType);
  await h.http().post(`/v1/documents/${created.body.document.id}/complete`).set('Authorization', `Bearer ${token}`).expect(200);
  await h.flush();
  const doc = await h.http().get(`/v1/documents/${created.body.document.id}`).set('Authorization', `Bearer ${token}`).expect(200);
  return doc.body as { id: string; status: string; pageCount: number | null; rejection: { reason: string; message: string } | null; deleteAfter: string | null };
}

/** A processed, ready PDF of `pages` pages owned by the token's user. */
export async function readyDocument(h: Harness, token: string, pages = 3): Promise<string> {
  const doc = await upload(h, token, await pdfWithPages(pages));
  if (doc.status !== 'ready') throw new Error(`Document not ready: ${JSON.stringify(doc)}`);
  return doc.id;
}
