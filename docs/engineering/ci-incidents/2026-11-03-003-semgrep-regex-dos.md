# Semgrep blocked a station ID pattern as a possible regular-expression denial of service

| Field | Value |
| --- | --- |
| ID | 2026-11-03-003 |
| Date | 2026-11-03 |
| Check (job) | Security scans (secrets, code, dependencies) |
| Step | Security bugs in the code (Semgrep) |
| Run | CI run 41720951143 on PR #13 (job 126213244752) |
| Commit | 768f52e |
| Category | test-failure (real finding) |
| Status | fixed in e9ba0bb |

## What was seen
- `services/core/src/blocks/stations/stations.service.ts` line 25: rule `ajinabraham.njsscan.dos.regex_dos.regex_dos`, "Ensure that the regex used to compare with user supplied input is safe from regular expression denial of service". The finding was blocking.
- Every other check on the commit passed.

## Root cause
- The admin endpoint `PUT /v1/admin/stations/:id` checked the ID with `/^[a-z0-9]+(-[a-z0-9]+)*$/`, which nests a quantifier inside a repeated group.
- That is the shape that can backtrack exponentially on crafted input. Here the hyphens make each part unambiguous, so the real risk was low, and only admins can call the endpoint.
- The rule cannot prove that, and the safe rewrite is simpler to read. So the finding was fixed, not excluded.
- Semgrep could not run before pushing: this cloud environment's network blocks semgrep.dev. CI was the first place the scan ran.

## Modules affected
- **Affected:** the stations block (new in PR #13): only the ID check for admin changes.
- **Not affected:** customer-facing endpoints.

## Fix
- `isStationId()` in `packages/contracts/src/stations.ts`. It checks the length (1–64) first, then splits on hyphens and checks the characters with plain string comparisons: no regular expression.
- Tests in `packages/contracts/src/stations.test.ts`: valid and invalid IDs (capitals, double, leading or trailing hyphens, spaces, `ö`, 65 characters), and a 200,000-character hostile input answered in under 50 ms.

## Prevention
- Validate user input with zod or plain string checks. Avoid nested quantifiers like `(x+)*` in any pattern that sees user input.
- When Semgrep cannot run locally, expect CI to be the first scan, and read its finding before deciding anything is a false positive.
