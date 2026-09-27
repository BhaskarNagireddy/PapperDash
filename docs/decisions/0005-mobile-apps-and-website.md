# ADR 0005: iOS and Android apps alongside the website

- Status: Accepted (client decision 2026-09-27)
- Date: 2026-09-27

## Decision
Customers order through **native iOS and Android apps**, built once with **React Native (Expo)** in TypeScript, sharing contracts, design tokens and translations with the rest of the monorepo (`apps/mobile`). The **website (papperdash.se) stays** as a full ordering channel for desktop users and anyone who will not install an app.

Sign-in in the apps and on the website: **Google, Apple and email + password**. Apple's App Store rules require Sign in with Apple in any iOS app that offers Google sign-in. All methods reach one PapperDash account per verified email (ADR 0004).

## Scanning a station QR code
The station QR code is an HTTPS link, `https://papperdash.se/qr/<code>`, registered as an iOS Universal Link and Android App Link:

| Customer's phone | What happens |
| --- | --- |
| App installed | The link opens the app directly on the "Approve this station" screen (signing in with Google, Apple or email first if needed). |
| App not installed | The website shows "Get the app — it only takes a few seconds" and sends iPhones to the App Store and Android phones to Google Play. After install and sign-in, the customer scans again (the station shows a fresh code every 2 minutes). |
| Desktop or unknown device | The page offers both store links and web sign-in. |

The website hosts the files the phones check to allow this: `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.

## Consequences
- One codebase for both apps; the backend API is the same for apps and website.
- App Store and Google Play review adds lead time to every app release: backend changes must stay backward compatible with the app versions still in use (the `/v1` API prefix and additive contract changes).
- Requires an Apple Developer account (99 USD/year) and a Google Play developer account (25 USD once) in the company's name.
