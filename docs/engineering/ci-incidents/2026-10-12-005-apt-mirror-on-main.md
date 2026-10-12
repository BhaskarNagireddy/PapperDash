# LibreOffice install failed on `main` after the PR #7 merge: all 3 mirror attempts timed out

| Field | Value |
| --- | --- |
| ID | 2026-10-12-005 |
| Date | 2026-10-12 |
| Check (job) | Integration tests on PostgreSQL 16 and S3 (MinIO) |
| Step | Install LibreOffice Writer |
| Run | CI #33 on `main`, push of merge commit 3ebd710 (job 114796656450) |
| Commit | 3ebd710 (merge of PR #7) |
| Category | infrastructure (recurrence of 2026-10-12-001) |
| Status | fixed (package cache added) |

## What was seen
- The step ran from 11:49:04 to 11:59:14 UTC. All 3 attempts of the retrying install script timed out on Ubuntu's package mirror, and the job failed with the script's message: *"Could not install LibreOffice after 3 attempts … infrastructure failure, not a test failure."*
- No test ran.
- The other five checks on the same commit passed.

## Root cause
- **The same as 2026-10-12-001:** Ubuntu's package mirror stalled. That day it stalled in 3 of 8 runs that installed LibreOffice:
  - CI #21: hung, then cancelled;
  - CI #25: rescued by the third attempt;
  - CI #33 (this one): all three attempts failed.
- **The retry from incident 001 does its job.** It fails fast with a clear message instead of hanging. But a retry against an unreliable server cannot make the job reliable. The fix has to remove the dependency on the server.

## Modules affected
- **Affected:** the two CI jobs that install LibreOffice ("Unit and integration tests with coverage" and "Integration tests on PostgreSQL 16 and S3 (MinIO)").
- **Not affected:** the code merged in PR #7. Its tests passed on the PR's final commit 219a0aa.

## Fix
- **`.github/scripts/install-libreoffice.sh`:**
  - **With cached packages:** installs them directly with `dpkg`. No package lists are needed and the mirror is never contacted.
  - **Without them, or when the cached set no longer fits the runner image:** first repairs any half-finished install (`apt-get install -f`), then downloads from the mirror with the timeouts and retries from incident 001. Downloaded packages go into the cache folder.
- **`.github/workflows/ci.yml`:**
  - restores the cache before the install and saves it straight after, so a later test failure doesn't lose it;
  - the cache key follows GitHub's runner image (`$ImageOS-$ImageVersion`), so the cache refreshes when GitHub updates the image;
  - changing `-v1` in the key forces a refresh.

## Prevention
- After the first successful run per runner image version, the install needs no network: about 7 s instead of 20 s, or minutes when the mirror is slow.
- A mirror outage can now only affect the first run after GitHub publishes a new runner image.

## How it was verified
Locally on Ubuntu 24.04 (the CI runner OS), removing LibreOffice between runs:

| Scenario | Result |
| --- | --- |
| Empty cache, mirror reachable | Downloaded from the mirror; packages cached |
| Filled cache, mirror **blocked** (apt pointed at an unreachable proxy) | Installed from the cache in about 7 s, no network |
| Cache missing `libreoffice-core`, mirror reachable | Cached install detected the gap, the repair step cleaned up, the mirror install completed, the cache refreshed, and `dpkg --audit` was clean |

- **Found and fixed during testing:** `apt-get --no-download` refused to install cached files passed by path, so the cached install now uses `dpkg -i`. `apt-get install -f` only repairs when given no package names, so it runs as its own step.
- **One unexplained local observation:** once, the cache folder was empty at the start of a run although the previous run had filled it. It did not happen again in 3 later runs, and an empty cache safely falls back to the mirror.

## Follow-up: confirmed on `main`
- **CI #35 on `main`** (after PR #8 merged): the tests job installed LibreOffice from the mirror in 21 s and saved the cache. The integration job restored it and installed **from 49 cached packages, with no mirror contact**, in 11 s.
- **That run failed for an unrelated reason:** see [2026-10-12-006](2026-10-12-006-pool-error-unhandled.md).
