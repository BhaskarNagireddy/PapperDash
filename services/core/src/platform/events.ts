import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DomainEvent } from '@papperdash/contracts';
import { and, asc, isNull, lt, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from './config.js';
import { Clock } from './clock.js';
import { DB, type Db, type DbOrTx, type Tx } from './database.js';
import { newId } from './ids.js';
import { outbox, processedEvents } from './platform.schema.js';

type NewEvent<E extends DomainEvent> = Omit<E, 'id' | 'occurredAt'>;

/** Appends events to the outbox. Call inside the transaction that makes the change. */
@Injectable()
export class Outbox {
  constructor(private readonly clock: Clock) {}

  async append<E extends DomainEvent>(tx: DbOrTx, ...events: NewEvent<E>[]): Promise<void> {
    if (!events.length) return;
    const occurredAt = this.clock.now();
    await tx.insert(outbox).values(
      events.map((e) => ({
        id: newId('evt'),
        type: e.type,
        version: e.version,
        aggregateId: e.aggregateId,
        payload: e.payload,
        occurredAt,
      })),
    );
  }
}

type Handler = (event: DomainEvent, tx: Tx) => Promise<void>;
interface Subscription {
  consumer: string;
  handler: Handler;
}

const MAX_ATTEMPTS = 10;

/**
 * Delivers outbox events to subscribers, at least once, in order.
 * Each subscriber runs in its own transaction together with its processed-event marker,
 * so a handler never runs twice for the same event and a failing handler does not block others.
 * Transport is in-process today; moving to SQS/EventBridge replaces only this class.
 */
@Injectable()
export class EventBus implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventBus.name);
  private readonly subs = new Map<string, Subscription[]>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** `consumer` must be stable and unique per handler, e.g. "notifications.order-ready". */
  subscribe<E extends DomainEvent>(type: E['type'], consumer: string, handler: (event: E, tx: Tx) => Promise<void>) {
    const list = this.subs.get(type) ?? [];
    if (list.some((s) => s.consumer === consumer)) throw new Error(`Duplicate consumer ${consumer} for ${type}`);
    list.push({ consumer, handler: handler as Handler });
    this.subs.set(type, list);
  }

  onModuleInit() {
    if (this.config.outboxPollMs > 0) this.timer = setInterval(() => void this.flush(), this.config.outboxPollMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publishes pending events. Returns how many were published. */
  async flush(batchSize = 100): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows = await this.db
        .select()
        .from(outbox)
        .where(and(isNull(outbox.publishedAt), lt(outbox.attempts, MAX_ATTEMPTS)))
        .orderBy(asc(outbox.id))
        .limit(batchSize);
      let published = 0;
      for (const row of rows) {
        const event: DomainEvent = {
          id: row.id,
          type: row.type,
          version: row.version,
          aggregateId: row.aggregateId,
          occurredAt: row.occurredAt.toISOString(),
          payload: row.payload,
        };
        const failures: string[] = [];
        for (const sub of this.subs.get(row.type) ?? []) {
          try {
            await this.db.transaction(async (tx) => {
              const inserted = await tx
                .insert(processedEvents)
                .values({ consumer: sub.consumer, eventId: row.id })
                .onConflictDoNothing()
                .returning();
              if (inserted.length) await sub.handler(event, tx);
            });
          } catch (err) {
            failures.push(`${sub.consumer}: ${(err as Error).message}`);
            this.log.error(`Consumer ${sub.consumer} failed on ${row.type} ${row.id}`, err as Error);
          }
        }
        await this.db
          .update(outbox)
          .set(
            failures.length
              ? { attempts: sql`${outbox.attempts} + 1`, lastError: failures.join('; ').slice(0, 2000) }
              : { publishedAt: this.clock.now(), attempts: sql`${outbox.attempts} + 1`, lastError: null },
          )
          .where(sql`${outbox.id} = ${row.id}`);
        if (!failures.length) published++;
        else break; // keep per-aggregate ordering: retry this event before moving on
      }
      return published;
    } finally {
      this.running = false;
    }
  }
}
