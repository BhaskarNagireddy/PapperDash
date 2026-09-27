# @papperdash/core

The PapperDash business blocks, running as one NestJS application ([ADR 0001](../../docs/decisions/0001-blocks-as-modular-monolith.md)).

```
src/
  platform/        database, outbox + event bus, clock, IDs, validation, email port — no business logic
  blocks/
    identity/      accounts, sessions, email verification, password reset, QR sign-in
    orders/        orders and the order state machine
    pricing/       price lists, order page limit, quotes
    documents/     uploads, file checks, conversion to PDF, page count, retention
    payments/      Stripe checkout, webhooks, refunds
  db/schema.ts     migration registry (all block schemas)
  app.module.ts    composition root: one line per block
drizzle/           SQL migrations (generated: pnpm db:generate)
test/              end-to-end tests on in-memory Postgres (PGlite)
```

## Rules for working in a block

- A block touches only its own Postgres schema (`identity`, `orders`, …). IDs from other blocks are plain columns, never foreign keys.
- Import another block only through its `index.ts`. `pnpm lint` fails otherwise.
- Every state change writes its events to the outbox in the same transaction (`Outbox.append(tx, …)`).
- Event handlers subscribe with a unique consumer name and must be safe to run once per event ID (the bus guarantees it).
- Changing a table: edit the block's `*.schema.ts`, run `pnpm db:generate`, commit the new SQL file.

## HTTP API (v1)

All routes except `/health` are under `/v1`. Errors are JSON `{ error, message }` with a message that says what to do next; validation errors add `issues[]`.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | anyone | Create an account with email + password; sends a verification link |
| POST | `/auth/verify-email` | anyone | Confirm the email with the link token |
| POST | `/auth/login` | anyone | Email + password login; sets the `pd_session` cookie and returns a token |
| POST | `/auth/oauth/google`, `/auth/oauth/apple` | anyone | Sign in with a Google or Apple ID token; creates or links the account |
| POST | `/auth/logout` | signed in | Revoke the current session |
| GET | `/auth/me` | signed in | The current user |
| POST | `/auth/password-reset/request` | anyone | Send a reset link (same answer whether or not the email exists) |
| POST | `/auth/password-reset/confirm` | anyone | Set a new password; signs out all sessions |
| POST | `/auth/qr/challenges` | station | Create a QR code to show on the station screen |
| GET | `/auth/qr/challenges/:id` | station | Poll; once approved, returns a one-time station session |
| POST | `/auth/qr/approve` | signed in (phone) | Approve a scanned station QR code |
| POST | `/documents` | signed in | Register a file; returns a direct upload to storage (max 50 MB) |
| POST | `/documents/:id/complete` | owner | Upload finished: start checks, conversion and page counting |
| GET | `/documents`, `/documents/:id` | owner | Status (`processing`, `ready`, `rejected` with a reason), page count, deletion time |
| DELETE | `/documents/:id` | owner | Delete now (refused while a paid order still needs it) |
| POST | `/orders` | verified customer | Create a priced order (Draft) from a ready document |
| GET | `/orders` | signed in | My orders |
| GET | `/orders/:id` | owner, support, admin | One order |
| POST | `/orders/:id/cancel` | owner | Cancel before payment |
| GET | `/orders/:id/history` | support, admin | Every state transition with actor and time |
| POST | `/orders/:id/checkout` | owner | Start or resume payment; returns the Stripe client secret for the payment form |
| GET | `/orders/:id/payment` | owner, support, admin | Latest payment status and refunded amount |
| POST | `/payments/webhooks/stripe` | Stripe (signed) | Payment and refund confirmations; the order becomes Paid here |
| POST | `/admin/orders/:id/refunds` | support, admin | Refund part (`amountMinor`) or all of the payment, with a reason |
| GET | `/admin/orders/:id/refunds` | support, admin | Refunds for an order |
| GET | `/pricing` | anyone | Current price table and limits for a market (`?market=SE`) |
| POST | `/pricing/quote` | anyone | Price for pages, copies, colour and fulfilment; 422 over the page limit |
| PUT | `/admin/pricing/:market` | admin | Publish a new price list, effective immediately |
| GET | `/admin/pricing/:market/history` | admin | All price lists, newest first |

Stations authenticate with `x-station-id` and `x-station-key` headers (simulator phase; mutual TLS later).
