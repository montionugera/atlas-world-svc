---
title: "Wire the game server to Nakama"
id: F-067
status: refined
from_idea: I-136
---

# Wire the game server to Nakama

Slice 1 of epic E-003 ("Persistent accounts and characters"). Nakama is the account and storage service; `server-rs` is the Rust game server. Paths are relative to the repository root; line numbers were read on branch `release/1.12` at commit `fac2acf9`.

## Problem

The game server has a working Nakama client that nothing ever constructs, so the local stack runs the two services side by side without one request between them.

- `WsServer::with_nakama` (`server-rs/src/net/ws.rs:142`) has no caller. `main.rs` builds the WebSocket server at `server-rs/src/main.rs:118-122` and wraps it in `Arc` immediately, so the client slot stays `None` (`ws.rs:98`).
- The join path already fetches a loadout (the saved character snapshot) when a client is present (`ws.rs:401-421`), but with no client the branch never runs.
- `main.rs` reads `HOST`, `PORT`, `SIM_SEED`, `MAP_ID` and similar (`main.rs:79-102`, `:133`) and no Nakama variable at all.
- `k8s/local/server-rs.yaml:25-33` sets no Nakama address and no http key. It sets `NAKAMA_SERVER_KEY=defaultkey`, which is only used as a token-signing secret (`server-rs/src/auth/jwt.rs:47`), not to reach Nakama.
- `NakamaClient::new(base_url, http_key, timeout_ms, retries)` (`server-rs/src/storage/nakama.rs:141`) wants a bare base address such as `http://nakama:7350`; `get_loadout` posts to `{base}/v2/rpc/get_loadout?http_key={key}&unwrap` (`nakama.rs:238-241`). The key Nakama expects locally is `atlas_dev_http_key` (`nakama/local.yml:12`), and the Nakama Service is `nakama` on port 7350 in namespace `atlas-world` (`k8s/local/nakama.yaml:89-105`).
- Nothing checks the configuration. A wrong key would surface only as a per-join warning (`ws.rs:416`), and that warning would print the key, because the request address carries it and the error text embeds the address (`nakama.rs:306`).

## Goal

When the two variables are set, the game server builds one Nakama client at startup, proves the address and key work before accepting players, and hands the client to the WebSocket server so the existing join-time loadout fetch really runs. When they are not set, the server behaves exactly as today.

## Design

**1. Settle non-UUID ids.** First task before code: test whether Nakama's `get_loadout` RPC accepts a non-UUID `userId` like `dev-player` with one `curl` against the local stack. If accepted: proceed with no extra logic. If rejected: skip the fetch for non-UUID ids and log once.

**2. Variables & config.** `NAKAMA_URL` and `NAKAMA_HTTP_KEY`. Pure function `NakamaConfig::from_vars(url, key) -> Result<Option<NakamaConfig>, String>`: both absent returns `Ok(None)` (offline mode); both set returns `Ok(Some(config))`; only one set returns `Err` (exits non-zero).

**3. Startup probe & retry.** `NakamaClient::probe()` calls `{base}/v2/rpc/healthcheck?http_key={key}`. Starting must not crash-loop just because Nakama is slow to come up: the startup probe retries for about 60 seconds before exiting non-zero.

**4. Where it is built.** In `main.rs`, before the Agones Ready call at `main.rs:109`: read variables, build client, retry probe for ~60s. Chain `.with_nakama(client)` onto `WsServer::bind(...)` before `Arc::new` at `main.rs:118`. After startup, outages use warn-and-continue (`ws.rs:415-420`).

**5. Deployment rollout protection.** The Deployment in `k8s/local/server-rs.yaml` has no readiness probe and no `minReadySeconds`, so a failing pod can appear briefly ready. Add `minReadySeconds: 10` so `kubectl rollout status` fails and previous pods stay serving. In `scripts/deploy-local.sh`, `--skip-meta` must unset `NAKAMA_URL` and `NAKAMA_HTTP_KEY` so the game server runs offline.

**6. Epic wording.** Task: reword epic E-003 assertion 1 in `verification.md` to reflect the non-zero exit after retry window and rollout failure.

**7. Key hygiene.** `probe`, `get_loadout`, `report_match_events`, and `verify_session` format request errors with `err.without_url()` so keys never leak to logs.

**8. Manifest.** In `k8s/local/server-rs.yaml`, set `minReadySeconds: 10` and add `NAKAMA_URL: "http://nakama:7350"`, `NAKAMA_HTTP_KEY: "atlas_dev_http_key"` to both containers.

## Acceptance criteria

- [ ] Unit tests for `NakamaConfig::from_vars` cover absent, both set, and partial cases, including empty strings and trailing slash (`cargo test nakama_config`).
- [ ] An integration test starts a fake server that fails twice then succeeds; `probe()` retries across the failures and succeeds, and retries for up to 60 seconds before returning `Err`.
- [ ] An integration test `server-rs/tests/nakama_wiring.rs` starts a fake Nakama on a local TCP port, builds the server with `with_nakama`, opens a WebSocket with `dev-token:<id>`, and asserts the fake received `POST /v2/rpc/get_loadout` with that `userId` and `http_key`.
- [ ] In the same test file, `probe()` returns `Ok` on 200 and `Err` on 401, and neither error text nor `get_loadout` error text contains the http key.
- [ ] A test launches the built binary (`CARGO_BIN_EXE_server-rs`) with `PORT=0`, `AGONES_ENABLED=false`, `NAKAMA_*` cleared from env, and `NAKAMA_URL` pointing at a closed port; it exits non-zero after retrying and prints an error naming Nakama. With neither variable set the binary stays up and logs `Nakama not configured`.
- [ ] If Nakama rejects non-UUID user ids in the curl check, opening a WebSocket with a non-UUID token (such as `dev-token:dev-player`) skips the loadout fetch and logs once; if accepted, it performs the fetch normally.
- [ ] `k8s/local/server-rs.yaml` sets `minReadySeconds: 10` on the Deployment, sets `NAKAMA_URL` and `NAKAMA_HTTP_KEY` on both containers, and `scripts/deploy-local.sh --skip-meta` unsets both variables.
- [ ] Real local stack: after `scripts/deploy-local.sh`, opening a WebSocket to the game server with a UUID-shaped dev token produces a `Retrieved persistent loadout for user <id>` log line and no `Failed to fetch persistent loadout`.
- [ ] Real local stack: with `NAKAMA_HTTP_KEY` changed to a wrong value, `kubectl rollout status deployment/server-rs` fails, the new pod's `restartCount` is greater than 0, the previous pod continues serving, and the pod log shows the probe error without the key; restoring the manifest makes the rollout succeed.

## Out of scope

- Using loadout to spawn the avatar (E-003 slice 5) and reporting match events (E-003 slice 6).
- Real token verification and removing `dev-token` (E-003 slices 2 and 3).
- Health and readiness endpoints, Kubernetes probes on the game server, and reading `BIND_ADDR` (E-006).
- Moving the key into a Kubernetes Secret or production manifest.
- Periodic re-probing or reconnect logic after startup.

## Risks

- **Join delay.** If Nakama dies after startup, each join waits before continuing (`ws.rs:401-421`). Accepted for this slice.
- **Startup order outside script.** Applying manifests by hand can start the game server before Nakama; retry loop allows up to ~60s before exit.

## How to verify

```bash
cd server-rs
cargo test nakama_config
cargo test --test nakama_wiring

# Real local stack:
kubectl config current-context
./scripts/deploy-local.sh
kubectl -n atlas-world rollout status deployment/server-rs --timeout=120s
kubectl -n atlas-world set env deployment/server-rs NAKAMA_HTTP_KEY=wrong_key
kubectl -n atlas-world rollout status deployment/server-rs --timeout=90s # fails, restartCount > 0, prev pod serves
kubectl apply -f k8s/local/server-rs.yaml
kubectl -n atlas-world rollout status deployment/server-rs --timeout=120s # succeeds
```
