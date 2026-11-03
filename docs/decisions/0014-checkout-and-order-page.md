# ADR 0014: Checkout from the website, the order page, and a test checkout without Stripe keys

- Status: Accepted (client decisions 2026-11-03)
- Date: 2026-11-03

## Context
Core already had Stripe Checkout (ADR 0007): `POST /v1/orders/:id/checkout`, signed webhooks, refunds and expiry. The website had no way to pay, and no page for Stripe to return to. CI and local runs have no Stripe keys, so payment could not be tested end to end, and the client could not try it by hand.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Order and pay | "Beställ och betala" on the order step creates the order and goes straight to the payment page. If payment cannot start, the order is kept and the page links to it. | One step from price to payment, and nothing is lost on an error. |
| Where payment goes | Only Stripe Checkout (`https://checkout.stripe.com`) or our own origin. The website refuses any other address in the checkout answer. | A compromised or wrong answer cannot send customers to a look-alike page. |
| Order page | `/sv/orders/<id>` (dynamic, noindex, signed in, owner only). It shows the status in the same words on every surface (`ORDER_STATE_LABELS`), pages × copies, sides, pick-up and total. While unpaid it offers "Betala …" and "Avbryt beställningen". | Stripe returns here; it is also the order's permanent page. |
| Return from Stripe | Stripe returns to `/<customer's language>/orders/<id>?checkout=success` or `?checkout=cancelled`. After success the page asks again every 2 s, for up to a minute, until the webhook has marked the order paid, then says "Tack. Din betalning är klar." The query is removed from the address. | The webhook can arrive a moment after the customer, and the redirect alone never proves a payment. |
| Test checkout | Without Stripe keys and outside production, core uses `DevPaymentProvider`. Its page at `/v1/payments/dev-checkout/<id>` says "Inga pengar dras" and offers "Betala (test)" or "Avbryt". Paying sends a webhook signed with a random per-process secret through `PaymentsService.handleWebhook`, the same code real Stripe payments take. | Payment can be tested end to end in CI and by hand without keys or money. |
| Production safety | The test checkout never exists in production. Core also refuses to start in production with `ORDERING_ENABLED=true` and no Stripe keys. | Nobody can order without being able to pay, and no fake payment can exist in production. |

## Tests
- **Core:** `test/dev-checkout.e2e.test.ts`:
  - order → checkout → test page → pay → webhook → **Paid**, then no second payment;
  - cancelling the order closes the page;
  - 404 without the test provider;
  - forged signatures are refused.
  - `config.test.ts` covers the production refusal and the switch.
- **Website, mocked API:** `e2e/checkout.spec.ts`, on desktop and phone:
  - waiting for confirmation, then thank you;
  - a cancelled payment, then cancelling the order;
  - "Betala" goes to the payment page;
  - another account's order is not shown;
  - sign-in redirect;
  - payment unavailable keeps the order;
  - axe and 48 px targets.
  - `checkout.test.ts` checks the payment-address allowlist.
- **Full stack** (`e2e/fullstack.spec.ts`), with ordering open in the test backend:
  - upload a real PDF → "Beställ och betala" → the test checkout shows 10,00 kr → pay → the order page says **Betald**;
  - leaving the payment page, then cancelling, shows **Avbruten**.

## Order history and tracking (added in the follow-up PR)
- **"Dina beställningar"** (`/sv/orders`) lists the customer's orders, newest first, with status and total. Each row is named by its visible text (WCAG 2.5.3).
- **The order page shows the milestones** for its way of reaching the customer, from `orderTracking()` and `TRACKING_STEPS` in `@papperdash/contracts`, so the app will show the same:
  - print at the station: Betald → Skrivs ut → Utskriven → Hämtad;
  - locker: … → Redo att hämta → Hämtad;
  - delivery: … → Väntar på bud → Ute för leverans → Levererad.
  The current step is marked with `aria-current="step"`.
- **While an order is on its way,** the page refreshes every 15 s.
- **Off the normal path** (support, failed print, failed delivery, refunded, cancelled), the page explains what happens instead of showing progress.

## Next
- **Legal pages and account settings**, including deleting the account.
- **Real Stripe test mode:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in staging, and follow the ADR 0007 checklist before live mode.
