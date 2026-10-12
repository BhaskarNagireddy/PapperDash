import { HttpException, HttpStatus, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { Clock } from './clock.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DB, type Db } from './database.js';
import { Leases } from './leases.js';
import { PeriodicJob } from './periodic.js';
import { rateLimits } from './platform.schema.js';

export interface Limit {
  /** Most requests allowed per window. */
  max: number;
  windowMs: number;
}

export class RateLimitedException extends HttpException {
  constructor(message: string, readonly retryAfterSec: number) {
    super({ error: 'rate_limited', message, retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Fixed-window counters in PostgreSQL, so every server instance shares the same limits (an in-memory
 * counter would let each instance allow the full amount). One atomic upsert per request.
 */
@Injectable()
export class RateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RateLimiter.name);
  private readonly pruning = new PeriodicJob('Rate limit prune', this.log);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly leases: Leases,
  ) {}

  onModuleInit() {
    // Windows are at most an hour long; anything older than a day is dead weight.
    const dayAgo = () => new Date(this.clock.now().getTime() - 24 * 60 * 60 * 1000);
    this.pruning.start(this.config.expirySweepMs, () => this.leases.runExclusive('rate-limit-prune', this.config.expirySweepMs, () => this.prune(dayAgo())));
  }

  onModuleDestroy() {
    return this.pruning.stop();
  }

  /** Counts one request; returns whether it is within the limit and when the window resets. */
  async hit(key: string, limit: Limit): Promise<{ allowed: boolean; count: number; retryAfterSec: number }> {
    const { start, retryAfterSec } = this.window(limit);
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key, windowStart: start, count: 1 })
      .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    return { allowed: row!.count <= limit.max, count: row!.count, retryAfterSec };
  }

  /** Counts the request and throws 429 Too Many Requests over the limit. */
  async enforce(key: string, limit: Limit, message: string): Promise<void> {
    const r = await this.hit(key, limit);
    if (!r.allowed) throw new RateLimitedException(message, r.retryAfterSec);
  }

  /** Requests counted so far in the current window, without counting a new one. */
  async current(key: string, limit: Limit): Promise<{ count: number; retryAfterSec: number }> {
    const { start, retryAfterSec } = this.window(limit);
    const [row] = await this.db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), gte(rateLimits.windowStart, start)));
    return { count: row?.count ?? 0, retryAfterSec };
  }

  async reset(key: string): Promise<void> {
    await this.db.delete(rateLimits).where(eq(rateLimits.key, key));
  }

  /** Removes finished windows; called by the maintenance job. */
  async prune(olderThan: Date): Promise<void> {
    await this.db.delete(rateLimits).where(lt(rateLimits.windowStart, olderThan));
  }

  private window(limit: Limit) {
    const now = this.clock.now().getTime();
    const start = Math.floor(now / limit.windowMs) * limit.windowMs;
    return { start: new Date(start), retryAfterSec: Math.max(1, Math.ceil((start + limit.windowMs - now) / 1000)) };
  }
}
