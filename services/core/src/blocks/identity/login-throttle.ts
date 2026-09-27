import { Injectable } from '@nestjs/common';
import { Clock } from '../../platform/clock.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/**
 * Locks an email + IP pair out after repeated failed logins.
 * In-memory per instance; moves to Redis when core runs on more than one instance.
 */
@Injectable()
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly clock: Clock) {}

  isLocked(key: string): boolean {
    return this.recent(key).length >= MAX_FAILURES;
  }

  recordFailure(key: string) {
    this.failures.set(key, [...this.recent(key), this.clock.now().getTime()]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }

  private recent(key: string) {
    const cutoff = this.clock.now().getTime() - WINDOW_MS;
    return (this.failures.get(key) ?? []).filter((t) => t > cutoff);
  }
}
