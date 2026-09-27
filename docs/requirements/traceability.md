# Requirements traceability

Maps each requirement group in the *PapperDash Software Requirements* document to the block(s) that deliver it and the phase it ships in.

| Requirement group | Blocks | Phase |
| --- | --- | --- |
| Register with email only, log in/out, manage account, order history | identity, orders | 1 |
| Secure upload, print settings, price before payment | documents, doc-worker, pricing, orders | 1 |
| Digital payment | payments (Stripe adapter) | 1 |
| Choose walk-up, station pickup or delivery | orders, fulfilment | 1 (delivery), 1s (pickup, walk-up) |
| Order-status notifications and tracking | orders, notifications, web | 1 |
| Delete documents per retention policy | documents (retention job) | 1 |
| Walk-up: log in or scan station QR, print, collect | station-ui, fulfilment, stations, station-agent | 1s |
| Online pickup: choose station, locker, PIN/QR, collection record | fulfilment, stations, station-agent | 1s |
| Delivery: address, delivery charges, status, completion | delivery, pricing, fulfilment | 1 |
| Courier: identify order, token auth, open only assigned locker, confirm | delivery, fulfilment, web `/courier` | 1 (hand-over), 1s (locker) |
| Admin: stations, orders, prices, payments/refunds, availability, alerts, access | admin app, stations, pricing, payments, identity | 1 |
| Support: search orders, investigate, refunds, locker problems, cases | support, admin app | 1 |
| Maintenance: alerts, device status, service records, consumables | maintenance, stations | 2 |
| Management reporting and expansion data | reporting | 1 (basic), 2 (full) |
| Station/device layer: receive jobs, route, states, lockers, credentials, telemetry, isolation | station-gateway, station-agent, fulfilment, stations | 1s |
| Security, privacy, RBAC, encryption | all; see [overview](../architecture/overview.md#security-baseline) | 1 |
| Reliability, data integrity, fault recovery | orders state machine, outbox, idempotent consumers; see [order lifecycle](../architecture/order-lifecycle.md) | 1 |
| Scalability, multi-country, configurable pricing/languages | markets & config, pricing, ports & adapters | 1 |
| Localization sv/en, Danish later | packages/i18n, markets | 1 |
| Accessibility and UX consistency | design system, packages/ui | 1 |
| Auditability and monitoring | audit, CloudWatch/OpenTelemetry | 1 |
