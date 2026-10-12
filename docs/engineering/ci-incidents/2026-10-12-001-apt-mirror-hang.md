# LibreOffice install hung for 12 minutes, so the integration job was cancelled before any test ran

| Field | Value |
| --- | --- |
| ID | 2026-10-12-001 |
| Date | 2026-10-12 |
| Check (job) | Integration tests on PostgreSQL 16 and S3 (MinIO) |
| Step | Install LibreOffice Writer (`apt-get update` / `apt-get install libreoffice-writer-nogui`) |
| Run | [CI #21](https://github.com/BhaskarNagireddy/PapperDash/actions/runs/38232564664), job 114755325134 |
| Commit | f14d178 (PR #7, step 1 backend hardening) |
| Category | infrastructure, cancelled |
| Status | fixed |

## What was seen
- The job ended with `##[error]The operation was canceled.`
- On the PR, the check showed as cancelled while the other five checks in the same run had passed.

## Timeline (UTC, from the job log)

| Time | Event |
| --- | --- |
| 09:51:21 | Job starts. PostgreSQL 16 service healthy at 09:51:44, MinIO started at 09:51:47. |
| 09:51:57 | Step "Install LibreOffice Writer" starts `sudo apt-get update -qq`. |
| 09:51:57 – 10:04:05 | **No output for 12 minutes.** `-qq` hides apt's progress, and plain apt-get waits indefinitely on a stalled download. |
| 10:02:44 | A newer commit (2a187c4) is pushed to the PR branch. The workflow's `concurrency: cancel-in-progress` setting cancels older runs of the same branch. |
| 10:04:05 | The hung step is cancelled ("The operation was canceled"). The following steps (pnpm install, the integration tests) are skipped. |
| 10:04:12 – 10:05:59 | CI #23 on the newest commit runs all 6 checks, including this job (1 min 22 s), and **all pass**. |

## Root cause
- **Proven by the log:** the job never reached the tests. It stalled inside the package install from Ubuntu's mirror. The same step took about 20 seconds on the runs before and after.
- **Proven by the log:** the stall was ended by cancellation, not by a test or timeout failure. Cancellation followed a newer push to the branch, which the `cancel-in-progress` concurrency setting does by design, so only the newest commit's results count.
- **Inferred:** the mirror or the runner's network stalled mid-download. apt's default settings give no per-request timeout that fires quickly, so it kept waiting, and `-qq` hid the progress that would have shown which file it was stuck on.

**This was not a test failure.** No code or test in PR #7 caused it, and the same tests passed on PostgreSQL 16 in CI #23.

## Modules affected
- **Affected:** only the CI job "Integration tests on PostgreSQL 16 and S3 (MinIO)", which was cancelled. The job "Unit and integration tests with coverage" runs the same install step, so it was equally exposed.
- **Not affected:** application code (identity, documents, orders, payments, platform), the database migrations, and the other four checks.

## Fix
- **New script `.github/scripts/install-libreoffice.sh`,** used by both jobs that need LibreOffice:
  - every network read times out after 30 s, and apt retries each file 3 times;
  - `apt-get update` is limited to 90 s and `apt-get install` to 180 s per attempt;
  - the whole install is retried up to 3 times, with a pause between attempts;
  - progress is printed (`-q` instead of `-qq`), so the log shows where a stall happens;
  - if all attempts fail, the step ends with a clear error saying this is an infrastructure failure, not a test failure.
- **New step limit:** `timeout-minutes: 15` on the install step itself, so it can never use up the job's time.
- **Job limits:** the two jobs with this step now allow 25 minutes (up from 15), leaving room for the retries plus the tests.

## Prevention
- A stalled mirror now costs at most a few minutes, and the log shows the attempt number, where it stalled, and the reason.
- Cancelled runs are expected when new commits are pushed. Only the newest commit's run decides whether a PR can merge.
- **Before re-running a cancelled job:** open its log and check which step was running. If it is an install step, it is this incident type, and a re-run is the right action.

## How it was verified
- **Locally:** the script installed LibreOffice and printed `LibreOffice 24.2.7.2` in 22 s. The workflow file parses as valid YAML.
- **CI:** the next push runs both affected jobs through the new script. The result is recorded on PR #7.

## Follow-up: the fix worked in CI the same day
- **[CI #25](https://github.com/BhaskarNagireddy/PapperDash/actions/runs/38236161557)** (commit 69aa07a), job "Integration tests on PostgreSQL 16 and S3 (MinIO)":

  | Attempt | Time (UTC) | Result |
  | --- | --- | --- |
  | 1 | 10:25:23 – 10:28:54 | `::warning::LibreOffice install attempt 1 failed or timed out` |
  | 2 | 10:29:04 – 10:32:26 | `::warning::LibreOffice install attempt 2 failed or timed out` |
  | 3 | 10:32:46 – 10:32:59 | Succeeded in 13 s |

  All 96 integration tests then passed. Without the retry, this run would have hung like CI #21.
- **The mirror stalled in 2 of the 4 runs on 2026-10-12,** so it is unreliable often enough to matter.
- **If it keeps happening:** cache the downloaded `.deb` files with `actions/cache`, keyed on the package version, so most runs never contact the mirror. The retry stays as the fallback.
