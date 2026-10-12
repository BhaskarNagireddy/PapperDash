#!/usr/bin/env bash
# Installs LibreOffice Writer for the Word-to-PDF conversion tests.
#
# Ubuntu's package mirrors sometimes stop responding mid-download. Plain apt-get then waits silently until
# the whole job is cancelled (CI incident 2026-10-12-001). Here every network read times out after 30 s,
# apt retries each file, and the whole update + install is retried up to 3 times with a hard limit, so a
# stalled mirror costs minutes and fails with a clear message instead of hanging.
set -euo pipefail

APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Dpkg::Use-Pty=0)

for attempt in 1 2 3; do
  echo "::group::LibreOffice install, attempt $attempt of 3"
  if sudo timeout 90 apt-get "${APT_OPTS[@]}" update -q &&
    sudo timeout 180 apt-get "${APT_OPTS[@]}" install -y -q --no-install-recommends libreoffice-writer-nogui; then
    echo "::endgroup::"
    soffice --version
    exit 0
  fi
  echo "::endgroup::"
  echo "::warning::LibreOffice install attempt $attempt failed or timed out (package mirror slow or unreachable); retrying"
  sleep $((attempt * 10))
done

echo "::error::Could not install LibreOffice after 3 attempts: the Ubuntu package mirror is unreachable. This is an infrastructure failure, not a test failure. Re-run the job; see docs/engineering/ci-incidents/README.md"
exit 1
