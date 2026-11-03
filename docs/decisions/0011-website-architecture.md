# ADR 0011: Website architecture and first public launch

- Status: Accepted (client decisions 2026-11-03)
- Date: 2026-11-03

## Context
papperdash.se is the first customer surface (ADR 0005). The backend API is ready. The first station does not exist yet (ADR 0010), so real orders cannot be fulfilled at launch.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| First public launch | **Info pages, waitlist and accounts.** Visitors can sign up and upload; checkout stays off until the pilot station exists. A server setting turns ordering on. | People can try the product early; nothing is charged for an order we cannot print. |
| Domain | **One origin:** `papperdash.se` serves the site, and `papperdash.se/v1/*` the API. CloudFront routes `/v1/*` to core, everything else to the website. | The session cookie is first-party: no cross-site cookie restrictions (Safari ITP), no CORS in production, one certificate and one firewall. |
| Language | **Swedish by default** at `/sv`, English at `/en`. A switch on every page; the choice is remembered in a functional cookie (`pd_locale`, one year). | Swedish market; separate URLs per language let search engines index both. |
| Framework | **Next.js 16** (App Router), **React 19**, TypeScript, in `apps/web`. Marketing pages are statically generated. | Server rendering for SEO and speed; the same TypeScript contracts as the backend (`@papperdash/contracts`). |
| Design | `@papperdash/design-tokens` is generated from the approved design system's `tokens.json` into CSS custom properties; components use only those tokens. Tests check the design system's contrast promises (4.5:1 text). | One source of truth, and accessibility enforced by CI. |
| Fonts | Hanken Grotesk and JetBrains Mono, **self-hosted** from npm (`@fontsource`). | No visitor IP is sent to Google (GDPR); works offline in tests. |
| Translations | `en.ts` defines every key; `sv.ts` is typed against it, so a missing Swedish text fails the build. Swedish copy needs a native speaker's review before launch. | Half-translated pages never ship. |
| Security headers | Content Security Policy limited to our own origin, plus HSTS, nosniff, a strict referrer policy and a Permissions-Policy. Scripts allow `'unsafe-inline'`, which Next.js documents for statically generated pages, since they cannot carry a per-request nonce. | Keeps pages static and cacheable at the CDN. Revisit when Next.js's hash-based CSP (SRI, experimental today) is stable. |
| Cookies | Only functional cookies: the session and the language. No tracking or third-party cookies, so no consent banner is needed. | Lawful without consent under the Swedish Electronic Communications Act (LEK) and the GDPR. |
| Tests | Unit tests (Vitest), plus browser tests (Playwright) on desktop and phone with axe for WCAG 2.2 AA. Every PR runs them in CI ("Website (build, unit and browser tests)"). | User-facing regressions fail CI, not customers. |

## Consequences
- **Hosting:** the website runs as its own container (Next.js `standalone` output) on ECS next to core. CloudFront's path routing is part of the Terraform step.
- **Branch protection:** the new CI check must be added to it. `.github/rulesets/protect-main.json` now lists 7 checks; re-import it.
- **AWS:** set up after the website is complete (client decision). Until then, everything is proven in CI.
