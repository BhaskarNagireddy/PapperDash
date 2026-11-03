# LibreOffice install failed on `main` after the PR #10 merge: the package cache had expired and the mirror was slow

| Field | Value |
| --- | --- |
| ID | 2026-11-03-002 |
| Date | 2026-11-03 |
| Check (job) | Unit and integration tests with coverage, on `main` |
| Step | Install LibreOffice Writer |
| Run | CI run 41708914650 on `main` (job 126171517700) |
| Commit | 12189aa (squash merge of PR #10) |
| Category | infrastructure (recurrence of 2026-10-12-001 and -005) |
| Status | fixed |

## What was seen
- `Cache not found for input keys: libreoffice-ubuntu24-20261101.360.1-v1, libreoffice-`. The fallback key `libreoffice-` found nothing either.
- The script went to Ubuntu's mirror. It delivered about 0.3 MB/s. Writer needs about 96 MB, so it needs about 5 minutes.
- Each of the 3 attempts was cut off by the 180 s install timeout mid-download (`libreoffice-common`, `libreoffice-core`).
- Attempt 2 still had 75.6 MB of 95.7 MB to fetch; attempt 3 had 55.3 MB. So progress was being kept, but no attempt got to the end.
- No test ran. The other six checks on the same commit passed.

## Root cause
1. **The cache was gone.**
   - GitHub evicts a cache that nobody has used for 7 days.
   - `main` had no run between 2026-10-18 and 2026-11-03, so every LibreOffice cache saved on `main` expired.
   - Caches saved on PR branches cannot be read from `main`.
   - GitHub had also just moved the runner image to 20261101.360.1, so the exact key was new anyway.
2. **The timeout was shorter than the download.** The install timeout covered download and install together. On a slow mirror, 180 s cannot fetch 96 MB.

## Modules affected
- **Affected:** both CI jobs that install LibreOffice.
- **Not affected:** the code merged in PR #10. Its checks passed on the PR's final commit.

## Fix
- **`.github/scripts/install-libreoffice.sh`:** download and install are now two separate steps.
  - **Download:** `apt-get install --download-only` gets 420 s per attempt. Finished files stay in the cache folder, so each retry fetches only what is still missing. Over 3 attempts that is a 21-minute download budget.
  - **Install:** `apt-get install --no-download` installs from those files. It never touches the network and takes seconds.
- **`.github/workflows/ci.yml`:**
  - The install step timeout went from 15 to 26 minutes.
  - Both LibreOffice job timeouts went from 25 to 40 minutes, so the worst case still fails with the script's clear message, not a job timeout.
  - A scheduled run on `main` every Monday and Thursday at 04:17 UTC, plus `workflow_dispatch` for manual runs. This keeps the `main` cache in use (never 7 days idle). It also finds new dependency advisories and runner image changes before a PR does, as in incident 2026-11-03-001.

## Verification
- Ran the script locally with an empty cache folder: the mirror path downloaded, installed offline and saved the package.
- Ran it again with that folder: the cached path installed with `dpkg` and no mirror contact.

## Prevention
- The scheduled runs keep a cache warm on `main` for every new runner image within a few days.
- A slow mirror now costs minutes, not a red check.
