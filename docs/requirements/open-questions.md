# Open questions for the client

Implementation of a block starts only once its questions below are answered. Answers are recorded here.

## Confirmed (2026-09-27)

- Brand: the proposed design system is approved for now; it will be refined later.
- Deployment: all blocks run in one server application at launch (ADR 0001, accepted).
- Login: email + password is the main method; QR sign-in at stations is the second (ADR 0004).
- Scope: Phase 1 = online ordering + courier delivery; stations/lockers via simulator.
- Stack: TypeScript end to end. Hosting: AWS Stockholm.
- Payments: Stripe (cards, wallets, Klarna). Couriers: own riders with a courier web app.
- Formats: PDF, JPG, PNG + Office converted server-side. Retention: 24 h after fulfilment, 2 h for unpaid uploads.

## Still open

| # | Question | Blocks it gates |
| --- | --- | --- |
| 3 | Launch prices in SEK: per page b/w and colour, duplex, handling fee, delivery fee and zones | pricing (values only — the block itself does not wait) |
| 4 | Legal entity, organisation number and VAT registration (needed for Stripe, receipts and VAT) | payments, notifications (receipts) |
| 5 | Phase 1 delivery area and hours (Lund + Malmö? same-day? evening?) | delivery, pricing |
| 6 | BankID as a later third login method? | identity |
| 7 | Upload limits: max file size and max pages per order | documents |
| 8 | Rider onboarding: employees or contractors, and what ID check before a rider gets an account | delivery, identity |
| 9 | Terms of service and privacy policy text (legal owner) | web |
| 10 | Who owns the AWS account and the GitHub organisation, and who needs admin access | infra, CI/CD |
| 11 | Should scanning a station QR code while not registered open registration on the phone, then continue straight to printing? (proposed: yes) | identity, web |
