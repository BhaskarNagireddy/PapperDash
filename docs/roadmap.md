# Status and roadmap

_Last updated 2026-10-08._

## Where the project is

**The core backend is built, tested and merged; nothing is live yet.** There is no website, app or AWS environment so far.

| Block | Status | What it does |
| --- | --- | --- |
| Architecture, decisions | Done | Block design, ADRs 0001–0008, requirements traceability |
| Platform | Done | PostgreSQL per-block schemas, transactional outbox, event bus, config safety checks, health and readiness checks, security headers |
| Identity | Done | Email + password, Google, Apple, QR sign-in at stations, verification, password reset, roles |
| Documents | Done | Direct encrypted upload, file checks, Word/Excel/PowerPoint/image to PDF, page counting, automatic deletion |
| Pricing | Done | Page-count tiers per order, 50-page limit, black and white only, admin price changes |
| Orders | Done | Priced orders, the controlled order state machine, history |
| Payments | Done | Stripe Checkout (card, Apple Pay, Google Pay, Klarna), webhooks, refunds, Stripe Tax switch (off) |
| Quality | Done | 120+ unit and integration tests, coverage minimums, real PostgreSQL and S3 tests, data-leak tests, security scans, Docker image checks |
| **Website** | **Next** | — |
| **AWS environment** | **Next** | — |
| Notifications | Not started | Order status emails and SMS |
| Admin console | Not started | Orders, refunds, prices for staff |
| Delivery | Not started | Delivery partner integration (partner to be chosen) |
| Stations and lockers | Not started | Fulfilment, station gateway, station agent, kiosk UI (simulator first) |
| Mobile app | Not started | iOS and Android (React Native) |

## Getting papperdash.se live (website first)

Each step is its own pull request with its own tests, merged only when every check passes.

1. **AWS foundation (Terraform)**
   - Network across 2 AZs; ECS Fargate cluster and load balancer; RDS PostgreSQL Multi-AZ; S3 with KMS; ECR; Secrets Manager; CloudWatch alarms.
   - Route 53, with the Loopia name servers pointed at it.
   - SES with a verified papperdash.se domain (SPF, DKIM, DMARC) and production access.
   - Staging first. Design: [deployment](architecture/deployment.md).
2. **Continuous deployment:** on merge, build the image once, push it to ECR, migrate, then a rolling deploy to staging with smoke tests. Production follows after a manual approval.
3. **Website (`apps/web`, Next.js), built on the design system, Swedish and English:**
   - landing and prices;
   - sign up and sign in (email, Google, Apple), email verification and password reset;
   - upload, which shows the page count and price;
   - print settings, checkout (redirect to Stripe) and the return page;
   - order tracking and order history;
   - account settings, privacy policy and terms;
   - the QR link landing page (open the app, or go to the app stores).
   - Browser tests (Playwright) for each flow run in CI.
4. **Notifications:** order emails (paid, ready, out for delivery, refunded) through SES, in Swedish and English.
5. **Admin console (minimum):** find an order, see its history, refund, change prices.
6. **Go-live checks:**
   - Stripe live mode (ADR 0007 checklist);
   - legal texts;
   - load test at exam-week peak;
   - a database restore drill;
   - a security review of the live configuration;
   - alarms tested end to end.
7. **Launch:** papperdash.se with online ordering. The first fulfilment path needs either the delivery integration or a staffed pickup point until stations exist (a decision for you).

After launch: delivery partner integration, stations and lockers (simulator, then the Lund pilot), then the mobile app.

## Decisions still needed from you
See [open questions](requirements/open-questions.md). For going live, the most urgent are:
- the company details and Stripe account;
- the AWS account owner;
- the legal texts;
- which delivery partner to integrate first;
- how the first orders are fulfilled before stations exist.
