import { describe, expect, it, vi } from 'vitest';
import { PeriodicJob } from './periodic.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('PeriodicJob', () => {
  it('logs a failed run instead of leaving an unhandled rejection that would crash the process', async () => {
    const log = { error: vi.fn() };
    const job = new PeriodicJob('Outbox relay', log);
    await job.runOnce(() => Promise.reject(new Error('Cannot use a pool after calling end on the pool')));
    expect(log.error).toHaveBeenCalledWith('Outbox relay failed', expect.stringContaining('Cannot use a pool'));
  });

  it('never runs two copies of the job at once', async () => {
    const gate = deferred();
    let runs = 0;
    const job = new PeriodicJob('j', { error: vi.fn() });
    const work = () => {
      runs++;
      return gate.promise;
    };
    const first = job.runOnce(work);
    const second = job.runOnce(work);
    expect(runs).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
    await job.runOnce(work);
    expect(runs).toBe(2);
  });

  it('stop() waits for the run in progress, so shutdown cannot close the database under it', async () => {
    vi.useFakeTimers();
    try {
      const gate = deferred();
      let finished = false;
      const job = new PeriodicJob('j', { error: vi.fn() });
      job.start(10, async () => {
        await gate.promise;
        finished = true;
      });
      vi.advanceTimersByTime(10); // a run starts and is now waiting on the database
      let stopped = false;
      const stopping = job.stop().then(() => (stopped = true));
      await Promise.resolve();
      expect(stopped).toBe(false);
      gate.resolve();
      await stopping;
      expect(finished).toBe(true);
      vi.advanceTimersByTime(100); // no runs after stop
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays off when the interval is 0', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => undefined);
      const job = new PeriodicJob('j', { error: vi.fn() });
      job.start(0, run);
      vi.advanceTimersByTime(1000);
      expect(run).not.toHaveBeenCalled();
      await job.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
