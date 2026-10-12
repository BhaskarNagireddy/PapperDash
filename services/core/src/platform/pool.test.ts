import { describe, expect, it, vi } from 'vitest';
import { createPool } from './pool.js';

describe('createPool', () => {
  it('logs a connection the server closed instead of crashing the process', async () => {
    const log = vi.fn();
    const pool = createPool({ connectionString: 'postgres://unused@127.0.0.1:1/none' }, log);
    // This is what node-postgres does when an idle connection is terminated (e.g. during a failover).
    // A pool without a listener would throw here, which in production is an uncaught exception.
    const terminated = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' });
    expect(() => pool.emit('error', terminated)).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('57P01'));
    await pool.end();
  });

  it('shows why the handler is needed: a bare pool throws on the same event', () => {
    const bare = createPool({ connectionString: 'postgres://unused@127.0.0.1:1/none' }, () => undefined);
    bare.removeAllListeners('error');
    expect(() => bare.emit('error', new Error('terminating connection due to administrator command'))).toThrow(/administrator command/);
    return bare.end();
  });
});
