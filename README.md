# 🚀 Atlas World - Real-time Multiplayer Game

A high-performance real-time multiplayer game built with a modern high-density architecture: **server-rs** (authoritative Rust ECS game server with FlatBuffers binary delta replication) and **Nakama** for meta-systems (auth, social, matchmaking).

---

## 🏗️ Architecture

### High-Density Rust Simulation Engine (`server-rs`) — Epic E-001
- **Architecture:** Authoritative headless simulation engine built with `bevy_ecs 0.15` and `rapier2d 0.22`.
- **Zero GC Overhead:** Replaces Node.js single-threaded event loop with archetypal SoA cache locality, dual-layer contiguous `SpatialGrid`, and Rayon multithreaded task pools.
- **Empirical Scale Benchmarks (Criterion):**
  - **1,000 entities:** $78.8\text{ }\mu\text{s}$ ($0.078\text{ ms}$)
  - **10,000 entities:** $503.8\text{ }\mu\text{s}$ ($0.503\text{ ms}$) — 50% under the $1.0\text{ ms}$ budget
  - **20,000 entities:** $1.03\text{ ms}$ — 58% under the $2.5\text{ ms}$ budget
- **Deterministic Parity:** Verified against TypeScript baseline golden simulation trace (`golden_sim_trace_1000.json`) with $\epsilon \le 0.05$ coordinate parity across 1,000 ticks.
- **Binary Delta Protocol (FlatBuffers):** Zero-allocation state serialization (`schemas/game_protocol.fbs`) broadcasting deltas at $20\text{ Hz}$ with $< 250\text{ B}$ typical AOI frame payload ($< 5\text{ KB/s}$ wire bandwidth).
- **Client Cutover:** Full web client cutover via `useServerRsClient` React hook connecting directly to `server-rs` WebSocket gateway with FlatBuffers decoding.
- **Platform Utility Integration:** Standalone functional wrappers (`withRetry`, `withCache`, `withCircuitBreaker`, `withRateLimit`, `withDistributedLock`, `withTrace`, `withTracking`) supported from `node-server-decorator`.

### Domain Parity: Elemental Combat & Skill Execution (`server-rs`) — Epic E-002
- **Elemental Matrix:** 7 elements (`Neutral`, `Earth`, `Water`, `Wind`, `Fire`, `Holy`, `Void`) with RO-style advantage cycle (Water > Fire > Earth > Wind > Water at 2.0x, Holy <-> Void duel at 2.0x, 0.5x resist).
- **Damage Formula:** Exact damage mitigation with defense reduction capped at 80% base damage, armor addition, elemental multipliers, and 1.0 floor.
- **Skill Execution:** Full player and mob skills (`skill_1` Meteor Strike, `skill_2` Precision Strike, `skill_3` Blizzard with Freeze, `skill_4` Thunder Strike with Stun, `skill_dash` Dash with 160.0 velocity impulse).
- **Projectile Kinematics:** Integrated kinematic projectile integration, lifetime/range limits, and spatial grid collision detection.

### Legacy Core Simulation Engine (Colyseus TypeScript — Migration to Rust in progress)
- **Authoritative 2.5D Model:** Per-floor 2D physics using `Planck.js`. Being replaced by `server-rs` in release 1.11 (Epic E-002).

### Meta-Systems (Nakama)
- **Auth & Storage:** Handles user accounts, inventory, and leaderboards.
- **Matchmaking:** Calls Agones to allocate a server and returns `ip:port:token` to client.

### Orchestration & Fleet Lifecycle (Agones — Epic E-001 Slices 4 & 5)
- **Lifecycle Management:** Dedicated `FleetLifecycle` trait in `server-rs` connecting to the Agones SDK sidecar (`localhost:9357`).
- **Containerization:** Multi-stage Debian/Rust Docker image (`server-rs/Dockerfile`, $< 35\text{ MB}$), with local Kubernetes Deployment and Agones `GameServer` manifest (`k8s/local/server-rs.yaml`).
- **Cold Boot Time:** $< 5\text{ ms}$ (budget: $< 50\text{ ms}$).

### Meta-Systems & Token Authentication (Nakama — Epic E-001 Slice 4)
- **Session Authentication:** `AuthGuard` validates HS256-signed JWT tokens from Nakama against `NAKAMA_SERVER_KEY`.
- **Zero-Leeway Verification:** Rejects unauthenticated connections, expired sessions, and forged tokens before establishing WebSocket session.
- **WebSocket Gateway:** Native `tokio-tungstenite` server accepting binary FlatBuffers frames and broadcasting `WorldSnapshot` frames.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Rust 1.98+ & Cargo (`~/.cargo/bin`)

### 1. Start High-Density Rust Game Server (`server-rs`)
```bash
cd server-rs
export NAKAMA_SERVER_KEY="defaultkey"
export AGONES_ENABLED="false"
cargo run --release
```

### 2. Start Legacy Colyseus Game Server (Optional)
```bash
cd colyseus-server
npm install
npm run dev
```

### 3. Start React Client
```bash
cd client/react-client
npm install
npm start
```
Play the game at `http://localhost:3001` (Use WASD/Arrows to move).

### 3. C# Unity Client Integration (Optional)
```bash
# Copy C# API generator models to Unity
cp -r colyseus-server/generated/csharp/* /path/to/your/unity/project/Assets/Scripts/
```
Attach the `AtlasWorldUnityClient` to a Unity GameObject and configure the server URL (`ws://localhost:2567`).

---

## 🔗 Main Service Endpoints

| Service | Endpoint | Purpose |
| ---| --- | --- |
| **Colyseus Server (WS)** | `ws://localhost:2567/game` | Binary websocket connection |
| **REST API (Static Data)** | `http://localhost:2567/api` | Mob types, configs, stats |
| **Nakama HTTP API** | `http://localhost:7350` | Auth, meta-systems RPCs (profile/inventory/quests) — see [meta-systems.spec.md](./docs/meta-systems.spec.md) |
| **Nakama Console** | `http://localhost:7351` | Admin UI (admin/password, see `nakama/local.yml`) |
| **CockroachDB (SQL)** | `localhost:26257` | Nakama's database |
| **CockroachDB (Admin UI)** | `http://localhost:8081` | DB admin UI (host port 8081, avoids the 8080 collision) |
| **Metrics (Prometheus)** | `http://localhost:9091/metrics`| Raw diagnostic metrics |
| **Dashboards (Grafana)** | `http://localhost:3000` | Analytics dashboards (admin/admin) |
| **React Interface** | `http://localhost:3001` | Browser-based generic client |

---

## 📁 Project Structure

| Path | Description |
| ---| --- |
| `.cursor/` | Project rules and roadmap implementation plans. |
| `docs/` | Architecture specs and API documentation. |
| `colyseus-server/` | The core Node.js authoritative game server. |
| `colyseus-server/src/rooms/` | Colyseus room handlers. |
| `colyseus-server/src/schemas/`| Networked data models & structs. |
| `client/react-client/` | Web-based client implementation for quick prototyping. |
| `monitoring/` | Prometheus & Grafana configuration stacks. |
| `docker-compose.yml` | Complete local orchestration setup. |

---

## 📜 Technical Data Contracts

### Static World Bundles (Loaded at Boot)
- `config.json` - Map scale & layers.
- `level-colliders.json` - Static Planck.js physics bodies (boxes, circles, polygons).
- `slopes.json` - Movement speed modifiers (gradient, upMul/downMul).
- `portals.json` - Floor-changing trigger zones.

### Network Protocol (FlatBuffers Binary Delta Stream — Epic E-001 Slice 3)
The real-time game state replication protocol uses schema-compiled Google FlatBuffers (`schemas/game_protocol.fbs`) for zero-allocation serialization in Rust and sub-millisecond decoding in TypeScript.
1. **Server -> Client (`WorldSnapshot`):**
   - Compact table containing `tick: uint32`, `server_time_ms: uint64`, `entities: [EntityDelta]`, and `removed_ids: [uint32]`.
   - Each `EntityDelta` stores packed `Vec2` positions, velocities, current/max health, and `state_flags` bitmask.
   - **Wire Bandwidth:** Average delta size is $39.87\text{ B}$ per entity. Typical AOI view (15 entities) consumes only $216\text{ B}$ per tick ($4.22\text{ KB/s}$ at $20\text{ Hz}$), safely inside the $< 5\text{ KB/s}$ wire budget.
2. **Client -> Server (`ClientInput`):**
   - Binary input frame (`client_tick`, `move_x`, `move_y`, `attack`, `skill_slot`, `target_id`).
3. **Cross-Language Validation:**
   - Serialized in Rust via `SnapshotBuilder` (`server-rs/src/protocol/`).
   - Decoded in TypeScript via `BinaryDeltaDecoder` (`contracts/src/protocol/BinaryDeltaDecoder.ts`).
   - Bit-parity asserted end-to-end via `protocol_roundtrip.rs` and `protocol-roundtrip.test.ts`.

---

## 🧪 Development Workflow

### Git / Deployment Rules
- Create feature branch from `main`. Write tests.
- CI pipeline triggers on Pull Request.
- `main` deploys to Production/Staging.

### Required Code Quality & Testing Gates
- TypeScript **Strict Mode** only.
- Passing `ESLint` and `Prettier` configurations (`npm run format`).
- Unit & E2E Quality Gates (`npm run test:unit`, `npm run test:coverage:gate`, `npm run test:e2e`).
- Precheck Gate: `./scripts/precheck.sh` enforces coverage thresholds (55% branch, 70% functions, 70% lines, 70% statements; 80%+ on core interest/time modules), linter, contracts, and full test suites.
- **Deterministic Simulation Oracle:** `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json` records 1,000 ticks of authoritative simulation driven by `SimClock` and Mulberry32 PRNG. Verified by `npm test -- src/tests/sim-trace-determinism.test.ts` to ensure zero drift during the high-density Rust server migration (Epic `E-001`).
- Commit to the 2.5D Physical limitations (never blindly trust Client elevation inputs, always audit slope coordinates).

---

## 🎛 Configuration & Environment Variables

| Variable | Default / Example | Purpose |
| ---| --- | --- |
| `MAP_KEY` | `TowerF5` | Name of the instance map |
| `CAPACITY` | `300` | Limit of connections before rejecting |
| `NAKAMA_RUNTIME_ENV` | `development` | Nakama operation mode |
| `NAKAMA_SERVER_KEY` | `defaultkey` | Shared secret for signing/validating Nakama JWT session tokens |
| `PORT` | `2567` (or `7350`) | Game socket port |
| `BIND_ADDR` | `0.0.0.0:2567` | Listen address for Rust `server-rs` WebSocket gateway |
| `AGONES_ENABLED` | `false` (local) / `true` (prod) | Whether to connect to Agones Kubernetes sidecar |
| `AGONES_SDK_PORT` | `9357` | Port for the Agones SDK sidecar gRPC/HTTP interface |

**Built for performance, scaled for players.** 🎯
