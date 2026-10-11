---
title: "Wire the game server to Nakama"
id: I-136
status: idea
---

# Wire the game server to Nakama

Slice 1 of epic E-003 ("Persistent accounts and characters"). Nakama is the account and storage service; `server-rs` is the Rust game server. Paths are relative to the repository root; line numbers were read on branch `release/1.12` at commit `fac2acf9`.

## Problem

The game server has a working Nakama client that nothing ever constructs, so the local stack runs the two services side by side without one request between them.

- `WsServer::with_nakama` (`server-rs/src/net/ws.rs:142`) has no caller. `main.rs` builds the WebSocket server at `server-rs/src/main.rs:118-122` and wraps it in `Arc` immediately, so the client slot stays `None` (`ws.rs:98`).
- The join path already fetches a loadout (the saved character snapshot) when a client is present (`ws.rs:400-418`), but with no client the branch never runs.
- `main.rs` reads `HOST`, `PORT`, `SIM_SEED`, `MAP_ID` and similar (`main.rs:79-99`, `:133`) and no Nakama variable at all.
- `k8s/local/server-rs.yaml:25-33` sets no Nakama address and no http key. It sets `NAKAMA_SERVER_KEY=defaultkey`, which is only used as a token-signing secret (`server-rs/src/auth/jwt.rs:47`), not to reach Nakama.
- `NakamaClient::new(base_url, http_key, timeout_ms, retries)` (`server-rs/src/storage/nakama.rs:141`) wants a bare base address such as `http://nakama:7350`; `get_loadout` posts to `{base}/v2/rpc/get_loadout?http_key={key}&unwrap` (`nakama.rs:238-241`). The key Nakama expects locally is `atlas_dev_http_key` (`nakama/local.yml:12`), and the Nakama Service is `nakama` on port 7350 in namespace `atlas-world` (`k8s/local/nakama.yaml:89-105`).
- Nothing checks the configuration. A wrong key would surface only as a per-join warning (`ws.rs:415`), and that warning would print the key, because the request address carries it and the error text embeds the address (`nakama.rs:306`).

## Goal

When the two variables are set, the game server builds one Nakama client at startup, proves the address and key work before accepting players, and hands the client to the WebSocket server so the existing join-time loadout fetch really runs. When they are not set, the server behaves exactly as today.

## Design

**Variables.** `NAKAMA_URL` (base address, no path) and `NAKAMA_HTTP_KEY` (Nakama's `runtime.http_key`). No other new variable; timeout 2000 ms and 1 retry are constants.

**Configuration rule**, a pure function `NakamaConfig::from_vars(url: Option<String>, key: Option<String>) -> Result<Option<NakamaConfig>, String>` in `server-rs/src/storage/nakama.rs` (empty strings count as absent):

| `NAKAMA_URL` | `NAKAMA_HTTP_KEY` | Result |
| --- | --- | --- |
| absent | absent | `Ok(None)`: offline mode, one log line `Nakama not configured (NAKAMA_URL unset); persistence disabled` |
| set | set | `Ok(Some(config))` |
| only one set | | `Err`: names the missing variable; the server exits non-zero |

**Probe.** New `NakamaClient::probe()` posts to `{base}/v2/rpc/healthcheck?http_key={key}` (the existing no-op RPC, `nakama/src/main.ts:16-23`, `:49`). It touches no storage, and Nakama rejects it when the http key is wrong. Any non-2xx answer, or no answer after the retry, is an error.

**Where it is built.** In `main.rs`, before the Agones "Ready" call at `main.rs:86` (Agones is the game-server fleet manager), so a misconfigured server never announces itself ready: read the two variables, apply the rule, build `Arc<NakamaClient>`, `await probe()`. Then chain `.with_nakama(client)` onto `WsServer::bind(...)` before the `Arc::new` at `main.rs:118`.

**Failure behaviour (chosen): fail fast.** If the variables are set and the probe fails, or only one is set, the server logs one `error!` line naming the cause and returns `Err` from `main`, which exits non-zero. Reasons: (1) health and readiness endpoints belong to E-006 slice 4, so there is no endpoint to report through yet; (2) in the cluster a non-zero exit puts the pod in a restart loop, its Ready condition stays false and `kubectl rollout status` fails, which is an honest "not ready" using only what exists; (3) a logged degraded mode would let every later slice silently store nothing. After a successful start, a Nakama outage does not stop the server: joins keep the existing warn-and-continue path (`ws.rs:414-419`).

**Epic wording.** Assertion 1 of `E-003/verification.md` says a wrong key "makes the server report not ready". That stays true only in the pod-condition sense. Proposed rewording: "...and a wrong http key makes the server exit non-zero at startup, so its pod never becomes Ready." This spec does not edit the epic.

**Key hygiene.** `probe`, `get_loadout`, `report_match_events` and `verify_session` format request errors with `err.without_url()` so the key never reaches a log. In scope because this slice is what makes those log lines reachable.

**Manifest.** In `k8s/local/server-rs.yaml`, add to the Deployment container and to the Agones `GameServer` container:

```yaml
- name: NAKAMA_URL
  value: "http://nakama:7350"
- name: NAKAMA_HTTP_KEY
  value: "atlas_dev_http_key"
```

The literal key is the development key already committed in `nakama/local.yml`. `scripts/deploy-local.sh` needs no change: it already rolls Nakama out before the game server (`:157`, `:159`).

**`BIND_ADDR` mismatch: flagged, not fixed.** The manifest and `server-rs/Dockerfile:43` set `BIND_ADDR`, which `main.rs` never reads. It does not block this slice because the `HOST`/`PORT` defaults (`main.rs:79-80`) give the same `0.0.0.0:2567`. Left for E-006.

## Acceptance criteria

- [ ] Unit tests for `NakamaConfig::from_vars` cover all four rows of the table above, including empty strings and a trailing slash on the address (`cargo test nakama_config`, no cluster).
- [ ] An integration test `server-rs/tests/nakama_wiring.rs` starts a fake Nakama on a local TCP port, builds the server with `with_nakama`, opens a WebSocket with `dev-token:<id>`, and asserts the fake received `POST /v2/rpc/get_loadout` with that `userId` and the configured `http_key` (no cluster).
- [ ] In the same test file, `probe()` returns `Ok` on a 200 answer and `Err` on a 401 answer after exactly one request, and neither the error text nor any `get_loadout` error text contains the http key.
- [ ] A test launches the built binary (`CARGO_BIN_EXE_server-rs`) with `NAKAMA_URL` pointing at a closed port and with only `NAKAMA_URL` set; both runs exit non-zero within 15 seconds and print an error naming Nakama. With neither variable set the binary stays up and logs `Nakama not configured`.
- [ ] `k8s/local/server-rs.yaml` sets `NAKAMA_URL` and `NAKAMA_HTTP_KEY` on both containers, and the key equals `runtime.http_key` in `nakama/local.yml` (a script or test compares the two files).
- [ ] Real local stack: after `scripts/deploy-local.sh`, opening a WebSocket to the game server with a UUID-shaped dev token produces a `Retrieved persistent loadout for user <id>` line in the server log and no `Failed to fetch persistent loadout` line.
- [ ] Real local stack: with `NAKAMA_HTTP_KEY` changed to a wrong value, `kubectl rollout status deployment/server-rs --timeout=90s` exits non-zero and the pod log shows the Nakama probe error without the key; restoring the manifest makes the rollout succeed.

## Out of scope

- Using the loadout to spawn the avatar (E-003 slice 5) and reporting match events (E-003 slice 6). The join path keeps only logging.
- Real token verification and removing `dev-token` (E-003 slices 2 and 3).
- Health and readiness endpoints, Kubernetes probes on the game server, and reading `BIND_ADDR` (E-006).
- Moving the key into a Kubernetes Secret or any production manifest.
- Periodic re-probing or reconnect logic after startup.

## Risks

- **`deploy-local.sh --skip-meta` on a cluster with no Nakama** now leaves the game server in a restart loop. Workaround until decided otherwise: `kubectl -n atlas-world set env deployment/server-rs NAKAMA_URL- NAKAMA_HTTP_KEY-`. Blast radius is the local cluster only; undo is `kubectl apply -f k8s/local/server-rs.yaml`.
- **Join delay.** The loadout fetch runs before the socket is registered (`ws.rs:400-420`). If Nakama dies after startup, each join waits up to about 4 seconds (two 2-second attempts plus 250 ms backoff) before continuing. Accepted for this slice.
- **Non-UUID dev ids (not confirmed).** The test client's default id is `dev-player` (`jwt.rs:62`). Nakama storage reads may reject an id that is not a UUID, which would turn every such join into a logged warning plus the retry delay. The first real-stack run must check this; if it happens, record it for slices 2 and 3 (which replace dev tokens) and do not widen this slice.
- **Wrong-key status code (not confirmed).** Expected 401 from Nakama; the probe treats every non-2xx as failure, so the exact code does not matter.
- **Startup order outside the script.** Applying manifests by hand can start the game server before Nakama; it will restart until Nakama answers. This is the intended behaviour, but it is new.

## How to verify

No cluster needed:

```bash
cd server-rs
cargo build 2>&1 | tail -n 5
cargo test nakama_config 2>&1 | tail -n 15
cargo test --test nakama_wiring 2>&1 | tail -n 25
cargo test 2>&1 | grep -E "test result|FAILED|panicked"
```

Real local stack (confirm the context is local first; `deploy-local.sh` also refuses otherwise):

```bash
kubectl config current-context
./scripts/deploy-local.sh 2>&1 | tail -n 25
kubectl -n atlas-world rollout status deployment/server-rs --timeout=120s
kubectl -n atlas-world port-forward deployment/server-rs 2567:2567 &
node -e 'const w=new WebSocket("ws://localhost:2567?token=dev-token:00000000-0000-4000-8000-000000000136");w.onopen=()=>setTimeout(()=>{w.close();process.exit(0)},1500);w.onerror=e=>{console.error("ws error");process.exit(1)}'
kubectl -n atlas-world logs deployment/server-rs --since=2m | grep -E "persistent loadout|Nakama"
```

Wrong key, then restore:

```bash
kubectl -n atlas-world set env deployment/server-rs NAKAMA_HTTP_KEY=wrong_key
kubectl -n atlas-world rollout status deployment/server-rs --timeout=90s; echo "exit=$?"
kubectl -n atlas-world logs deployment/server-rs --since=2m --all-containers --prefix | grep -iE "nakama|wrong_key" | tail -n 10
kubectl apply -f k8s/local/server-rs.yaml
kubectl -n atlas-world rollout status deployment/server-rs --timeout=120s; echo "exit=$?"
```

Expected: the first `exit=` is non-zero, the log shows the probe error and never the string `wrong_key`, and the last `exit=` is 0.
