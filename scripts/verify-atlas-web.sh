#!/bin/bash
# Prove the atlas web host serves HEAD: commit, one image, one catalog count. Non-zero otherwise.
set -uo pipefail

URL="${ATLAS_WEB_URL:-http://atlas-world.joymify.local.com}"
RETRY="${ATLAS_WEB_RETRY_SECONDS:-60}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
# deploy-local.sh passes the commit it built, so a branch that moves mid-deploy can't fail this falsely.
WANT_COMMIT="$(git -C "$REPO_ROOT" rev-parse "${ATLAS_WEB_COMMIT:-HEAD}^{commit}")"

field() { python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1]))' "$1"; }
md5_of() { python3 -c 'import hashlib,sys; print(hashlib.md5(sys.stdin.buffer.read(), usedforsecurity=False).hexdigest())'; }

WANT_RELEASE="$(git -C "$REPO_ROOT" show "$WANT_COMMIT:.release.json" | field version)"
EXPORT="$(mktemp -d)"
trap 'rm -rf "$EXPORT"' EXIT

# The rollout gap is normal, so a wrong commit retries too. Read the JSON, not a status (C9).
deadline=$(( $(date +%s) + RETRY ))
got_commit=""
while :; do
  body="$(curl -fsS --max-time 5 "$URL/api/runtime" 2>"$EXPORT/curl.err")"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    got_commit="$(printf '%s' "$body" | field commit 2>/dev/null)"
    got_release="$(printf '%s' "$body" | field release 2>/dev/null)"
    [ "$got_commit" = "$WANT_COMMIT" ] && [ "$got_release" = "$WANT_RELEASE" ] && break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    if [ "$rc" -ne 0 ]; then
      echo "❌ atlas web unreachable at $URL: $(cat "$EXPORT/curl.err")"
    else
      echo "❌ atlas web serves commit $got_commit release $got_release; expected commit $WANT_COMMIT release $WANT_RELEASE"
    fi
    exit 1
  fi
  sleep 2
done

# Not LFS: git show returns a pointer for LFS paths (C5).
ART="$(git -C "$REPO_ROOT" ls-tree -r --name-only "$WANT_COMMIT" -- content/concept-art/images | grep -E "\.webp$" | head -1)"
if [ -z "$ART" ]; then
  echo "❌ no concept-art .webp is tracked, so nothing can be compared"
  exit 1
fi
want_md5="$(git -C "$REPO_ROOT" show "$WANT_COMMIT:$ART" | md5_of)"
got_md5="$(curl -fsS --max-time 20 "$URL/$ART" | md5_of)"
if [ "$want_md5" != "$got_md5" ]; then
  echo "❌ $ART md5 is $got_md5; $WANT_COMMIT has $want_md5"
  exit 1
fi

git -C "$REPO_ROOT" archive --format=tar "$WANT_COMMIT" scripts contracts/content content | tar -x -C "$EXPORT"
python3 "$EXPORT/scripts/build_catalog_db.py" >/dev/null || { echo "❌ local catalog build failed"; exit 1; }
want_count="$(python3 -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("SELECT count(*) FROM world_continents").fetchone()[0])' "$EXPORT/build/catalog.sqlite")"
got_count="$(curl -fsS --max-time 20 -G --data-urlencode 'q=SELECT count(*) FROM world_continents' "$URL/api/sql" | python3 -c 'import json,sys; print(json.load(sys.stdin)["rows"][0][0])')"
if [ "$want_count" != "$got_count" ]; then
  echo "❌ world_continents is $got_count on the host; a catalog built from HEAD has $want_count"
  exit 1
fi

echo "✅ atlas web serves $WANT_RELEASE $WANT_COMMIT, $ART md5 $got_md5, world_continents $got_count"
