import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { DomainEvent } from '@papperdash/contracts';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from './config.js';
import { Clock } from './clock.js';
import { DB, type Db, type DbOrTx, type Tx } from './database.js';
import { newId } from './ids.js';
import { Leases } from './leases.js';
import { PeriodicJob } from './periodic.js';
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
  transactional: boolean;
}

export interface SubscribeOptions {
  /**
   * true (default): the handler runs inside the transaction that records it as done, so it runs exactly once.
   * Use for handlers that only write to their own tables through `tx`.
   * false: the handler runs on its own (e.g. it calls another block that opens its own transaction, or an
   * external API) and is recorded as done afterwards. It may run again after a crash, so it must be idempotent.
   */
  transactional?: boolean;
}

const MAX_ATTEMPTS = 10;
const RELAY_LEASE = 'outbox-relay';
/** Long enough for any single handler; if the holder dies, another instance takes over after this. */
const RELAY_LEASE_MS = 60_000;

/**
 * Delivers outbox events to subscribers, at least once, in order.
 * Each subscriber runs in its own transaction together with its processed-event marker,
 * so a handler never runs twice for the same event and a failing handler does not block others.
 * Only the instance holding the relay lease delivers, so running several instances never processes an
 * event twice at the same time (which could, for example, refund a payment twice).
 * Transport is in-process today; moving to SQS/EventBridge replaces only this class.
 */
@Injectable()
export class EventBus implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventBus.name);
  private readonly subs = new Map<string, Subscription[]>();
  private readonly relay = new PeriodicJob('Outbox relay', this.log);
  /** Flushes run one after another, never interleaved, so two never deliver the same row twice at once. */
  private flushing: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly leases: Leases,
  ) {}

  /** `consumer` must be stable and unique per handler, e.g. "notifications.order-ready". */
  subscribe<E extends DomainEvent>(type: E['type'], consumer: string, handler: (event: E, tx: Tx) => Promise<void>, opts: SubscribeOptions = {}) {
    const list = this.subs.get(type) ?? [];
    if (list.some((s) => s.consumer === consumer)) throw new Error(`Duplicate consumer ${consumer} for ${type}`);
    list.push({ consumer, handler: handler as Handler, transactional: opts.transactional ?? true });
    this.subs.set(type, list);
  }

  onModuleInit() {
    this.relay.start(this.config.outboxPollMs, () => this.flush());
  }

  async onModuleDestroy() {
    await this.relay.stop();
    if (this.config.outboxPollMs > 0) await this.leases.release(RELAY_LEASE).catch(() => undefined);
  }

  /**
   * Publishes pending events. Returns how many were published (0 when another instance holds the relay).
   * If a flush is already running (e.g. the timer's), this one waits for it and then runs, so when it
   * resolves, every event written before the call has been handled.
   */
  flush(batchSize = 100): Promise<number> {
    const run = this.flushing.then(() => this.publishBatch(batchSize));
    this.flushing = run.catch(() => undefined);
    return run;
  }

  private async publishBatch(batchSize: number): Promise<number> {
    if (!(await this.leases.tryAcquire(RELAY_LEASE, RELAY_LEASE_MS))) return 0;
    const rows = await this.db
      .select()
      .from(outbox)
      .where(and(isNull(outbox.publishedAt), lt(outbox.attempts, MAX_ATTEMPTS)))
      .orderBy(asc(outbox.id))
      .limit(batchSize);
    let published = 0;
    // Events of one aggregate stay in order: after a failure, that aggregate's later events wait for the retry.
    // Other aggregates carry on, so one failing event never blocks unrelated work.
    const blocked = new Set<string>();
    for (const [i, row] of rows.entries()) {
      if (blocked.has(row.aggregateId)) continue;
      // Renew before each event; stop if another instance took over while a slow handler ran.
      if (i > 0 && !(await this.leases.tryAcquire(RELAY_LEASE, RELAY_LEASE_MS))) break;
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
          if (sub.transactional) {
            await this.db.transaction(async (tx) => {
              const inserted = await tx
                .insert(processedEvents)
                .values({ consumer: sub.consumer, eventId: row.id })
                .onConflictDoNothing()
                .returning();
              if (inserted.length) await sub.handler(event, tx);
            });
          } else {
            const [done] = await this.db
              .select()
              .from(processedEvents)
              .where(and(eq(processedEvents.consumer, sub.consumer), eq(processedEvents.eventId, row.id)));
            if (!done) {
              await sub.handler(event, this.db as unknown as Tx);
              await this.db.insert(processedEvents).values({ consumer: sub.consumer, eventId: row.id }).onConflictDoNothing();
            }
          }
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
      if (failures.length) blocked.add(row.aggregateId);
      else published++;
    }
    return published;
  }
}
