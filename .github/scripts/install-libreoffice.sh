#!/usr/bin/env bash
# Installs LibreOffice Writer for the Word-to-PDF conversion tests.
#
# Ubuntu's package mirrors sometimes stop responding mid-download (CI incidents 2026-10-12-001 and -005).
# So the downloaded .deb files are kept in a cache directory that CI saves between runs (actions/cache):
#   1. With a filled cache, install those files directly with dpkg: no package lists, no mirror contact.
#   2. Otherwise, or if the cached set no longer fits the runner image, download from the mirror with 30 s
#      network timeouts, apt's own retries and up to 3 attempts. The files land in the cache for next time.
set -euo pipefail

CACHE_DIR="${LIBREOFFICE_DEB_CACHE:-$HOME/.cache/apt-libreoffice}"
APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Dpkg::Use-Pty=0)
mkdir -p "$CACHE_DIR/partial"

# Leave the cache owned by the runner user and free of apt's lock files, so actions/cache can save it.
tidy_cache() {
  sudo rm -rf "$CACHE_DIR/partial" "$CACHE_DIR/lock"
  sudo chown -R "$(id -u):$(id -g)" "$CACHE_DIR"
}

shopt -s nullglob
cached=("$CACHE_DIR"/*.deb)
if ((${#cached[@]})); then
  echo "::group::Installing LibreOffice from ${#cached[@]} cached packages (no package mirror needed)"
  if sudo timeout 300 dpkg -i "${cached[@]}"; then
    echo "::endgroup::"
    tidy_cache
    soffice --version
    exit 0
  fi
  echo "::endgroup::"
  # A newer runner image can need a package the cache lacks; the mirror install below repairs that.
  echo "::warning::The cached LibreOffice packages no longer fit this runner image; downloading from the mirror instead"
fi

for attempt in 1 2 3; do
  echo "::group::LibreOffice install from the package mirror, attempt $attempt of 3"
  # The first install (no package names) repairs anything a failed cached install left half-done.
  if sudo timeout 90 apt-get "${APT_OPTS[@]}" update -q &&
    sudo timeout 180 apt-get "${APT_OPTS[@]}" -o "Dir::Cache::Archives=$CACHE_DIR/" install -f -y -q &&
    sudo timeout 180 apt-get "${APT_OPTS[@]}" -o "Dir::Cache::Archives=$CACHE_DIR/" install -y -q --no-install-recommends libreoffice-writer-nogui; then
    echo "::endgroup::"
    tidy_cache
    echo "Cached $(ls "$CACHE_DIR"/*.deb 2>/dev/null | wc -l) packages for the next run"
    soffice --version
    exit 0
  fi
  echo "::endgroup::"
  echo "::warning::LibreOffice install attempt $attempt failed or timed out (package mirror slow or unreachable); retrying"
  sleep $((attempt * 10))
done

tidy_cache
echo "::error::Could not install LibreOffice after 3 attempts: the Ubuntu package mirror is unreachable. This is an infrastructure failure, not a test failure. Re-run the job; see docs/engineering/ci-incidents/README.md"
exit 1
