# Blocks

Each block lists what it **owns** (its data — no one else touches it), what it **exposes** (its contract), the **events** it publishes, and the blocks it **depends on**. A block may only depend on another block's contract, never its internals.

Phase column: **1** = built for the first release; **1s** = built in Phase 1 against the hardware simulator; **2** = designed now, built later.

| Block | Phase | Owns | Exposes | Publishes | Depends on |
| --- | --- | --- | --- | --- | --- |
| **identity** | 1 | Accounts, email verification, sessions, roles, linked Google/Apple identities, station QR challenges | Register, email/password, Google and Apple sign-in, QR sign-in at stations, log out, reset password, current user, roles | `UserRegistered`, `UserLoggedIn` | markets |
| **markets & config** | 1 | Countries, cities, currency, VAT rates, languages, opening hours, feature flags | Get market for location, get settings, translations | `MarketSettingsChanged` | — |
| **documents** | 1 | Uploaded files, file checks, conversion to PDF, page count, retention and deletion | Direct upload to encrypted storage, document status, printable page count for orders, 5-minute print link for stations | `DocumentReady`, `DocumentRejected`, `DocumentDeleted` | doc-worker (job), S3 |
| **pricing** | 1 | Append-only price lists per market: page-count tiers (b/w; colour when offered), order page limit, upload size limit, VAT. No delivery fee: the delivery partner charges it (ADR 0006) | Quote(pages, copies, colour, fulfilment) → itemised price incl. VAT; publish a new price list (admin) | `PriceListChanged` | markets |
| **orders** | 1 | Orders, order items, print settings, the order state machine | Create order, get order, list my orders, cancel | `OrderCreated`, `OrderStateChanged` (every transition) | documents, pricing |
| **payments** | 1 | Payment intents, captures, refunds, webhook log | Start payment for order, refund | `PaymentSucceeded`, `PaymentFailed`, `RefundIssued` | orders (read), **PaymentProvider port** → Stripe adapter |
| **fulfilment** | 1 | Routing decisions, print jobs, locker assignments, pickup credentials | Route order, assign locker, verify pickup credential | `PrintJobDispatched`, `PrintCompleted`, `PrintFailed`, `LockerAssigned`, `PickupCredentialIssued`, `OrderCollected` | orders, stations |
| **stations** | 1s | Stations, printers, lockers, device status, consumables, availability | List available stations near X, get station status, send command | `StationStatusChanged`, `DeviceFault`, `ConsumableLow` | station-gateway |
| **delivery** | 1 | Hand-over to delivery partners, delivery tokens, delivery status | Request partner pickup, verify courier token at the station, track delivery | `CourierAssigned`, `CourierCollected`, `Delivered`, `DeliveryFailed` | orders, fulfilment, **CourierProvider port** → own-riders adapter |
| **notifications** | 1 | Templates (sv/en), delivery log, preferences | — (event-driven only) | `NotificationSent` | **EmailProvider / SmsProvider ports** |
| **support** | 1 | Support cases, notes, resolutions | Open case, search orders, resolve, trigger reprint/refund | `SupportCaseOpened`, `SupportCaseResolved` | orders, payments, fulfilment |
| **maintenance** | 2 | Alerts, work orders, service records | Acknowledge alert, record service, restore availability | `MaintenanceCompleted` | stations |
| **audit** | 1 | Append-only event log with actor, timestamp, order ID | Search log (admin only) | — | all events |
| **reporting** | 1 (basic) / 2 (full) | Read-only projections for dashboards | Revenue, volumes, fulfilment mix, utilisation, downtime, demand map | — | all events |

## Ports and adapters (replaceable integrations)

| Port | Phase 1 adapter | Later adapters |
| --- | --- | --- |
| `PaymentProvider` | Stripe (cards, Apple/Google Pay, Klarna) | Swish, MobilePay (Denmark) |
| `CourierProvider` | First delivery partner (to be chosen) | Wolt, Foodora, Bolt, Budbee |
| `PrinterDriver` (in station-agent) | Simulator | IPP/IPP Everywhere printers, vendor SDKs |
| `LockerController` (in station-agent) | Simulator | Vendor locker controllers (serial/Modbus/HTTP) |
| `EmailProvider` | Amazon SES (eu-north-1) | — |
| `SmsProvider` | 46elks (Swedish) | Twilio |
| `DocumentProcessor` | LibreOffice headless + pdf-lib, in the core process | Same code in the sandboxed doc-worker container |
| `MalwareScanner` | Pass-through (**must be replaced before launch**) | ClamAV |
| `ObjectStorage` | S3 with KMS (MinIO locally) | — |

Adding a new vendor = writing one adapter class and enabling it per market in config. No change to orders, payments logic or fulfilment.

## Repository layout

```
apps/
  mobile/           React Native (Expo) — iOS and Android customer app
  web/              Next.js — customer site + /courier app (PWA)
  admin/            Next.js — admin, support, maintenance, management
  station-ui/       Kiosk UI served by the station agent
services/
  core/             NestJS modular monolith, one folder per block under src/blocks/
  doc-worker/       Conversion, page count, virus scan (sandboxed)
  station-gateway/  WebSocket/MQTT endpoint for station agents
edge/
  station-agent/    Runs on the station PC: printer + locker drivers, offline queue
packages/
  contracts/        Versioned DTOs, events and block interfaces (the only shared code)
  design-tokens/    Generated from the PapperDash design system
  i18n/             sv / en message catalogues
  ui/               Shared React components built on the tokens
infra/
  terraform/        AWS: network, ECS, RDS, Redis, S3, KMS, CloudFront, Route 53
docs/
```

Lint rules (`eslint-plugin-boundaries`) fail CI if a block imports another block's internals, so the boundaries cannot erode silently.
