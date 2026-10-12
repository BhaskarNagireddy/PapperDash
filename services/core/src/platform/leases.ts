import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, or } from 'drizzle-orm';
import { Clock } from './clock.js';
import { DB, type Db } from './database.js';
import { newId } from './ids.js';
import { leases } from './platform.schema.js';

/**
 * Makes background jobs safe to run on several server instances at once: only the instance holding a
 * job's lease runs it. Acquiring and renewing are the same atomic statement, so two instances can never
 * both believe they hold it.
 */
@Injectable()
export class Leases {
  /** This process's identity as a lease holder. */
  readonly holder = newId('inst');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Takes or renews the lease; true if this instance now holds it until `ttlMs` from now. */
  async tryAcquire(name: string, ttlMs: number): Promise<boolean> {
    const now = this.clock.now();
    const rows = await this.db
      .insert(leases)
      .values({ name, holder: this.holder, expiresAt: new Date(now.getTime() + ttlMs) })
      .onConflictDoUpdate({
        target: leases.name,
        set: { holder: this.holder, expiresAt: new Date(now.getTime() + ttlMs) },
        // Only take it over when it has expired, or renew it when it is already ours.
        setWhere: or(lt(leases.expiresAt, now), eq(leases.holder, this.holder)),
      })
      .returning({ holder: leases.holder });
    return rows.length === 1;
  }

  /** Runs `job` only if this instance holds (or can take) the lease; returns undefined when another instance does. */
  async runExclusive<T>(name: string, ttlMs: number, job: () => Promise<T>): Promise<T | undefined> {
    if (!(await this.tryAcquire(name, ttlMs))) return undefined;
    return job();
  }

  /** Gives the lease up early, e.g. on shutdown, so another instance can continue at once. */
  async release(name: string): Promise<void> {
    await this.db.delete(leases).where(and(eq(leases.name, name), eq(leases.holder, this.holder)));
  }
}
