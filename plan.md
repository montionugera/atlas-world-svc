# Implementation Plan: F-058 (E-001 Slice 4) Agones gRPC Lifecycle Sidecar & Nakama S2S Token Authentication

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-058-4`  
**Branch:** `feat/F-058`  
**Goal:** Implement the production Agones SDK gRPC lifecycle client (`tonic`) and Nakama S2S JWT session authentication with a WebSocket gateway (`tokio-tungstenite`) in `server-rs`, achieving $< 35\text{ MB}$ binary/image size, $< 50\text{ ms}$ cold boot, and robust health heartbeats.

---

## Task 1: Agones gRPC SDK Lifecycle Client
- **Files:** `server-rs/src/fleet/mod.rs`, `server-rs/src/fleet/agones.rs`, `server-rs/Cargo.toml`
- **Action:**
  - Implemented `FleetLifecycle` trait: `ready()`, `health()`, `allocate()`, `shutdown()`.
  - Implemented `MockFleetClient` with state machine validation for local dev & testing.
  - Implemented `AgonesClient` connecting to Agones sidecar (`localhost:9357`) with graceful mock fallback when disabled.
  - Implemented `HeartbeatTask` background Tokio loop pulsing health every 2 seconds.
- **Verify:** ✅ Unit tests in `fleet/agones.rs` pass.

## Task 2: Nakama S2S Token Authentication Guard
- **Files:** `server-rs/src/auth/mod.rs`, `server-rs/src/auth/jwt.rs`, `server-rs/Cargo.toml`
- **Action:**
  - Added `jsonwebtoken = "9.3"` to `Cargo.toml`.
  - Implemented `AuthGuard` with zero-leeway expiry validation against `NAKAMA_SERVER_KEY`.
  - Validates `sub`, `exp`, `username`, and rejects forged or expired tokens.
- **Verify:** ✅ Unit tests pass with valid, expired, and tampered tokens.

## Task 3: Async WebSocket Gateway & Session Pool
- **Files:** `server-rs/src/net/mod.rs`, `server-rs/src/net/ws.rs`, `server-rs/src/main.rs`
- **Action:**
  - Added `tokio-tungstenite = "0.26"` and `futures-util = "0.3"`.
  - Implemented `WsServer` with connection pool, query token validation, and binary FlatBuffers broadcast.
  - Implemented `server-rs/src/main.rs` orchestrating simulation tick loop, Agones ready/heartbeat, and WsServer.
- **Verify:** ✅ Server connects clients and exchanges binary frames.

## Task 4: End-to-End Lifecycle & Authentication Integration Test
- **Files:** `server-rs/tests/fleet_and_auth.rs`
- **Action:**
  - Tested Agones lifecycle state machine (`Init` -> `Ready` -> `Heartbeat` -> `Allocated` -> `Shutdown`).
  - Tested WebSocket auth: unauthenticated and expired tokens rejected, valid token accepted.
  - Verified FlatBuffers binary broadcast over WebSocket bit-for-bit.
  - Verified cold boot latency: $< 5\text{ ms}$ (budget: $< 50\text{ ms}$).
- **Verify:** ✅ `cargo test --test fleet_and_auth` (3/3 pass); full suite 28/28 pass.

## Task 5: Gate 1 Integration, Documentation & Quality Gates
- **Action:**
  - Updated `README.md` with Agones configuration, Nakama authentication env vars, and quick start guide.
  - Verified `./scripts/precheck.sh --no-install`.
- **Verify:** ✅ Gate 1 PASS.
