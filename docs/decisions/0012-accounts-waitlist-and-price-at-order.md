# ADR 0012: Accounts and waitlist on the website; the price is shown when ordering

- Status: Accepted (client decisions 2026-11-03)
- Date: 2026-11-03

## Context
The first public launch is info pages, a waitlist and accounts (ADR 0011). The backend already had sign-up,
email verification, login and password reset. The waitlist and a switch for ordering did not exist.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Price display | **No price table on the public pages.** The price is shown in the order flow: after a file is uploaded, core counts its pages, and the quote (pages × copies → page-count tier, `POST /v1/pricing/quote`) is shown before payment. Built with upload in the next PR. | Client decision: the customer sees what *their* document costs at the moment they order, not a table to interpret. |
| Waitlist | A `waitlist` block: `POST /v1/waitlist` (email, language, optional Swedish postcode, required consent) and `POST /v1/waitlist/leave` with the token from the confirmation email. Entries are deleted when someone leaves. | GDPR: consent is explicit and recorded (art. 7), only needed data is kept, and withdrawing is one click. |
| No enumeration, no inbox flooding | Joining twice gives the same answer and sends no second email. Limited to 20 sign-ups per IP address per hour. | The form cannot reveal who is on the list or be used to spam an address. |
| Ordering switch | `ORDERING_ENABLED` (default `false`). While off, `POST /v1/orders` answers 503 `ordering_closed`; `GET /v1/status` tells the website. | Accounts and uploads work before the pilot station exists; nothing can be charged for an order we cannot print. |
| Email links | Links open the page in the customer's language (`/sv/verify-email?token=…`). The page removes the token from the address bar and history right away. Verification happens on opening the link; leaving the waitlist needs a click. | The token does not linger in history or screenshots. Mail scanners that open links must not remove anyone from the list. Verifying early is harmless. |
| Resend verification | `POST /v1/auth/verify-email/resend` for a signed-in customer whose email is not confirmed, at most 3 an hour. | A lost or expired first email no longer locks the customer out of ordering. |
| Session in the browser | The HttpOnly cookie from core (ADR 0004) is the only session. The website asks `GET /v1/auth/me` to know who is signed in; scripts never see the token. | Nothing for an injected script to steal. |
| Login redirect | `?next=` is followed only for a path on this site in the same language. | No open redirect for phishing links. |
| Messages | The website shows its own Swedish or English text for each error code (`invalid_credentials`, `rate_limited`, …), never the server's English text. Forms are checked in the browser with the same zod contracts the server uses. | Both sides always agree on what is valid; customers read their own language. |
| Google and Apple sign-in | Not on the website yet. The backend supports them; the buttons come once the client IDs exist. | They need accounts with Google and Apple first. |

## Tests
- **Core:** `test/waitlist.e2e.test.ts` (consent, normalisation, no second email, leave once, per-IP limit, the ordering switch); `test/identity.e2e.test.ts` (links in the customer's language, resend and its limit).
- **Website, mocked API (desktop and phone):** `e2e/accounts.spec.ts` covers every screen in every state (errors, lockout, no network, expired links). It also checks every account page for WCAG 2.2 AA, sideways scrolling, 48 px targets and noindex on link pages.
- **Full stack:** `e2e/fullstack.spec.ts` drives the real chain, browser → Next.js → core → PostgreSQL:
  - sign up, open the link from the email, log in, log out;
  - reset a password;
  - join and leave the waitlist.
  CI runs it in the website job against a PostgreSQL 16 service.
