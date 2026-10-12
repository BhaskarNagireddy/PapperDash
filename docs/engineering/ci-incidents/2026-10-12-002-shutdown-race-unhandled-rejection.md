# A background job kept querying after shutdown closed the database, which is an unhandled rejection

| Field | Value |
| --- | --- |
| ID | 2026-10-12-002 |
| Date | 2026-10-12 |
| Check (job) | Integration tests on PostgreSQL 16 and S3 (MinIO) |
| Step | Integration tests against PostgreSQL 16 and MinIO |
| Run | [CI #24](https://github.com/BhaskarNagireddy/PapperDash/actions/runs/38234913674), job 114763098371 |
| Commit | 368c769 (PR #7) |
| Category | test-failure: it found a real bug in the step-1 code |
| Status | fixed |

## What was seen
All 95 integration tests passed, but Vitest failed the run on one unhandled error:

```
Unhandled Rejection
Error: Failed query: insert into "platform"."leases" ... on conflict ("name") do update ...
params: outbox-relay, inst_..., ...
 ❯ Leases.tryAcquire src/platform/leases.ts:26
 ❯ EventBus.flush src/platform/events.ts:114
Caused by: Error: Cannot use a pool after calling end on the pool
This error originated in "test/hardening.e2e.test.ts" ... last test: "relays events, expires orders,
sweeps files and prunes limits by themselves, then stops cleanly"
```

The same commit's runs before this had passed. The failure depends on timing.

## Root cause
- **Proven by reproduction:**
  1. With `outboxPollMs > 0`, a `setInterval` timer called `void this.flush()`.
  2. On shutdown, `onModuleDestroy` cleared the timer but **did not wait for a flush already in progress**.
  3. The caller then closed the database pool (`pool.end()`).
  4. The running flush's next query, the relay-lease renewal, ran on the closed pool and threw.
  5. The timer had used `void` with no `.catch`, so the error became an **unhandled promise rejection**.
- **In production this crashes the process.** Node 22 exits on unhandled rejections. The same path is taken by any database error during a timer-started flush, for example a lost connection during an RDS failover, not just at shutdown. The other step-1 timers (expiry, retention sweep, rate-limit pruning) logged their errors, but also didn't wait for a running job on shutdown.
- **Why it passed before:** the error needs a flush to be mid-batch at the exact moment of shutdown. Locally and on the earlier CI runs, the timers happened to be idle at that moment.

## Modules affected
- **`platform/events.ts` (outbox relay):** could crash the process. This is the main bug.
- **Documents retention sweep, draft expiry, checkout expiry, rate-limit pruning:** could log a spurious error, or be cut off mid-run, at shutdown.
- **Not affected:** request handling, payments correctness, stored data. Every job is idempotent and its work is retried on the next run.

## Fix
- **New `src/platform/periodic.ts` (`PeriodicJob`),** now used by every background timer. It:
  - never runs two copies of the same job at once;
  - **logs a failed run instead of rejecting**, so a database error can no longer crash the process;
  - makes `stop()` **wait for a run in progress**, so shutdown never closes the database under a running job.
- **Users:** `EventBus` (relay), `DocumentsService` (retention sweep), `OrdersService` (draft expiry), `PaymentsService` (checkout expiry) and `RateLimiter` (pruning). Each module's `onModuleDestroy` awaits `stop()`.

## Prevention
- **Unit tests** (`src/platform/periodic.test.ts`) prove three things:
  - a failing run is logged, not thrown;
  - runs never overlap;
  - `stop()` waits for the run in progress.
- **Regression test:** `test/hardening.e2e.test.ts` › "shutdown › waits for running background jobs before the database closes". It runs 5 cycles that queue events and then close the app at once.
- **New rule for future background jobs:** start every timer through `PeriodicJob`; never use a bare `setInterval(() => void ...)`.

## How it was verified
- **The regression test on the old code** (fix stashed), against PostgreSQL 16: it reproduced `Cannot use a pool after calling end on the pool` as an unhandled rejection **3 runs out of 3**.
- **The same test with the fix:** 16/16 passing, 3 runs out of 3, with no unhandled errors.
- **Full suite with the fix:** 122 tests passing with coverage minimums met, then **8 full runs in a row against PostgreSQL 16** with no failures or unhandled errors.
- **CI:** results on the next push to PR #7.
