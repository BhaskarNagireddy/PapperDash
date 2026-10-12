# Open questions for the client

Implementation of a block starts only once its questions below are answered. Answers are recorded here.

## Confirmed (2026-09-27)

- Brand: the proposed design system is approved for now; it will be refined later.
- Deployment: all blocks run in one server application at launch (ADR 0001, accepted).
- Login: email + password, Google and Apple sign-in, and QR sign-in at stations (ADR 0004).
- Channels: iOS and Android apps (React Native) plus the website; a QR scan without the app goes to the app store (ADR 0005).
- Limits: 50 printed pages per order, 50 MB per file (admin-editable).
- Launch prices (SEK, VAT incl., per order by printed pages): 1–5: 10 kr, 6–15: 16 kr, 16–25: 25 kr, 26–50: 50 kr (admin-editable).
- Prototype prints black and white only; delivery is priced and charged by the delivery partner's app (ADR 0006).
- Scope: Phase 1 = online ordering + courier delivery; stations/lockers via simulator (fulfilment model updated 2026-10-12, see below).
- Stack: TypeScript end to end. Hosting: AWS Stockholm.
- Payments: Stripe (cards, wallets, Klarna). Couriers: delivery partners' apps (ADR 0006; replaces the earlier own-riders plan).
- Formats: PDF, JPG, PNG + Office converted server-side. Retention: 24 h after fulfilment, 2 h for unpaid uploads.

## Confirmed (2026-10-12): fulfilment ([ADR 0010](../decisions/0010-unattended-station-fulfilment.md))

- No staffed pickup point. Every order is printed by an unattended PapperDash station: output tray, storage lockers, or collection by a delivery partner's rider from a locker.
- Customers open their locker by scanning the station screen's QR code in the app or website, then tapping "Open my locker". Closing the door marks the order collected.
- Riders enter the order's courier code on the station screen. Closing the door marks the order out for delivery, and the partner confirms delivery.
- Unclaimed lockers: reminders at 24 h and 44 h, then support after 48 h. No refund.
- Ratings: every completed order asks for 1–5 stars and an optional comment, visible to staff only.
- Until the pilot station exists, papperdash.se is information and a waitlist. Ordering runs on staging against the simulator.

## Still open

| # | Question | Blocks it gates |
| --- | --- | --- |
| 3 | Colour prices and whether double-sided costs less, when colour is switched on after the prototype | pricing (values only — editable in admin) |
| 4 | Legal entity, organisation number and VAT registration (needed for Stripe, receipts and VAT) | payments, notifications (receipts) |
| 5 | Which delivery partner to integrate first (Wolt, Foodora, Bolt, Budbee…), and the area served in Phase 1 | delivery |
| 6 | BankID as a later third login method? | identity |
| 9 | Terms of service and privacy policy text (legal owner) | web |
| 10 | Who owns the AWS account and the GitHub organisation, and who needs admin access | infra, CI/CD |
| 11 | Company Apple Developer and Google Play developer accounts (needed to publish the apps and to issue Google/Apple sign-in client IDs) | apps/mobile, identity |
| 12 | Malware scanning of uploads (ClamAV in the doc-worker) must be switched on before public launch; the scanner port is in place with a pass-through adapter | documents |
| 13 | Stripe account in the company's name (needs the organisation number from question 4); go-live checklist in ADR 0007 | payments |
| 15 | Pilot station hardware: printer model, packing method, locker count and door sensors, screen, and site (address in Lund?) | stations, launch date |
| 14 | VAT registration (momsregistrering) and Stripe Tax: switch on only after the registration is recorded in Stripe (ADR 0007, Tax plan) | payments, pricing |
