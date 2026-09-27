# ADR 0004: Login methods — email + password, Google, Apple, and QR at stations

- Status: Accepted (client decision 2026-09-27)
- Date: 2026-09-27

## Decision
1. **Email + password is the main login**, on the website, courier app and admin console. Passwords are hashed with Argon2id; sessions are opaque tokens (only their SHA-256 is stored), sent as an HttpOnly cookie on the web or a Bearer token in apps. Web sessions last 30 days. Five failed attempts per email and IP lock login for 15 minutes. Placing an order requires a verified email.
2. **QR sign-in is the second method**, used at a station so the customer never types a password on a shared kiosk:
   1. The station shows a QR code (valid 2 minutes, single use).
   2. The customer scans it with their phone and approves it while signed in there (signing in with Google, Apple or email + password first if needed).
   3. The station receives a session for that customer that works **only at that station**, only for walk-up printing, and expires after 10 minutes.
   4. The customer uploads or picks the file to print from their phone or the station, configures and pays.

3. **Google and Apple sign-in** (added 2026-09-27, see ADR 0005). The app or website sends the provider's ID token to `POST /v1/auth/oauth/{google|apple}`; the server verifies its signature, issuer and audience against the provider's published keys.
   - The provider account is linked by its stable subject ID, so a returning Apple user whose token omits the email is still recognised.
   - First sign-in with a verified email that already has a PapperDash account links to that account instead of creating a second one.
   - If that existing account's email was never verified, its password and sessions are removed on linking, so someone who registered another person's email in advance cannot take the account over.
   - Accounts created with Google or Apple have no password until the customer sets one via "Forgot password".

## Consequences
- One account works everywhere; QR sign-in never creates accounts, so every order still belongs to a verified email.
- A lost or photographed QR code is useless after approval or 2 minutes.
- Stations authenticate with a per-station key during the simulator phase; this becomes mutual TLS via the station gateway before real hardware ships.

## Resolved follow-up
A visitor without the app who scans a station QR code is sent to the App Store or Google Play to install it, then signs in with Google, Apple or email (ADR 0005).
