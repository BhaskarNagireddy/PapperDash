import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createPool } from '../src/platform/pool.js';

const url = process.env.TEST_DATABASE_URL;

// Runs against real PostgreSQL only (CI job "Integration tests on PostgreSQL 16"); PGlite has no server to restart.
describe.skipIf(!url)('database pool on real PostgreSQL', () => {
  it('keeps working after the server terminates its idle connection, as in a failover', async () => {
    const messages: string[] = [];
    const pool = createPool({ connectionString: url, max: 2, application_name: 'pd-pool-test' }, (m) => messages.push(m));
    try {
      await pool.query('select 1'); // leaves one idle connection in the pool
      const admin = new pg.Client({ connectionString: url });
      await admin.connect();
      await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'pd-pool-test'`);
      await admin.end();
      await expect.poll(() => messages.length).toBeGreaterThan(0);
      expect(messages[0]).toContain('57P01');
      const { rows } = await pool.query('select 1 as ok');
      expect(rows[0].ok).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
