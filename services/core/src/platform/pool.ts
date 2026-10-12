import pg from 'pg';

/**
 * A PostgreSQL connection pool that survives the server closing idle connections.
 *
 * When PostgreSQL ends a connection the pool is holding idle (a restart, an RDS failover, an administrator,
 * or dropping a test database), node-postgres emits 'error' on the pool. Without a listener Node treats that
 * as an uncaught exception and the process exits (CI incident 2026-10-12-006). The pool has already
 * discarded the dead connection and opens a fresh one for the next query, so logging is all that is needed.
 */
export function createPool(config: pg.PoolConfig, log: (message: string) => void = (m) => console.error(m)): pg.Pool {
  const pool = new pg.Pool(config);
  pool.on('error', (err: Error & { code?: string }) => {
    log(`Database connection lost (${err.code ?? 'no code'}: ${err.message}); the pool will reconnect on the next query`);
  });
  return pool;
}
