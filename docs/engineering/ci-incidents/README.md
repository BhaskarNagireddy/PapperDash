# CI incident log

Every time a check fails, is cancelled, or passes on one run and fails on another, it gets one file here. Over time this log shows which failures repeat, what caused them, which modules they touch, and whether a fix actually worked.

## When to add an entry
- A required check is red or cancelled on a pull request or on `main`, and the cause is not simply a mistake in that PR's own code that was fixed in the next commit.
- A check that passed before fails on a re-run of the same commit (flaky behaviour).
- A check failed because of something outside the code: a package mirror, a GitHub outage, a Docker registry, or a runner.

## How to add one
1. Copy the template below into `YYYY-MM-DD-NNN-short-name.md`, where `NNN` counts up within the day.
2. Fill in every section. Write "unknown" rather than leaving a section out.
3. Add a row to the index at the bottom of this file.
4. Commit it in the same pull request as the fix. If no fix is needed, commit it on its own.

Before re-running a failed job, check that its commit is the PR's latest. On the PR page, compare the run's commit with the last commit listed. A re-run of an older commit only re-tests code that has already been replaced.

## Categories

| Category | Meaning | Typical action |
| --- | --- | --- |
| `test-failure` | A test found a real bug in the code | Fix the code; add or keep the test |
| `test-bug` | The test itself was wrong (bad timing, order dependence, wrong assumption) | Fix the test so it is deterministic |
| `flaky` | Same commit, different result, cause not yet proven | Investigate; never skip or disable the test |
| `infrastructure` | Outside our code: package mirrors, registries, GitHub, runners | Make the step retry and fail fast; re-run |
| `cancelled` | The run was stopped, by a newer push, a person, or a timeout | Find what it was doing when stopped |
| `config` | Workflow, secrets or settings were wrong | Fix the workflow or settings |

## Template

```markdown
# <short title>

| Field | Value |
| --- | --- |
| ID | YYYY-MM-DD-NNN |
| Date | YYYY-MM-DD |
| Check (job) | e.g. Integration tests on PostgreSQL 16 and S3 (MinIO) |
| Step | e.g. Install LibreOffice Writer |
| Run | link to the Actions run |
| Commit | sha |
| Category | test-failure / test-bug / flaky / infrastructure / cancelled / config |
| Status | open / fixed / monitoring |

## What was seen
The exact error message and what the run looked like.

## Timeline
Times (UTC) of what happened, from the job log.

## Root cause
Why it happened. Separate what the log proves from what is inferred.

## Modules affected
Which code, tests, checks or users were affected, and which were not.

## Fix
What changed, in which file and commit, and why that fixes the cause.

## Prevention
What stops it from happening again, or makes it fail fast and clearly next time.

## How it was verified
Commands run and results, locally and in CI.
```

## Index

| ID | Date | Check | Category | Summary | Status |
| --- | --- | --- | --- | --- | --- |
| [2026-10-12-001](2026-10-12-001-apt-mirror-hang.md) | 2026-10-12 | Integration tests on PostgreSQL 16 and S3 (MinIO) | infrastructure, cancelled | LibreOffice install hung on the Ubuntu mirror for 12 min; no test ran; cancelled by a newer push | fixed |
| [2026-10-12-002](2026-10-12-002-shutdown-race-unhandled-rejection.md) | 2026-10-12 | Integration tests on PostgreSQL 16 and S3 (MinIO) | test-failure (real bug) | A timer-started relay flush kept querying after shutdown closed the pool; unhandled rejection that would crash production. Fixed with `PeriodicJob` | fixed |
| [2026-10-12-003](2026-10-12-003-flush-returned-early.md) | 2026-10-12 | (local) PostgreSQL 16 suite | test-bug, flaky | `flush()` returned 0 while the timer was flushing, so a test read a document before it was processed. Flushes now queue | fixed |
