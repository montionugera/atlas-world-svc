#!/bin/bash
# Build atlas-world-web from one commit (default HEAD). A git export keeps uncommitted and ignored files out.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
# Resolved once: the release branch can move between two reads, and the tag, export and baked commit must agree.
COMMIT="$(git -C "$REPO_ROOT" rev-parse "${1:-HEAD}^{commit}")"
EXPORT="$(mktemp -d)"
trap 'rm -rf "$EXPORT" "$EXPORT.tar"' EXIT

git -C "$REPO_ROOT" archive --format=tar -o "$EXPORT.tar" "$COMMIT"
tar -xf "$EXPORT.tar" -C "$EXPORT"
chmod -R a+rX "$EXPORT"  # uid 65534 must read it whatever the builder's umask
RELEASE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$EXPORT/.release.json")"

if [ -n "${ATLAS_WEB_PRUNE:-}" ]; then
  echo "⚠ test only: removing $ATLAS_WEB_PRUNE from the export"
  rm -rf "${EXPORT:?}/$ATLAS_WEB_PRUNE"
fi

DOCKER_BUILDKIT=1 docker build \
  -t atlas-world-web:local -t "atlas-world-web:$COMMIT" \
  --build-arg "ATLAS_RELEASE=$RELEASE" --build-arg "ATLAS_COMMIT=$COMMIT" \
  -f "$EXPORT/Dockerfile.atlas-web" "$EXPORT"

# Keep the newest earlier commit tag for rollback. Each commit image is a few hundred MB.
# Only 40-hex tags are commits; anything else (latest, backup) is never pruned.
docker images atlas-world-web --format '{{.Tag}}' | { grep -E '^[0-9a-f]{40}$' | grep -v "^$COMMIT$" || true; } | tail -n +2 | while read -r tag; do
  docker rmi "atlas-world-web:$tag" >/dev/null || true
done
