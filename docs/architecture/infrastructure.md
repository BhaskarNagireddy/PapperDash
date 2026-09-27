# Infrastructure

All production data stays in **AWS eu-north-1 (Stockholm)** for GDPR. Everything is defined in Terraform under `infra/terraform`; nothing is created by hand.

## Environments

| Environment | Purpose | Deployed |
| --- | --- | --- |
| `dev` | Local: Docker Compose (Postgres, Redis, MinIO, Stripe CLI, station simulator) | On the developer's machine |
| `staging` | Full AWS copy at small size, Stripe test mode, simulated stations | Every merge to `main` |
| `production` | papperdash.se | Tagged release, manual approval |

## AWS components

| Need | Service |
| --- | --- |
| Containers (core, doc-worker, gateway, web, admin) | ECS Fargate, one service per deployable, rolling deploys |
| Database | RDS PostgreSQL 16, Multi-AZ in production, one schema per block, automated backups + PITR |
| Queue / cache / rate limits | ElastiCache Redis |
| Documents | S3 with SSE-KMS, block public access, lifecycle rule as a safety net behind the retention job |
| CDN and TLS | CloudFront + ACM certificates, AWS WAF |
| Email | Amazon SES (eu-north-1) |
| Secrets | AWS Secrets Manager |
| Logs, metrics, alerts | CloudWatch + OpenTelemetry traces; alarms to the admin console and on-call email/SMS |

## Domain: papperdash.se (Loopia)

Keep the registration at Loopia; move DNS hosting to Route 53 so Terraform manages records and certificates:

1. Terraform creates a Route 53 hosted zone for `papperdash.se` and outputs four name servers.
2. In Loopia Customer Zone → the domain → DNS / name servers, replace Loopia's name servers with those four.
3. Terraform then manages `papperdash.se`, `www`, `admin`, `api`, `stations` and the SES email records (SPF, DKIM, DMARC).

(If you prefer to keep DNS at Loopia, we add CNAME/ALIAS records there by hand instead; certificates still validate through a DNS record.)

## CI/CD (GitHub Actions)

- On every pull request: install, lint (including block-boundary rules), typecheck, unit tests, contract tests, build.
- On merge to `main`: build container images, push to ECR, run database migrations per block, deploy to staging, run end-to-end tests against the station simulator.
- On release tag: same images promoted to production after manual approval. Rolling deploys keep the platform up; station agents update themselves in a maintenance window and only when idle.
