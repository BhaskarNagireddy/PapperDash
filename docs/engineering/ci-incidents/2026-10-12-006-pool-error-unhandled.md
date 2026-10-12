# A database connection closed by the server crashed the process (no pool error handler)

| Field | Value |
| --- | --- |
| ID | 2026-10-12-006 |
| Date | 2026-10-12 |
| Check (job) | Integration tests on PostgreSQL 16 and S3 (MinIO) |
| Step | Integration tests against PostgreSQL 16 and MinIO |
| Run | CI #35 on `main`, push of 34e201a (PR #8 merge), job 114843924499 |
| Commit | 34e201a |
| Category | test-failure: a real production bug |
| Status | fixed |

## What was seen
All 97 integration tests passed, but Vitest failed the run on one unhandled error:
```
error: terminating connection due to administrator command
 ❯ parseErrorMessage  pg-protocol/dist/parser.js:306
Serialized Error: { severity: 'FATAL', code: '57P01', ... }
This error originated in "test/hardening.e2e.test.ts" ... last test: "waits for running background jobs before the database closes"
```
The same run showed incident 005 fixed. The LibreOffice cache was saved by the tests job and restored by this job, which installed "from 49 cached packages (no package mirror needed)" in 11 s.

## Root cause
- **Proven by reproduction (script, then a test):**
  1. A pool from `pg.Pool` holds a connection idle.
  2. The server terminates that connection (`pg_terminate_backend`, the same `57P01` that a restart, an RDS failover or `DROP DATABASE … WITH (FORCE)` sends).
  3. node-postgres emits `'error'` on the pool.
  4. No listener was attached, so Node raised it as an **uncaught exception**. The script's `uncaughtException` hook confirmed this: in production the process exits.
  5. With a listener, the error is logged, and the next query on the same pool succeeds over a fresh connection.
- **Inferred, for the CI trigger:** the test harness drops each PostgreSQL test database `WITH (FORCE)`. In the shutdown test, which opens and closes 5 apps quickly, a connection was evidently still open when its database was dropped. It did not reproduce in 15 local runs under CPU load, so the exact window is narrow. The missing listener is proven independently of it.

## Modules affected
- **`src/main.ts`** (the server): any database restart or failover could crash every server instance at once. This was the production impact.
- **`src/migrate.ts`** (the deploy-time migration task): the same, during a deploy.
- **`test/harness.ts`:** the test database cleanup could surface the error, which is how CI found it.

## Fix
- **New `src/platform/pool.ts` (`createPool`):** creates the pool and attaches an `'error'` listener that logs `Database connection lost (57P01: …); the pool will reconnect on the next query`. It replaces `new pg.Pool` in `main.ts`, `migrate.ts` and the harness, so no pool can be created without it.

## Prevention
- **Unit tests** (`src/platform/pool.test.ts`):
  - the pool logs the event instead of throwing;
  - a bare pool does throw, which documents why the listener is needed.
- **Integration test on real PostgreSQL** (`test/pool.pg.integration.test.ts`): terminates the pool's idle connection with `pg_terminate_backend`, then checks the error was logged and the next query works.
- **Rule:** create PostgreSQL pools only through `createPool`.

## How it was verified
- **The reproduction script:** without the listener it printed `UNCAUGHT (process would crash): 57P01`; with it, `pool error handled: 57P01` and `pool still works afterwards: true`.
- **Locally:** lint, typecheck and build pass. 125 tests pass on PGlite with coverage minimums met, and 126 on PostgreSQL 16, with no unhandled errors.
