# Open questions for the client

Implementation of a block starts only once its questions below are answered. Answers are recorded here.

## Confirmed (2026-09-27)

- Brand: the proposed design system is approved for now; it will be refined later.
- Deployment: all blocks run in one server application at launch (ADR 0001, accepted).
- Login: email + password, Google and Apple sign-in, and QR sign-in at stations (ADR 0004).
- Channels: iOS and Android apps (React Native) plus the website; a QR scan without the app goes to the app store (ADR 0005).
- Limits: 50 printed pages per order, 50 MB per file (admin-editable).
- Launch prices (SEK, VAT incl., per order by printed pages): 1–5: 10 kr, 6–15: 16 kr, 16–25: 25 kr, 26–50: 50 kr (admin-editable).
- Scope: Phase 1 = online ordering + courier delivery; stations/lockers via simulator.
- Stack: TypeScript end to end. Hosting: AWS Stockholm.
- Payments: Stripe (cards, wallets, Klarna). Couriers: own riders with a courier web app.
- Formats: PDF, JPG, PNG + Office converted server-side. Retention: 24 h after fulfilment, 2 h for unpaid uploads.

## Still open

| # | Question | Blocks it gates |
| --- | --- | --- |
| 3 | Colour prices (currently the same as black-and-white), the delivery fee (currently 0 kr), and whether double-sided costs less | pricing (values only — editable in admin) |
| 4 | Legal entity, organisation number and VAT registration (needed for Stripe, receipts and VAT) | payments, notifications (receipts) |
| 5 | Phase 1 delivery area and hours (Lund + Malmö? same-day? evening?) | delivery, pricing |
| 6 | BankID as a later third login method? | identity |
| 8 | Rider onboarding: employees or contractors, and what ID check before a rider gets an account | delivery, identity |
| 9 | Terms of service and privacy policy text (legal owner) | web |
| 10 | Who owns the AWS account and the GitHub organisation, and who needs admin access | infra, CI/CD |
| 11 | Company Apple Developer and Google Play developer accounts (needed to publish the apps and to issue Google/Apple sign-in client IDs) | apps/mobile, identity |
