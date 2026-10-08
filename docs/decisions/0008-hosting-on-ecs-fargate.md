# ADR 0008: Run the backend on ECS Fargate across two availability zones

- Status: Accepted (client decision 2026-10-08)
- Date: 2026-10-08

## Context
The proposal was to run Kubernetes on a single server, with several pods sharing the traffic. Several pods spread the load, but they all depend on that one machine. A hardware fault, a reboot for security patches, or an outage in that data centre takes every pod, and so papperdash.se, offline at once. Reliability needs copies on separate machines in separate AWS data centres (availability zones, AZs).

## Decision
Run the backend as **Docker containers on Amazon ECS with Fargate**, at least **two copies (tasks), one in each of two AZs** in eu-north-1 (Stockholm), behind an **Application Load Balancer**. See [deployment](../architecture/deployment.md) for the full design.

| Option | One server or data centre fails | Who patches servers | Operational effort |
| --- | --- | --- | --- |
| Kubernetes (k3s) on one EC2 server | Site down | Us | Medium |
| EKS (managed Kubernetes) on 2+ servers | Site stays up | Us (nodes) | High |
| **ECS Fargate, 2+ tasks in 2 AZs** | **Site stays up** | **AWS** | **Low** |

## Consequences
- **Same image everywhere:** the image `services/core/Dockerfile` builds is identical on a laptop, in CI and in production. CI builds it, boots it against PostgreSQL 16 and scans it on every PR.
- **Moving to Kubernetes later stays possible:** if PapperDash later runs many services and wants Kubernetes, the same images move to EKS; only the deployment definitions change.
- **No servers to manage:** there is no SSH access and no OS patching. Logs and metrics go to CloudWatch.
