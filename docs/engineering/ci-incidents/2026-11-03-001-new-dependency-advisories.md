# New vulnerability advisories failed the dependency audit

| Field | Value |
| --- | --- |
| ID | 2026-11-03-001 |
| Date | 2026-11-03 |
| Check (job) | Security scans (secrets, code, dependencies) |
| Step | `pnpm audit --prod --audit-level high` |
| Run | CI on PR #10 (commit 8bfebdf), job 126147140775 |
| Category | test-failure: a real finding (vulnerable dependencies); not caused by this PR's code |
| Status | fixed |

## What was seen
`5 vulnerabilities found · Severity: 1 moderate | 4 high`

| Severity | Package | Fixed in | Reaches us through | Advisory |
| --- | --- | --- | --- | --- |
| high | zod < 4.6.6 | 4.6.6 | `packages/contracts`, `services/core` (direct) | GHSA-mrhx-c7xc-m3w5: memory exhaustion validating oversized constrained collections |
| high | body-parser 2.0.0 – 2.3.x | 2.4.0 | core › @nestjs/platform-express › express | GHSA-27r3-jxmh-p828: denial of service via trailing bytes after a compressed body |
| high | multer 2.0.0 – 2.4.x | 2.5.0 | core › @nestjs/platform-express | GHSA-q7qp-rjg7-q26m: denial of service via a pending async fileFilter |
| high | source-map-js 1.0.0 – 1.2.1 | 1.2.2 | apps/web › next › postcss (build time only) | GHSA-68fv-2mgg-jv7q: event-loop denial of service via index source maps |
| moderate | qs 6.7.0 – 6.16.0 | 6.16.1 | core › express | GHSA-6pq8-jhm2-2vcw: `stringify` with `arrayFormat: 'comma'` throws |

## Root cause
- **New advisories, not new code.** Four of the five were published after `main`'s last green run on 2026-10-18; `main` itself had 4 when checked. The fifth (source-map-js) arrived with Next.js in this PR.
- **This is the audit doing its job:** it fails on a high-severity advisory in any production dependency.

## Modules affected
- **The backend's request parsing** (body-parser, qs) and **uploads** (multer): both reachable by anyone who can send a request to the API, so the denial-of-service findings were real exposure.
- **Input validation everywhere** (zod).
- **The website's build toolchain only** (source-map-js); it is not shipped to browsers.

## Fix
- **zod:** raised to `^4.6.6` in `packages/contracts` and `services/core`.
- **Transitive dependencies:** `pnpm.overrides` in the root `package.json` pins the patched versions (body-parser 2.4.0, multer 2.5.0, qs 6.17.1, source-map-js 1.2.2) until the parent packages require them.
- **Removing the overrides:** each is scoped to the vulnerable range. Drop an override once its parent package depends on the fixed version.

## How it was verified
- `pnpm audit --prod` reports **No known vulnerabilities found**.
- Lint, build and typecheck pass.
- All tests pass:
  - core: 125 with coverage, and 126 on PostgreSQL 16;
  - contracts 20, web 10, design tokens 7;
  - 15 website browser tests.
