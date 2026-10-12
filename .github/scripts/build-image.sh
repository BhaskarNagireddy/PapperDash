#!/usr/bin/env bash
# Builds the production image for CI.
#
# The Node base image normally comes from AWS's public mirror (public.ecr.aws). It limits anonymous downloads
# per address, and GitHub's runners share addresses, so it sometimes answers "429 Too Many Requests" before
# anything is built (CI incident 2026-10-12-004). We try the mirror twice, then fall back to Docker Hub, which
# serves the same official image. The build itself is identical either way.
set -euo pipefail

TAG="${1:-papperdash-core:ci}"
SOURCES=(
  "public.ecr.aws/docker/library/node:22-bookworm-slim"
  "public.ecr.aws/docker/library/node:22-bookworm-slim"
  "docker.io/library/node:22-bookworm-slim"
)

for i in "${!SOURCES[@]}"; do
  base="${SOURCES[$i]}"
  echo "::group::Build attempt $((i + 1)) of ${#SOURCES[@]} (base image: $base)"
  if docker build --build-arg "NODE_IMAGE=$base" -f services/core/Dockerfile -t "$TAG" .; then
    echo "::endgroup::"
    echo "Built $TAG from $base"
    exit 0
  fi
  echo "::endgroup::"
  echo "::warning::Image build attempt $((i + 1)) failed (base image $base); see the log above. Retrying with the next source."
  sleep $(((i + 1) * 15))
done

echo "::error::The image could not be built from any base image source. If every attempt shows '429 Too Many Requests', this is a registry limit, not a code problem: re-run the job. See docs/engineering/ci-incidents/README.md"
exit 1
