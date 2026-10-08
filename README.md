# PapperDash

Automated cloud-to-print fulfilment platform: self-service printing, secure locker pickup and last-mile delivery — no student card, university ID or library account required.

Production domain: [papperdash.se](https://www.papperdash.se) (registered at Loopia).

## Status

**Phase 1 in progress.** Architecture approved. Built so far: the monorepo, shared contracts, the platform layer (database, outbox, event bus) and five blocks — **identity** (email + password, Google, Apple, QR sign-in at stations), **documents** (upload, file checks, conversion to PDF, page counting, automatic deletion), **orders** (priced orders and the controlled order state machine), **pricing** (page-count tiers and order limits, editable by admins) and **payments** (Stripe Checkout with card, Apple Pay, Google Pay and Klarna; refunds; Stripe Tax ready but off until VAT registration).

## Getting started

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm build && pnpm test      # in-memory Postgres, no Docker needed; Word conversion tests need LibreOffice Writer
pnpm lint                    # ESLint + block-boundary check

# Run the core API locally
pnpm dev:infra               # Postgres, Redis, MinIO (S3), Mailpit via Docker Compose
cp services/core/.env.example services/core/.env
pnpm --filter @papperdash/core build && pnpm --filter @papperdash/core db:migrate
pnpm dev:core                # http://localhost:4000/health
```

## Repository

| Path | What |
| --- | --- |
| `packages/contracts` | The only shared code: DTOs, events, the order state machine, vendor ports |
| `services/core` | The business blocks, one folder each under `src/blocks/` ([API](services/core/README.md)) |
| `docs/` | Architecture, decisions, requirements |

| Read this | For |
| --- | --- |
| [Status and roadmap](docs/roadmap.md) | What is built, what is next, and the path to going live |
| [Deployment](docs/architecture/deployment.md) | How papperdash.se runs on AWS (ECS Fargate, 2 zones) and stays up |
| [Testing and quality standards](docs/engineering/testing.md) | Every check a pull request must pass, and how leaks and false positives are handled |
| [Architecture overview](docs/architecture/overview.md) | The block map and how blocks talk to each other |
| [Blocks](docs/architecture/blocks.md) | What each block owns, exposes and depends on |
| [Order lifecycle](docs/architecture/order-lifecycle.md) | The controlled order state machine shared by every surface |
| [Infrastructure](docs/architecture/infrastructure.md) | AWS Stockholm, environments, CI/CD, domain setup |
| [Decisions](docs/decisions/) | Architecture decision records (ADRs) |
| [Requirements traceability](docs/requirements/traceability.md) | Every requirement mapped to the block that delivers it |
| [Open questions](docs/requirements/open-questions.md) | What still needs a client decision |

## Confirmed decisions

| Area | Decision |
| --- | --- |
| First release | Phase 1: online ordering + courier delivery in Lund/Malmö. Station and locker blocks are built against a hardware simulator. |
| Stack | TypeScript end to end: Next.js, NestJS, PostgreSQL, Redis, Node station agent |
| Hosting | AWS eu-north-1 (Stockholm): Docker containers on ECS Fargate across 2 availability zones, Terraform ([ADR 0008](docs/decisions/0008-hosting-on-ecs-fargate.md)) |
| Payments | Stripe Checkout Sessions (cards, Apple/Google Pay, Klarna); Stripe Tax off until VAT registration; Swish later ([ADR 0007](docs/decisions/0007-payments-with-stripe.md)) |
| Delivery | Delivery partners' apps (e.g. Wolt, Foodora, Bolt); they quote and charge the delivery fee ([ADR 0006](docs/decisions/0006-delivery-partners-and-bw-prototype.md)) |
| Documents | PDF, JPG, PNG natively; DOCX/XLSX/PPTX converted to PDF server-side; max 50 printed pages per order, 50 MB per file |
| Retention | Files deleted 24 h after fulfilment; unpaid uploads after 2 h |
| Languages | Swedish and English from day one |
| Design system | [PapperDash Design System](https://claude.ai/artifact/CWmFMib7Po7CbL4ujqjuqQ) (approved for now) |
| Deployment | All blocks in one server application at launch ([ADR 0001](docs/decisions/0001-blocks-as-modular-monolith.md)) |
| Channels | iOS and Android apps (React Native) + website ([ADR 0005](docs/decisions/0005-mobile-apps-and-website.md)) |
| Login | Email + password, Google, Apple; QR sign-in at stations ([ADR 0004](docs/decisions/0004-login-methods.md)) |
| Launch prices | Black and white only (prototype). Per order by printed pages, VAT incl.: 1–5 → 10 kr, 6–15 → 16 kr, 16–25 → 25 kr, 26–50 → 50 kr |
