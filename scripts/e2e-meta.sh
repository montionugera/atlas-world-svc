#!/usr/bin/env bash
set -uo pipefail

# =============================================================================
# e2e-meta.sh — RPC-level end-to-end test of the meta pipeline (Nakama):
#   device auth -> accept_quest -> report_match_events (S2S, x2 incl. replay)
#   -> claim_quest_reward -> assert profile/inventory/quest state.
#
# This drives the exact RPC surface Colyseus's MetaEventReporter/NakamaMetaBackend
# exercise against a live Nakama, without needing a full Colyseus match (which
# is flaky to script end-to-end). Requires: docker, curl, jq.
#
# Usage: ./scripts/e2e-meta.sh
# Exit code: 0 on all assertions passing, 1 on any failure.
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NAKAMA_HTTP="${NAKAMA_HTTP:-http://localhost:7350}"
SERVER_KEY="${SERVER_KEY:-defaultkey}"
HTTP_KEY="${HTTP_KEY:-atlas_dev_http_key}"
RUN_ID="e2e-$(date +%s)-$$"
DEVICE_ID="device-${RUN_ID}"
MATCH_ID="match-${RUN_ID}"
QUEST_ID="q_boar_5"
REWARD_ITEM="potion_minor"
REWARD_XP=100

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1"
}

fatal() {
  echo "FAIL: $1 (fatal, aborting)"
  echo ""
  echo "===================================="
  echo "RESULT: FAIL ($PASS_COUNT passed, $((FAIL_COUNT + 1)) failed)"
  echo "===================================="
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "required command '$1' not found on PATH"
}

require_cmd curl
require_cmd jq
require_cmd docker

# --- 1. Ensure the stack is up and healthy -----------------------------------
echo "--- [1/8] Ensuring docker stack is up (atlas-database, atlas-nakama) ---"
docker compose up -d atlas-database atlas-nakama >/dev/null 2>&1 || fatal "docker compose up failed"

wait_healthy() {
  local container="$1"
  local tries=40
  for ((i = 1; i <= tries; i++)); do
    local status
    status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")"
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_healthy atlas-world-database || fatal "atlas-world-database did not become healthy in time"
wait_healthy atlas-world-nakama || fatal "atlas-world-nakama did not become healthy in time"
pass "docker stack is up and healthy (atlas-database, atlas-nakama)"

# --- 2. Device-authenticate a fresh Nakama account ---------------------------
echo "--- [2/8] Authenticating device account ($DEVICE_ID) ---"
AUTH_BASIC="$(printf '%s:' "$SERVER_KEY" | base64)"
AUTH_RESP="$(curl -s -X POST "${NAKAMA_HTTP}/v2/account/authenticate/device?create=true&username=${RUN_ID}" \
  -H "Authorization: Basic ${AUTH_BASIC}" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${DEVICE_ID}\"}")"

TOKEN="$(echo "$AUTH_RESP" | jq -r '.token // empty')"
if [ -z "$TOKEN" ]; then
  fatal "device authenticate failed, response: $AUTH_RESP"
fi

# Decode the JWT payload (base64url, no padding) to pull the user id (uid claim)
# without a second round-trip to /v2/account.
JWT_PAYLOAD="$(echo "$TOKEN" | cut -d. -f2)"
JWT_PAYLOAD="$(echo "$JWT_PAYLOAD" | tr '_-' '/+')"
case $((${#JWT_PAYLOAD} % 4)) in
2) JWT_PAYLOAD="${JWT_PAYLOAD}==" ;;
3) JWT_PAYLOAD="${JWT_PAYLOAD}=" ;;
esac
USER_ID="$(echo "$JWT_PAYLOAD" | base64 -d 2>/dev/null | jq -r '.uid // empty')"

if [ -z "$USER_ID" ]; then
  fatal "could not extract userId from session token"
fi
pass "authenticated device -> userId=$USER_ID"

# --- helper: generic owner-scoped storage read (client Bearer auth) ---------
read_storage() {
  local collection="$1"
  curl -s -X POST "${NAKAMA_HTTP}/v2/storage" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"object_ids\":[{\"collection\":\"${collection}\",\"key\":\"main\",\"user_id\":\"${USER_ID}\"}]}" \
    | jq -r '.objects[0].value // "{}"'
}

# --- 3. accept_quest (client RPC) --------------------------------------------
echo "--- [3/8] accept_quest {questId:$QUEST_ID} ---"
ACCEPT_RESP="$(curl -s -w '\n%{http_code}' -X POST "${NAKAMA_HTTP}/v2/rpc/accept_quest?unwrap" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"questId\":\"${QUEST_ID}\"}")"
ACCEPT_HTTP="$(echo "$ACCEPT_RESP" | tail -n1)"
ACCEPT_BODY="$(echo "$ACCEPT_RESP" | sed '$d')"

if [ "$ACCEPT_HTTP" = "200" ] && [ "$(echo "$ACCEPT_BODY" | jq -r '.active[0].questId // empty')" = "$QUEST_ID" ]; then
  pass "accept_quest activated $QUEST_ID"
else
  fatal "accept_quest failed (HTTP $ACCEPT_HTTP): $ACCEPT_BODY"
fi

# --- 4. Simulate the match: report_match_events (S2S) -----------------------
echo "--- [4/8] report_match_events: 5x MOB_KILLED/boar (matchId=$MATCH_ID, seq=1) ---"
EVENTS_JSON="$(jq -n --arg uid "$USER_ID" '[range(5) | {type:"MOB_KILLED", userId:$uid, targetId:"boar", count:1}]')"
BATCH_PAYLOAD="$(jq -n --arg uid "$USER_ID" --arg matchId "$MATCH_ID" --argjson events "$EVENTS_JSON" \
  '{userId:$uid, matchId:$matchId, seq:1, events:$events}')"

REPORT_RESP="$(curl -s -X POST "${NAKAMA_HTTP}/v2/rpc/report_match_events?http_key=${HTTP_KEY}&unwrap" \
  -H "Content-Type: application/json" \
  -d "$BATCH_PAYLOAD")"


# NOTE: jq's `//` alternative operator treats a JSON `false` the same as
# `null` (both are "falsy" to jq), so `.deduped // empty` would silently
# collapse a real `false` into empty string. Read `.deduped` directly instead.
REPORT_DEDUPED="$(echo "$REPORT_RESP" | jq -r '.deduped')"

if [ "$REPORT_DEDUPED" = "false" ]; then
  pass "report_match_events applied the batch (deduped:false)"
else
  fail "report_match_events: expected deduped:false on first application, got: $REPORT_RESP"
fi

# --- 5. Poll quest storage until the objective reads 5/5 (or already completed) ---
echo "--- [5/8] Polling quests storage for 5/5 objective progress ---"
QUEST_STATE=""
for ((i = 1; i <= 10; i++)); do
  QUEST_STATE="$(read_storage quests)"
  ACTIVE_COUNT="$(echo "$QUEST_STATE" | jq -r '.active | length')"
  COMPLETED_MATCH="$(echo "$QUEST_STATE" | jq -r --arg q "$QUEST_ID" '.completed | map(select(.questId == $q)) | length')"
  KILL_PROGRESS="$(echo "$QUEST_STATE" | jq -r --arg q "$QUEST_ID" '.active | map(select(.questId == $q)) | .[0].objectives.kill_boars // empty')"
  if [ "$COMPLETED_MATCH" = "1" ] || [ "$KILL_PROGRESS" = "5" ]; then
    break
  fi
  sleep 1
done

if [ "$(echo "$QUEST_STATE" | jq -r --arg q "$QUEST_ID" '.completed | map(select(.questId == $q)) | length')" = "1" ]; then
  pass "quest $QUEST_ID objective reached 5/5 and moved to completed"
else
  fail "quest $QUEST_ID never reached 5/5 completion; last state: $QUEST_STATE"
fi

# --- 6. claim_quest_reward (client RPC) --------------------------------------
echo "--- [6/8] claim_quest_reward {questId:$QUEST_ID} ---"
CLAIM_RESP="$(curl -s -X POST "${NAKAMA_HTTP}/v2/rpc/claim_quest_reward?unwrap" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"questId\":\"${QUEST_ID}\"}")"

CLAIMED_FLAG="$(echo "$CLAIM_RESP" | jq -r --arg q "$QUEST_ID" '.quests.completed | map(select(.questId == $q)) | .[0].claimed')"
if [ "$CLAIMED_FLAG" = "true" ]; then
  pass "claim_quest_reward marked $QUEST_ID claimed"
else
  fatal "claim_quest_reward did not mark the quest claimed: $CLAIM_RESP"
fi

# --- 7. Assert xp + reward item -----------------------------------------------
echo "--- [7/8] Asserting profile xp/level and inventory reward item ---"
# Fresh device account starts at defaultProfile (level 1, xp 0, statPoints 0).
# xpToNext(1) = 100, so a +100 xp reward lands EXACTLY on a level-up: it does
# not show up as a raw +100 xp delta (xp rolls over to 0), so we assert on the
# level-up + statPoints grant instead, which is the deterministic signature of
# "100 xp was applied" from a known starting profile.
LOADOUT_RESP="$(curl -s -X POST "${NAKAMA_HTTP}/v2/rpc/get_loadout?http_key=${HTTP_KEY}&unwrap" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\"}")"
PROFILE_LEVEL="$(echo "$LOADOUT_RESP" | jq -r '.profile.level // empty')"
PROFILE_XP="$(echo "$LOADOUT_RESP" | jq -r '.profile.xp // empty')"
PROFILE_STAT_POINTS="$(echo "$LOADOUT_RESP" | jq -r '.profile.statPoints // empty')"

if [ "$PROFILE_LEVEL" = "2" ] && [ "$PROFILE_XP" = "0" ] && [ "$PROFILE_STAT_POINTS" = "3" ]; then
  pass "profile reflects the +${REWARD_XP}xp reward (level 1->2, xp rolled over to 0, +3 statPoints)"
else
  fail "profile does not reflect the +${REWARD_XP}xp reward; got level=$PROFILE_LEVEL xp=$PROFILE_XP statPoints=$PROFILE_STAT_POINTS"
fi

INVENTORY_STATE="$(read_storage inventory)"
REWARD_QTY="$(echo "$INVENTORY_STATE" | jq -r --arg item "$REWARD_ITEM" '.stackables | map(select(.itemId == $item)) | .[0].qty // 0')"
if [ "$REWARD_QTY" -ge 1 ] 2>/dev/null; then
  pass "inventory contains reward item $REWARD_ITEM (qty=$REWARD_QTY)"
else
  fail "inventory does not contain reward item $REWARD_ITEM; got: $INVENTORY_STATE"
fi

# --- 8. Replay the identical batch: must dedupe and not double-progress -----
echo "--- [8/8] Replaying the identical batch (same matchId+seq) ---"
REPLAY_RESP="$(curl -s -X POST "${NAKAMA_HTTP}/v2/rpc/report_match_events?http_key=${HTTP_KEY}&unwrap" \
  -H "Content-Type: application/json" \
  -d "$BATCH_PAYLOAD")"
REPLAY_DEDUPED="$(echo "$REPLAY_RESP" | jq -r '.deduped')"

if [ "$REPLAY_DEDUPED" = "true" ]; then
  pass "replayed batch returned {deduped:true}"
else
  fail "replayed batch was NOT deduped, got: $REPLAY_RESP"
fi

POST_REPLAY_INVENTORY="$(read_storage inventory)"
POST_REPLAY_QTY="$(echo "$POST_REPLAY_INVENTORY" | jq -r --arg item "$REWARD_ITEM" '.stackables | map(select(.itemId == $item)) | .[0].qty // 0')"
POST_REPLAY_LOADOUT="$(curl -s -X POST "${NAKAMA_HTTP}/v2/rpc/get_loadout?http_key=${HTTP_KEY}&unwrap" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"${USER_ID}\"}")"
POST_REPLAY_LEVEL="$(echo "$POST_REPLAY_LOADOUT" | jq -r '.profile.level // empty')"

if [ "$POST_REPLAY_QTY" = "$REWARD_QTY" ] && [ "$POST_REPLAY_LEVEL" = "$PROFILE_LEVEL" ]; then
  pass "replay did not double-progress (inventory qty and profile level unchanged)"
else
  fail "replay appears to have double-progressed: qty $REWARD_QTY -> $POST_REPLAY_QTY, level $PROFILE_LEVEL -> $POST_REPLAY_LEVEL"
fi

# --- Summary ------------------------------------------------------------------
echo ""
echo "===================================="
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "RESULT: PASS ($PASS_COUNT passed, 0 failed)"
  echo "===================================="
  exit 0
else
  echo "RESULT: FAIL ($PASS_COUNT passed, $FAIL_COUNT failed)"
  echo "===================================="
  exit 1
fi
