# ADR 0009: Coordinate server instances through PostgreSQL

- Status: Accepted
- Date: 2026-10-12

## Context
Production runs at least two copies of the backend (ADR 0008). Three things were only safe with a single copy:
- **Background jobs.** The outbox relay and the retention sweep ran on every copy. Two copies could handle the same event at the same moment. For example, a payment that arrives after its order was cancelled could be refunded twice.
- **Request limits.** The login lockout counted in memory, so each copy allowed the full number of attempts.
- **Abandoned orders.** Nothing cancelled unpaid orders, so they and their files stayed forever.

The original plan used Redis (ElastiCache) for this.

## Decision
Use the PostgreSQL database every copy already shares:
- **Leases** (`platform.leases`) give each background job (`outbox-relay`, `document-retention`, `draft-expiry`, `checkout-expiry`, `rate-limit-prune`) to one copy at a time.
  - Taking a lease and renewing it is one atomic statement.
  - A lease that is not renewed expires, so another copy takes over within a minute after a crash.
  - A copy gives its leases up on shutdown.
- **Rate limits** (`platform.rate_limits`) are fixed-window counters, one atomic upsert per request:

  | What is limited | Per | Limit |
  | --- | --- | --- |
  | Sign-ups | Network address | 10 / hour |
  | Password-reset emails | Email address | 3 / hour |
  | Password-reset requests | Network address | 20 / hour |
  | Failed logins | Email and network address | 5 / 15 minutes |
  | Uploads | Customer | 100 / hour |
  | QR codes | Station | 240 / hour |

  - Over a limit, the API answers 429 with `retryAfterSec`.
  - One exception: past the per-email reset limit, the API still answers 202 but sends nothing, so the answer never reveals whether an account exists.
- **Expiry jobs:**
  - Drafts unpaid after 24 hours are cancelled.
  - Orders still awaiting payment 2 hours after their last checkout are cancelled. The Stripe page is closed through the existing cancellation event.
  - Orders whose Klarna or bank payment is still being confirmed are never touched.
  - A payment that lands after expiry is refunded automatically (existing behaviour).

## Consequences
- **No new infrastructure** to run, secure or pay for before launch. ElastiCache is dropped from the launch plan.
- **Load:** one small write per limited request. That is negligible at expected volumes. If it ever matters, only `RateLimiter` and `Leases` change.
- **Fixed windows** can allow up to twice the limit across a window boundary. That is acceptable for abuse protection; it is not a quota.
- **Stuck events:** a handler slower than the relay lease (60 s) could overlap with a takeover. Transactional handlers are still protected by their processed-event marker, and the others are idempotent.
