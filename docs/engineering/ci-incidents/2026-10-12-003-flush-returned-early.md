# `flush()` returned before events were handled while the timer was flushing

| Field | Value |
| --- | --- |
| ID | 2026-10-12-003 |
| Date | 2026-10-12 |
| Check (job) | Found locally while verifying 2026-10-12-002 (same suite as the CI job "Integration tests on PostgreSQL 16 and S3 (MinIO)") |
| Step | `vitest run` with `TEST_DATABASE_URL` (PostgreSQL 16) |
| Run | local, 1 failure in 5 full runs |
| Commit | uncommitted work on top of 368c769 |
| Category | test-bug, flaky. The code was correct for production, but `flush()` didn't do what its callers assumed |
| Status | fixed |

## What was seen
```
FAIL test/hardening.e2e.test.ts > background jobs on their production timers > relays events, ...
Error: Document not ready: {"status":"processing", ...}
 ❯ readyDocument test/harness.ts:204
```
Seen once in 5 full runs. It passed every time when run on its own.

## Root cause
- **What happened:**
  1. That test runs the outbox relay on a 20 ms timer.
  2. `EventBus.flush()` had a guard: *if a flush is already running, return 0 at once*.
  3. The test helper `h.flush()` loops `while (await bus.flush() > 0)`. When the timer's flush happened to be running, `h.flush()` got 0 at once and assumed everything was handled.
  4. The upload helper then read the document while its processing was still under way.
- **Why it was rare:** it needs the timer's flush to be running at the moment the helper asks. The window is wider when the whole suite runs in parallel and the machine is busy.

## Modules affected
- **`platform/events.ts`:** the meaning of `flush()`.
- **Test helpers** that call it (`h.flush()`, `upload`, `readyDocument`).
- **Production:** no data was affected. The timer would have handled the event on its next tick.

## Fix
- **`EventBus.flush()` now queues behind a running flush** instead of skipping. Flushes run one after another and never interleave. When `flush()` resolves, every event written before the call has been handled.
- **The separate `running` flag is gone.** Overlap protection now comes from the queue (in-process) and the relay lease (across instances).

## Prevention
- `flush()` now has a single meaning, and its documentation says so.
- The production-timer test exercises exactly this overlap on every run.

## How it was verified
- **Locally, after the fix:** 8 full runs in a row against PostgreSQL 16, each with 122 tests passing, no failures, no unhandled errors. The coverage run also passed.

## Follow-up: also reproduced in CI
- **A manual re-run of [CI #24, attempt 2](https://github.com/BhaskarNagireddy/PapperDash/actions/runs/38234913674)** on the old commit 368c769, which has neither fix, failed at 10:47 UTC with the same error:
  ```
  FAIL test/hardening.e2e.test.ts > background jobs on their production timers > relays events, ...
  Error: Document not ready: {..."status":"processing"...}
  Tests  1 failed | 94 passed (95)
  ```
- **So the bug is not specific to one machine.** It shows up on GitHub's runners too, and a re-run of an old commit can still fail on it.
- **The fix is in 69aa07a.** The PR head, 929d25f, passed all 6 checks.
- **Rule:** when re-running a failed job, check that its commit is the PR's latest. Re-running an old commit only re-tests code that has already been replaced.

## Stress comparison: old code against fixed code
Because the bug depends on timing, both commits were run under the same deliberate load: `test/hardening.e2e.test.ts` 20 times against PostgreSQL 16, with 4 busy processes keeping all 4 CPU cores at 100 %, so the background timers and the test compete for CPU.

| Commit | Passed | Failed | Errors seen |
| --- | --- | --- | --- |
| 368c769 (before the fixes) | 6 | **14** | `Document not ready` (10×, this incident) and `Cannot use a pool after calling end` (4×, incident 002) |
| 531f4ea (with the fixes) | **20** | 0 | none |

CI cannot be re-run from the assistant's session (GitHub API 403), so this local comparison stands in for repeated CI runs.
