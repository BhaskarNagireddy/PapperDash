# PapperDash

Automated cloud-to-print fulfilment platform: self-service printing, secure locker pickup and last-mile delivery — no student card, university ID or library account required.

Production domain: [papperdash.se](https://www.papperdash.se) (registered at Loopia).

## Status

**Phase 0 — architecture blueprint, awaiting sign-off.** No service code has been written yet. The documents below describe what will be built and how it is split into independent blocks. Review them before implementation starts.

| Read this | For |
| --- | --- |
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
| Hosting | AWS eu-north-1 (Stockholm), Terraform |
| Payments | Stripe (cards, Apple/Google Pay, Klarna); Swish later as another adapter |
| Delivery | Own riders using a courier web app; partner couriers later as adapters |
| Documents | PDF, JPG, PNG natively; DOCX/XLSX/PPTX converted to PDF server-side |
| Retention | Files deleted 24 h after fulfilment; unpaid uploads after 2 h |
| Languages | Swedish and English from day one |
| Design system | [PapperDash Design System](https://claude.ai/artifact/CWmFMib7Po7CbL4ujqjuqQ) (proposal) |
