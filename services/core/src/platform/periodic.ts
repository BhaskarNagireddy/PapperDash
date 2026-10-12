import type { LoggerService } from '@nestjs/common';

/**
 * Runs a background job on an interval, safely:
 * - never two runs of the same job at once in this process;
 * - a failed run is logged, never an unhandled rejection (which would crash the process);
 * - stop() waits for a run in progress, so shutdown never closes the database under a running job.
 */
export class PeriodicJob {
  private timer?: NodeJS.Timeout;
  private current?: Promise<void>;

  constructor(
    private readonly name: string,
    private readonly log: Pick<LoggerService, 'error'>,
  ) {}

  /** Starts running `job` every `intervalMs`; 0 or less leaves the job off. */
  start(intervalMs: number, job: () => Promise<unknown>): void {
    if (intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => void this.runOnce(job), intervalMs);
  }

  /** Runs the job now unless a run is already in progress. Never throws. */
  runOnce(job: () => Promise<unknown>): Promise<void> {
    if (!this.current) {
      this.current = job()
        .then(
          () => undefined,
          (err: unknown) => this.log.error(`${this.name} failed`, err instanceof Error ? err.stack : String(err)),
        )
        .finally(() => {
          this.current = undefined;
        });
    }
    return this.current;
  }

  /** Stops the interval and waits for a run in progress to finish. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.current;
  }
}
