# ADR 0007: Payments with Stripe PaymentIntents

- Status: Accepted
- Date: 2026-09-28

## Decision
The payments block charges **the price already stored on the order** through Stripe, behind the `PaymentProvider` port:

1. `POST /v1/orders/:id/checkout` moves a Draft order to AwaitingPayment and creates a Stripe **PaymentIntent** with automatic payment methods. The app shows Stripe's **PaymentSheet** (iOS/Android) and the website shows Stripe's **Payment Element**, both from the returned client secret. Card, **Apple Pay**, **Google Pay** and **Klarna** are offered as enabled in the Stripe Dashboard. Card details go straight from the customer to Stripe, never through PapperDash.
2. Stripe confirms the payment by webhook (`payment_intent.succeeded`). The webhook is verified by its signature, applied exactly once, and publishes `PaymentSucceeded`. The order then moves **AwaitingPayment → Paid**. The app's own "payment done" message is never trusted to mark an order paid.
3. Support and admin staff refund through `POST /v1/admin/orders/:id/refunds`, in part or in full. A confirmed full refund moves the order to **Refunded**. Slow refunds (Klarna) stay pending until Stripe confirms them by webhook.

## Safety rules
- **No double charges:** each checkout attempt has an idempotency key (`payment:<order>:<attempt>`); returning to checkout resumes the open PaymentIntent.
- **No lost payments:** payment and order changes are linked through outbox events, so a crash between them is retried.
- **Cancel vs. pay race:** cancelling an order cancels its open PaymentIntent. If the payment completed at the same moment, it is refunded automatically.
- **Refund limits:** refunds can never exceed what was paid. A full refund is refused while the order is printing or out for delivery; staff move it to support first, or refund part of it.

## Stripe Dashboard setup (before going live)
1. Create the Stripe account in the company's name (needs the organisation number, see open question 4).
2. Settings → Payment methods: enable Cards, Apple Pay, Google Pay and Klarna.
3. Apple Pay on the web: verify the `papperdash.se` domain in the Dashboard.
4. Developers → Webhooks: add `https://api.papperdash.se/v1/payments/webhooks/stripe` with the events `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`, `refund.created`, `refund.updated` and `refund.failed`.
5. Set `STRIPE_SECRET_KEY` (or a restricted key), `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` in AWS Secrets Manager.

Locally, `stripe listen --forward-to localhost:4000/v1/payments/webhooks/stripe` forwards test webhooks.

## Consequences
- Swish can be added later as another `PaymentProvider` adapter, without changes to orders or refunds.
- Orders left in AwaitingPayment are not yet cancelled automatically. That follow-up needs the order-expiry job.
