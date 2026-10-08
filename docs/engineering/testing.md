# Testing and quality standards

Every change reaches `main` through a pull request. **Branch protection makes every check below required**, so nobody, the repository owner included, can merge a red pull request. (It has to be switched on once by a repository admin; see [Turning on branch protection](#turning-on-branch-protection).)

## The rule for every pull request
1. **New code comes with tests.** Logic gets unit tests; anything reachable over HTTP gets integration tests through the real API.
2. **Bug fixes come with the test that would have caught the bug.**
3. **Coverage never goes down.** The minimum coverage in `vitest.config.ts` fails the build if coverage drops. Raise the numbers as coverage grows; never lower them.
4. **No skipped, disabled or "flaky" tests.** A failing test is a bug in the code or in the test, and is fixed, not ignored.

## Kinds of tests

| Kind | Where | What it proves | Runs |
| --- | --- | --- | --- |
| **Unit** | `src/**/*.test.ts` (label `unit`), `packages/contracts/src/*.test.ts` | One function or adapter in isolation: the order state machine, retention rules, config safety checks, the Stripe adapter against a recorded fake of Stripe's API | Every PR, in seconds |
| **Integration** | `services/core/test/*.test.ts` (label `integration`) | The real HTTP API on a freshly migrated database: sign-in, uploads, orders, payments, refunds, permissions between customers | Every PR, on in-memory PostgreSQL |
| **Integration on real infrastructure** | Same tests, with `TEST_DATABASE_URL` and `S3_TEST_ENDPOINT` set | The same flows on PostgreSQL 16 (the production engine), and file uploads, downloads and deletes on S3 (MinIO) | Every PR |
| **Data exposure** | `test/data-exposure.e2e.test.ts` | No response or log line ever contains a password, hash, token, storage key, Stripe secret or another customer's data | Every PR |
| **Container** | CI job "Docker image" | The production image builds, runs as non-root, applies migrations, reports ready, sends security headers, and refuses unsafe production settings | Every PR |
| **End-to-end (browser)** | `apps/web/e2e` (with the website) | A real browser signs up, uploads, pays in the Stripe sandbox and tracks the order | Planned with the website |
| **Load** | `tests/load` (before launch) | Response times and error rate at expected exam-week peak | Before launch, and before big changes |

Run them locally:

```sh
pnpm test                                    # everything (unit + integration, in-memory database)
pnpm test:coverage                           # with coverage and the minimums
pnpm --filter @papperdash/core test:unit
pnpm --filter @papperdash/core test:integration
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @papperdash/core test:integration
```

## What GitHub shows on every pull request

| Check (required) | Fails when |
| --- | --- |
| Lint, block boundaries and committed secrets | Style errors; a block importing another block's internals; a Stripe key or webhook secret in the code |
| Build, typecheck and migration check | Type errors; a database schema change without its migration |
| Unit and integration tests with coverage | Any test fails, or coverage drops below the minimum. Posts a **coverage comment** on the PR, and every test's result in the job summary |
| Integration tests on PostgreSQL 16 and S3 (MinIO) | Any flow behaves differently on the production database engine or real S3 |
| Security scans (secrets, code, dependencies) | Gitleaks finds a secret anywhere in the git history; Semgrep finds a security bug pattern; `pnpm audit` finds a high or critical vulnerability in a production dependency |
| Docker image (build, boot, vulnerability scan) | The image doesn't build, boot or pass its checks, or Trivy finds a critical vulnerability with a fix available |

The test and coverage reports are also kept as a downloadable **artifact** for 30 days.

## Finding data leaks: the layers

1. **Before code is committed:** `pnpm lint` stops Stripe keys and webhook secrets.
2. **In the whole git history:** Gitleaks scans every commit for any kind of credential (AWS keys, tokens, private keys).
3. **In our code's behaviour:** the data-exposure tests run every flow and fail if a response or log line contains something it must not.
4. **In our code's patterns:** Semgrep looks for injection, unsafe crypto, JWT misuse and similar.
5. **In what we depend on:** `pnpm audit` checks the npm packages and Trivy checks the container's operating system packages. Dependabot proposes updates weekly.
6. **At runtime:** production refuses to start without encrypted storage, real email sending and https, so a missing setting can't quietly leak data.

## Credentials in CI

`ci.yml` contains **no real credentials**.
- **Test databases:** the PostgreSQL test databases use the fixed password `postgres`. They exist only on the GitHub runner for one job, can't be reached from outside it, and are deleted afterwards.
- **MinIO login:** generated randomly on every run and masked in the logs.
- **Real secrets:** Stripe keys, AWS keys and webhook secrets never appear in the repository. In GitHub Actions they would come from encrypted repository secrets; in AWS, from Secrets Manager.
- **History check:** Gitleaks scans the whole git history on every pull request.

## Warnings and false positives

Scanners sometimes flag something that is safe: a **false positive**. The rule is the same for every tool. **Never switch the check off.** Record a narrow exception, with the reason, in the pull request where a reviewer can see it. Anything not covered by the exception keeps failing.

| Tool | How to record a reviewed exception |
| --- | --- |
| Data-exposure tests | Add an entry to `ALLOWED` in `test/data-exposure.e2e.test.ts`: the route, the exact field, and why it is safe. An exception that no longer matches anything fails the test, so stale ones get removed. Example in the code: the S3 upload form must contain the file's storage key. |
| Gitleaks | Add the finding's fingerprint to `.gitleaksignore`, with a comment saying why. If a real secret was ever committed, roll it first; rewriting history doesn't make it safe. |
| Semgrep | `// nosemgrep: <rule-id>` on (or directly above) the exact line, with the reason in a comment. Rules that only *confirm* good practice (njsscan's `good_*` rules, e.g. "CSP header is present") are excluded by exact rule ID in `ci.yml`. |
| pnpm audit | Upgrade first. If no fix exists and the vulnerable code path is unused, add the advisory to `pnpm.auditConfig.ignoreGhsas` in `package.json`, with the reason and a review date in the PR. |
| Trivy | Add the CVE to `.trivyignore`, with the reason and an expiry date. |
| Coverage drop | Add tests. The minimum is not lowered. |

**Warnings** that don't fail the build are still read: the high-severity Trivy report, and deprecation notices in CI logs. They are fixed in the next pull request that touches the area, or tracked as an issue.

## Turning on branch protection

A repository admin does this once in GitHub. The quickest way is to import [`.github/rulesets/protect-main.json`](../../.github/rulesets/protect-main.json): Settings → Rules → Rulesets → **New ruleset ▾ → Import a ruleset**. The steps below set up the same thing by hand. For a **private** repository it needs a paid plan (GitHub Pro for a personal account, or Team for an organisation); GitHub Free only protects branches in public repositories.

1. Repository → **Settings** → **Branches** → **Add branch protection rule** (or **Rules → Rulesets → New branch ruleset**), with the branch name pattern `main`.
2. Turn on **Require a pull request before merging**. Set the required approvals to `0` while one person develops, because GitHub never lets authors approve their own pull requests; raise it to `1` when a second developer joins. Turn on **Dismiss stale approvals when new commits are pushed**.
3. Turn on **Require status checks to pass** and **Require branches to be up to date before merging**, then add these six checks:
   - `Lint, block boundaries and committed secrets`
   - `Build, typecheck and migration check`
   - `Unit and integration tests with coverage`
   - `Integration tests on PostgreSQL 16 and S3 (MinIO)`
   - `Security scans (secrets, code, dependencies)`
   - `Docker image (build, boot, vulnerability scan)`
4. Turn on **Require conversation resolution before merging** and **Do not allow bypassing the above settings** (this applies the rule to admins too).
5. Leave force pushes and branch deletion **off**.
