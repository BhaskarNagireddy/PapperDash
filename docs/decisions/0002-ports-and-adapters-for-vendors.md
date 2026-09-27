# ADR 0002: Every vendor behind a port

- Status: Accepted
- Date: 2026-09-27

## Decision
Payments, couriers, printers, lockers, email, SMS and document conversion are reached only through port interfaces in `packages/contracts`. Each vendor is an adapter selected per market in configuration.

## Consequences
Adding Swish or a Danish courier is one adapter plus a config change. Business logic is testable against in-memory fakes.
