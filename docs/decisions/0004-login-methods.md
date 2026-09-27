# ADR 0004: Email + password first, QR sign-in at stations second

- Status: Accepted (client decision 2026-09-27)
- Date: 2026-09-27

## Decision
1. **Email + password is the main login**, on the website, courier app and admin console. Passwords are hashed with Argon2id; sessions are opaque tokens (only their SHA-256 is stored), sent as an HttpOnly cookie on the web or a Bearer token in apps. Web sessions last 30 days. Five failed attempts per email and IP lock login for 15 minutes. Placing an order requires a verified email.
2. **QR sign-in is the second method**, used at a station so the customer never types a password on a shared kiosk:
   1. The station shows a QR code (valid 2 minutes, single use).
   2. The customer scans it with their phone and approves it while signed in there (signing in or registering with email + password first if needed).
   3. The station receives a session for that customer that works **only at that station**, only for walk-up printing, and expires after 10 minutes.
   4. The customer uploads or picks the file to print from their phone or the station, configures and pays.

## Consequences
- One account works everywhere; QR sign-in never creates accounts, so every order still belongs to a verified email.
- A lost or photographed QR code is useless after approval or 2 minutes.
- Stations authenticate with a per-station key during the simulator phase; this becomes mutual TLS via the station gateway before real hardware ships.

## Open follow-up
Whether a first-time visitor at a station should be able to register from the QR flow on their phone in one step (proposed: yes, the QR link opens registration if not signed in).
