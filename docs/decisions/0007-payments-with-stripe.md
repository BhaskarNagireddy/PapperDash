# ADR 0007: Payments and Tax with Stripe Checkout Sessions

- Status: Accepted (client decisions 2026-09-28: Checkout Sessions; Tax built but off until VAT registration)
- Date: 2026-09-28
- Follows Stripe's best-practices guidance (Stripe plugin for Claude Code, API version `2026-08-26.dahlia`, Node SDK 22.x)

## Decision
The payments block charges **the price already stored on the order** through **Stripe Checkout Sessions**, hosted by Stripe, behind the `PaymentProvider` port.

1. **Checkout:** `POST /v1/orders/:id/checkout` moves a Draft order to AwaitingPayment and creates a Checkout Session. It returns `checkoutUrl`: the website redirects to it, and the iOS/Android app opens it in an in-app browser. Stripe returns the customer to `https://papperdash.se/orders/:id?checkout=success|cancelled`, which reopens the app through Universal Links / App Links.
   - The session is VAT-inclusive (`tax_behavior: inclusive`) and lives for 30 minutes (Stripe's minimum).
   - It is tagged with `integration_identifier`, so this flow can be compared with later ones in the Dashboard.
2. **Payment methods are chosen in the Dashboard, not in code.** No `payment_method_types` is passed. Card, **Apple Pay**, **Google Pay** and **Klarna** appear as enabled under Settings → Payment methods.
3. **Paid only on Stripe's confirmation.** The webhook handler marks an order Paid; the return page never does. `checkout.session.completed` counts only when `payment_status` is not `unpaid`. Klarna and other delayed methods confirm later through `checkout.session.async_payment_succeeded` or `_failed`. Every webhook is signature-checked and applied exactly once.
4. **Refunds:** support and admin staff refund in part or in full against the session's PaymentIntent. A confirmed full refund moves the order to **Refunded**, and pending refunds wait for Stripe's webhook.

## Safety rules
- **No duplicate checkouts:** each attempt has an idempotency key (`checkout:<order>:<attempt>`). Returning to checkout reuses the open page, unless it expires within 5 minutes.
- **No lost payments:** payment and order changes are linked through outbox events, so a crash between them is retried.
- **Klarna in progress:** while Klarna is confirming, a new checkout is refused (`payment_processing`), so the customer cannot pay twice.
- **Cancel vs. pay race:** cancelling an order expires its open checkout. If the customer paid at the same moment, the payment is refunded automatically, and never twice.
- **Refund limits:** refunds can never exceed what was paid. A full refund is refused while the order is printing or out for delivery.

## Stripe Tax plan
Tax is **built and switched off** (`STRIPE_AUTOMATIC_TAX=false`). Today, PapperDash prices already include 25 % Swedish VAT, computed by the pricing block. Stripe Tax only collects tax where an **active registration** is recorded; without one it silently collects 0 kr. So it stays off until these steps are done, in order:

1. **VAT registration with Skatteverket** (momsregistrering), confirmed by the company's accountant.
2. **Stripe Dashboard → Tax → Settings:** set the head office address. Tax settings stay `pending`, and calculate nothing, until it is set.
3. **Preset product tax code** in the same settings. Pick it from Stripe's official tax code list (https://docs.stripe.com/tax/tax-codes), with the accountant confirming it fits printing services sold to consumers. The code does not hard-code a tax code, and one must not be guessed.
4. **Tax → Locations → Add registration:** Sweden, with the VAT number.
5. **Check in a sandbox:** run a test tax calculation for a Swedish address. `taxability_reason` must not be `not_collecting`; that value means a registration or tax code is missing.
6. **Switch on:** set `STRIPE_AUTOMATIC_TAX=true`. Checkout then collects the address Stripe needs and reports VAT per transaction.
7. **Before expanding to Denmark:** add the Danish registration first. Stripe's threshold monitoring (Tax → Locations) shows where registration may be needed. Registration decisions stay with the accountant.

## Keys and environments
- **Keys:**
  - Use a **restricted API key** (`rk_…`) with only these permissions: Checkout Sessions (write), PaymentIntents (read), Refunds (write), and Tax calculations and transactions (write, once Tax is on). One key per environment.
  - Store keys and the webhook signing secret in **AWS Secrets Manager**, never in code or committed files. `pnpm lint` fails if a Stripe key or webhook secret is committed.
  - Roll keys when someone with access leaves. Use passkeys or an authenticator app, not SMS, for Dashboard 2FA.
- **Environments:**
  - Separate **Stripe sandboxes** for local development and for CI/staging; live mode only in production. Tax settings and registrations are per sandbox and must be set up again in live mode.
  - Locally: `stripe listen --forward-to localhost:4000/v1/payments/webhooks/stripe`.
- **Webhook endpoint** (live): `https://api.papperdash.se/v1/payments/webhooks/stripe`, with these events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `refund.created`, `refund.updated`, `refund.failed`
  - For defence in depth, also allowlist Stripe's webhook IP addresses in AWS WAF.
- **Website:** send a Content-Security-Policy that allows `https://*.stripe.com` in `script-src`, `frame-src` and `connect-src`, without wildcarding everything.

## Go-live checklist
- [ ] Stripe account in the company's name (needs the organisation number)
- [ ] Payment methods enabled: Cards, Apple Pay, Google Pay, Klarna
- [ ] Live restricted key and webhook secret in Secrets Manager
- [ ] Live webhook endpoint with the events above
- [ ] Test purchase and full refund in live mode with a real card
- [ ] Stripe Tax steps 1–6 (or confirm with the accountant that prices stay VAT-inclusive, as today)
- [ ] Stripe's go-live checklist: https://docs.stripe.com/get-started/checklist/go-live

## Consequences
- Swish can be added later as another `PaymentProvider` adapter, or enabled as a payment method in Checkout, without changes to orders or refunds.
- The app shows Stripe's hosted page instead of a native payment sheet: less custom UI, and PCI and 3-D Secure are handled entirely by Stripe.
- Orders left in AwaitingPayment are not yet cancelled automatically. The session expires after 30 minutes; the order-expiry job is a follow-up.
