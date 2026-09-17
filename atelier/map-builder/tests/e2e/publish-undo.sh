#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# publish-undo.sh — map-builder Gate 2 end-to-end: draft → publish → undo.
#
# A REAL publish and a REAL undo, with the real tools (generate-world,
# promote-world, check_content, render-sheet, rsvg-convert), run against a
# THROWAWAY git worktree of this repo — never the caller's working tree and
# never a shared dev server. The one time this was done by hand against the
# live dev server it rewrote ~90 tracked files under content/ and
# game-client/assets/art/maps/; the disposable worktree makes that mistake
# structurally impossible here.
#
# Usage (from scripts/integration.sh, or by hand):
#   REPO_ROOT=$PWD bash atelier/map-builder/tests/e2e/publish-undo.sh
#
# Prints `e2e: OK` and exits 0; any failed assertion names its step and exits 1.
# =============================================================================

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)}"
SEED="3f81c0aa9d2e5b17"
DRAFT_TIMEOUT_S=60
COMPOSITE_TIMEOUT_S=900   # publish / undo shell out to the whole render chain

fail() { echo "e2e: FAIL — $*" >&2; exit 1; }

# --- 0. Preconditions --------------------------------------------------------
command -v git >/dev/null || fail "git not found"
command -v node >/dev/null || fail "node not found"
command -v curl >/dev/null || fail "curl not found"
command -v rsvg-convert >/dev/null || fail "rsvg-convert not found (render-sheet --png needs it)"
test -d "$REPO_ROOT/scripts/node_modules/js-yaml" \
  || fail "scripts/ deps missing (promote-world runs check_content, which imports js-yaml/ajv/sharp) — run: npm ci --prefix $REPO_ROOT/scripts"

# A SIGKILL skips the trap below, so clear leftovers from earlier runs first.
# Both the worktree path and the branch carry `map-builder-e2e-<pid>`; a
# leftover whose pid is still alive belongs to a concurrent run and is left
# alone (the path match also catches a run that died between `worktree add`
# and `checkout -b`, which has no branch yet).
owner_alive() { kill -0 "${1##*-}" 2>/dev/null; }
git -C "$REPO_ROOT" worktree prune
git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree .*\/map-builder-e2e-[0-9]+$/{print $2}' |
  while IFS= read -r stale; do
    owner_alive "$stale" && { echo "e2e: skipping live worktree $stale"; continue; }
    echo "e2e: removing stale worktree $stale"
    git -C "$REPO_ROOT" worktree remove --force "$stale" || true
  done
git -C "$REPO_ROOT" worktree prune
git -C "$REPO_ROOT" branch --list 'tmp/map-builder-e2e-*' --format='%(refname:short)' |
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    owner_alive "$b" && continue
    git -C "$REPO_ROOT" branch -D "$b" >/dev/null 2>&1 && echo "e2e: deleted stale branch $b"
  done

# --- 1. Throwaway worktree ---------------------------------------------------
tmp="$(mktemp -d)"
WT="$tmp/map-builder-e2e-$$"
BRANCH="tmp/map-builder-e2e-$$"
SERVER_PID=""

cleanup() {
  # $1, when passed, is the exit code to propagate (128+signum, from the
  # INT/TERM traps below); the bare EXIT trap passes nothing, so this falls
  # back to $? — the real exit status of the script at that point. Without
  # this, a signal trap would read $? as whatever command happened to be
  # running when the signal arrived (e.g. `sleep` in poll_job, which exits
  # 0) and wrongly report success for an interrupted run.
  local rc="${1:-$?}"
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -f "$WT/scripts/node_modules"   # the symlink, never its target
  if [ -d "$WT" ]; then
    git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"
    git -C "$REPO_ROOT" worktree prune
  fi
  git -C "$REPO_ROOT" branch -D "$BRANCH" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  exit "$rc"
}
trap cleanup EXIT
trap 'cleanup 130' INT
trap 'cleanup 143' TERM

git -C "$REPO_ROOT" worktree add --quiet --detach "$WT" HEAD || fail "step 1: git worktree add"
git -C "$WT" checkout -q -b "$BRANCH" || fail "step 1: git checkout -b $BRANCH"
cur="$(git -C "$WT" branch --show-current)"
[ "$cur" = "$BRANCH" ] || fail "step 1: expected branch $BRANCH, on '$cur'"
[ "$cur" != "main" ] || fail "step 1: refusing to run on main"
ln -s "$REPO_ROOT/scripts/node_modules" "$WT/scripts/node_modules" || fail "step 1: symlink scripts/node_modules"
wt_status="$(git -C "$WT" status --porcelain --untracked-files=all)" || fail "step 1: git status failed"
[ -z "$wt_status" ] || {
  echo "$wt_status"
  fail "step 1: fresh worktree is not clean (see above)"
}
echo "e2e: throwaway worktree $WT on $BRANCH (source: $REPO_ROOT @ $(git -C "$WT" rev-parse --short HEAD))"

# --- 2. Server against the throwaway worktree ---------------------------------
mkdir -p "$tmp/data"
(cd "$WT" && exec node atelier/map-builder/server.mjs --port 0 --repo-root "$WT" --data-dir "$tmp/data") \
  > "$tmp/server.log" 2>&1 &
SERVER_PID=$!
PORT=""
for _ in $(seq 1 60); do
  PORT="$(sed -nE 's#^map-builder: listening on http://[^:]+:([0-9]+)/.*#\1#p' "$tmp/server.log" | head -n1)"
  [ -n "$PORT" ] && break
  kill -0 "$SERVER_PID" 2>/dev/null || { cat "$tmp/server.log"; fail "step 2: server exited before listening"; }
  sleep 0.5
done
[ -n "$PORT" ] || { cat "$tmp/server.log"; fail "step 2: no listening line within 30 s"; }
BASE="http://127.0.0.1:$PORT"
echo "e2e: server pid $SERVER_PID on $BASE (repo-root $WT)"

api_get()  { curl -sS "$BASE$1"; }
api_post() { curl -sS -H 'content-type: application/json' -X POST -d "$2" "$BASE$1"; }
# jq_node '<js body over j>' — reads JSON on stdin, prints the body's return value
# (no trailing newline, so $(...) captures are exact); a throw exits non-zero.
jq_node()  { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const f=new Function("j",process.argv[1]);const r=f(j);process.stdout.write(r===undefined?"":String(r))})' "$1"; }

# poll_job <id> <timeout-s> → prints final status; exits non-zero on timeout
poll_job() {
  local id="$1" limit="$2" status="" i
  for ((i = 0; i < limit * 2; i++)); do
    status="$(api_get "/api/jobs/$id" | jq_node 'return j.status')"
    case "$status" in
      succeeded|failed|cancelled|interrupted) echo "$status"; return 0 ;;
    esac
    sleep 0.5
  done
  echo "timeout"; return 1
}

print_log() { echo "--- job $1 log ---"; api_get "/api/jobs/$1/log" | tail -n 40; echo "--- end log ---"; }

# --- 3. Draft ----------------------------------------------------------------
DRAFT_ID="$(api_post /api/jobs "{\"kind\":\"draft\",\"seed\":\"$SEED\"}" | jq_node 'return j.jobs[0].id')"
[ -n "$DRAFT_ID" ] || fail "step 3: POST /api/jobs returned no job id"
st="$(poll_job "$DRAFT_ID" "$DRAFT_TIMEOUT_S")"
[ "$st" = "succeeded" ] || { print_log "$DRAFT_ID"; fail "step 3: draft $DRAFT_ID ended '$st' (expected succeeded within ${DRAFT_TIMEOUT_S}s)"; }
api_get "/api/jobs/$DRAFT_ID" | jq_node '
  if (j.steps.length !== 18) throw new Error("steps.length=" + j.steps.length + " (expected 18)");
  if (!(j.metrics && j.metrics.settlements > 0)) throw new Error("metrics.settlements=" + JSON.stringify(j.metrics));
  return "steps=" + j.steps.length + " settlements=" + j.metrics.settlements + "\n"' \
  || fail "step 3: draft assertions"
echo "e2e: draft $DRAFT_ID succeeded"

# --- 4. Review ---------------------------------------------------------------
api_get "/api/drafts/$DRAFT_ID/review" | jq_node '
  if (!(j.dryRun && j.dryRun.written > 0)) throw new Error("dryRun=" + JSON.stringify(j.dryRun));
  if (!(Array.isArray(j.deltas) && j.deltas.length > 0)) throw new Error("deltas=" + JSON.stringify(j.deltas));
  return "dryRun.written=" + j.dryRun.written + " deltas=" + j.deltas.length + "\n"' \
  || fail "step 4: review assertions"
echo "e2e: review shows a non-empty dry run"

# --- 5. Pre-publish record ---------------------------------------------------
wt_status="$(git -C "$WT" status --porcelain --untracked-files=all)" || fail "step 5: git status failed"
before=0
[ -z "$wt_status" ] || before="$(printf '%s\n' "$wt_status" | wc -l | tr -d ' ')"
[ "$before" = "0" ] || fail "step 5: tree dirty before publish ($before entries)"
PRE_SEED="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).seed)' "$WT/content/world/fabric/world.json")"
[ "$PRE_SEED" != "$SEED" ] || fail "step 5: committed seed already equals the draft seed — the publish would be a no-op"
(cd "$WT" && node -e 'import("./atelier/map-builder/lib/snapshots.mjs").then(m => console.log(m.snapshotSet({repoRoot: process.cwd()}).join("\n")))') \
  | sort > "$tmp/set.txt" || fail "step 5: snapshotSet"
[ -s "$tmp/set.txt" ] || fail "step 5: snapshot set is empty"
echo "e2e: pre-publish seed $PRE_SEED, snapshot set $(wc -l < "$tmp/set.txt" | tr -d ' ') files"

# --- 6. Publish --------------------------------------------------------------
PUB_ID="$(api_post /api/publish "{\"draftJobId\":\"$DRAFT_ID\",\"confirm\":true}" | jq_node 'return j.job.id')"
[ -n "$PUB_ID" ] || fail "step 6: POST /api/publish returned no job id"
st="$(poll_job "$PUB_ID" "$COMPOSITE_TIMEOUT_S")"
[ "$st" = "succeeded" ] || { print_log "$PUB_ID"; fail "step 6: publish $PUB_ID ended '$st'"; }
POST_SEED="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).seed)' "$WT/content/world/fabric/world.json")"
[ "$POST_SEED" = "$SEED" ] || fail "step 6: world.json seed is '$POST_SEED', expected $SEED"
(cd "$WT" && node scripts/check_render_lock.mjs --check) || fail "step 6: check_render_lock --check after publish"
(cd "$WT" && node scripts/check_spine_emit.mjs --check --content-root content) || fail "step 6: check_spine_emit --check after publish"
git -C "$WT" status --porcelain --untracked-files=all | awk '{print $2}' | sort > "$tmp/changed.txt"
[ -s "$tmp/changed.txt" ] || fail "step 6: publish changed nothing"
comm -23 "$tmp/changed.txt" "$tmp/set.txt" > "$tmp/offenders.txt"
if [ -s "$tmp/offenders.txt" ]; then
  echo "changed files NOT in the snapshot set:"; cat "$tmp/offenders.txt"
  fail "step 6: publish touched files outside the snapshot set"
fi
echo "e2e: publish $PUB_ID succeeded — seed $POST_SEED, $(wc -l < "$tmp/changed.txt" | tr -d ' ') changed files, all inside the snapshot set"

# --- 7. Undo -----------------------------------------------------------------
SNAP_ID="$(api_get /api/snapshots | jq_node 'return j.snapshots[0] ? j.snapshots[0].id : ""')"
[ -n "$SNAP_ID" ] || fail "step 7: GET /api/snapshots returned none"
UNDO_ID="$(api_post /api/undo "{\"snapshotId\":\"$SNAP_ID\"}" | jq_node 'return j.job.id')"
[ -n "$UNDO_ID" ] || fail "step 7: POST /api/undo returned no job id"
st="$(poll_job "$UNDO_ID" "$COMPOSITE_TIMEOUT_S")"
[ "$st" = "succeeded" ] || { print_log "$UNDO_ID"; fail "step 7: undo $UNDO_ID ended '$st'"; }
UNDO_SEED="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).seed)' "$WT/content/world/fabric/world.json")"
[ "$UNDO_SEED" = "$PRE_SEED" ] || fail "step 7: seed after undo is '$UNDO_SEED', expected $PRE_SEED"
wt_status="$(git -C "$WT" status --porcelain --untracked-files=all)" || fail "step 7: git status failed"
if [ -n "$wt_status" ]; then
  echo "$wt_status"
  fail "step 7: tree not clean after undo (restore is supposed to be byte-for-byte)"
fi
(cd "$WT" && node scripts/check_render_lock.mjs --check) || fail "step 7: check_render_lock --check after undo"
(cd "$WT" && node scripts/check_spine_emit.mjs --check --content-root content) || fail "step 7: check_spine_emit --check after undo"
echo "e2e: undo $UNDO_ID succeeded — seed back to $UNDO_SEED, tree clean"

echo "e2e: OK"
exit 0
