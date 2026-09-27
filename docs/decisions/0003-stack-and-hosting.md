# ADR 0003: TypeScript end to end on AWS Stockholm

- Status: Accepted (client decision)
- Date: 2026-09-27

## Decision
Next.js for web surfaces, NestJS for services, Node for the station agent, PostgreSQL + Redis, hosted in AWS eu-north-1 with Terraform. Stripe for payments. pnpm + Turborepo monorepo.

## Consequences
One language and shared types across every block, including the station. Data residency in Sweden.
