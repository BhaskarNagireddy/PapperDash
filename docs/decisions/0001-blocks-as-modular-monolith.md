# ADR 0001: Blocks, deployed as a modular monolith first

- Status: Accepted (client approved 2026-09-27)
- Date: 2026-09-27

## Context
The client requires the product to be built as independent blocks so that changing one block does not affect the others, and to scale from a Lund pilot to several countries. Phase 1 is online ordering with courier delivery, run by a small team.

## Decision
Enforce block boundaries at the code and data level (own schema, contracts, events via outbox, lint-enforced imports), but deploy the business blocks in one NestJS process at launch. CPU-heavy document processing, station connectivity and the station agent are separate deployables from day one.

## Consequences
- One service to run, monitor and pay for in Phase 1; blocks still change independently.
- Extracting a block into its own service later changes only its transport, not its code or data.
- Requires discipline: the boundary lint rule is a CI gate, not a guideline.

## Alternatives considered
Microservices from day one: independent scaling, but roughly 14 services, 14 pipelines and distributed transactions before there is demand to justify them.
