# 🚀 Atlas World - Real-time Multiplayer Game

A high-performance real-time multiplayer game built with a modern high-density architecture: **server-rs** (authoritative Rust ECS game server with FlatBuffers binary delta replication and native in-process **Rust Meta & Persistence Engine**).

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

### Mobile MMORPG Client (Godot 4.7 C# NativeAOT / iOS)
- **Engine & Runtime:** Godot Engine 4.7 with C# / .NET 8 compiled to 100% NativeAOT for zero JIT latency, strict iOS App Store compliance, and immediate 60 FPS Metal rendering on Apple Silicon.
- **Zero-Reflection Architecture:** Built without runtime reflection or dynamic code generation. All UI events communicate through decoupled Godot C# signals (`[Signal] delegate void ...`).
- **Mobile MMORPG HUD (Ragnarok-Style Ergonomics):**
  - **PlayerFrame (Top-Left):** Circular portrait badge, Level 90 tag, green HP progress bar (`14,850 / 14,850`), blue SP progress bar (`3,200 / 3,200`).
  - **TopBar & Radar (Top-Right):** Circular minimap radar with coordinate readout (`Atlas Spar 120, 240`), ping status, and quick menu buttons (`[🎒 Bag]`, `[👗 Wardrobe]`, `[📜 Quests]`).
  - **Compact Dual-State ChatBox (Bottom-Center):** Default collapsed translucent single-line ticker pill (`[System] Welcome to Atlas World`) that expands into a multi-tab modal (`[All]`, `[World]`, `[Party]`, `[System]`) upon tap.
  - **Dual-Thumb Combat Controls:** Dynamic virtual joystick on the bottom-left with touch clamping, paired with a radial skill action cluster on the bottom-right (`[ATK]`, `[DASH]`, `[S1] Meteor`, `[S2] Blizzard`).
- **Split-Screen Wardrobe & Equipment Modal:**
  - **Interactive 3D SubViewport (Left 45%):** Live 3D character preview mounted on a pedestal with camera and omni lighting. Supports 360° touch drag rotation.
  - **Tabbed Equipment Grid (Right 55%):** Category tabs (`Weapons`, `Armor`, `Hair`, `Sets`) with rarity color borders (Epic purple, Rare blue), level requirements, stat diffs (`+140 M.ATK`, `+65 P.ATK`), **[Try On]** tween preview, and **[Equip]** real-time avatar mutation.
  - **Input Isolation:** Disables background joystick and hero movement while typing in chat or inspecting gear in modals.

### Legacy Core Simulation Engine (Colyseus TypeScript — Migration to Rust in progress)
- **Authoritative 2.5D Model:** Per-floor 2D physics using `Planck.js`. Being replaced by `server-rs` in release 1.11 (Epic E-002).

### Native Rust Meta & Persistence Engine (`server-rs/src/meta/` — Feature F-091)
- **Zero-Overhead Single-Binary Meta Engine:** Built directly into `server-rs` to replace the Go/Goja Nakama + CockroachDB stack while preserving 100% `/v2/*` HTTP wire compatibility (`POST /v2/account/authenticate/device`, `GET /v2/account`, `POST /v2/storage`, `GET|POST /v2/rpc/{id}`).
- **In-Process `NakamaStorage` Implementation:** `RustMetaEngine` implements `NakamaStorage` directly in-memory/in-process so join-time `get_loadout`, match-event reporting (`report_match_events`), and character-state checkpointing (`save_character_state`) execute with zero HTTP S2S round-trip overhead.
- **Trait-Backed Persistence (`MetaDocStore`):**
  - `InMemoryMetaStore`: Zero-dependency default when `META_DB_PATH` is unset.
  - `SqliteMetaStore`: Embedded `rusqlite` (`WAL` mode + `BEGIN IMMEDIATE` multi-key atomic CAS transactions) configured via `META_DB_PATH=./data/meta.db`.
  - `PostgresMetaStore`: Conditional-DML SQL transaction adapter for multi-pod Kubernetes clusters (`META_POSTGRES_URL`).

### Orchestration & Fleet Lifecycle (Agones — Epic E-001 Slices 4 & 5)
- **Lifecycle Management:** Dedicated `FleetLifecycle` trait in `server-rs` connecting to the Agones SDK sidecar (`localhost:9357`).
- **Containerization:** Multi-stage Debian/Rust Docker image (`server-rs/Dockerfile`, $< 35\text{ MB}$), with local Kubernetes Deployment and Agones `GameServer` manifest (`k8s/local/server-rs.yaml`).
- **Cold Boot Time:** $< 5\text{ ms}$ (budget: $< 50\text{ ms}$).

### Meta-Systems & Token Authentication (`server-rs/src/auth/`)
- **Session Authentication:** `AuthGuard` both issues (`issue_session_token`) and validates HS256-signed JWT tokens (`tid`, `uid`, `usn`, `exp`) against `NAKAMA_SESSION_KEY` / `NAKAMA_SERVER_KEY`.
- **Zero-Leeway Verification:** Rejects unauthenticated connections, expired sessions, and forged tokens before establishing WebSocket session.
- **WebSocket Gateway:** Native `tokio-tungstenite` server accepting binary FlatBuffers frames and broadcasting `WorldSnapshot` frames while multiplexing `/v2/*` Meta HTTP endpoints on the same port (and optional `META_BIND_ADDR`).

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Rust 1.98+ & Cargo (`~/.cargo/bin`)
- .NET 8 SDK & Xcode 16+ (for Godot C# iOS Client)

### 1. Start High-Density Rust Game & Meta Server (`server-rs`)
```bash
cd server-rs
export NAKAMA_SERVER_KEY="defaultkey"
export META_DB_PATH="./data/meta.db"       # optional: omit for in-memory store
export META_BIND_ADDR="0.0.0.0:7350"       # optional: secondary Nakama /v2/* HTTP port
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

### 4. Build & Run Godot Mobile MMORPG Client (iOS / iPad)
```bash
# 1. Export Godot PCK pack
godot --headless --path game-client --export-pack "iOS" game-client/builds/AtlasWorld.pck

# 2. Publish NativeAOT dylib for arm64
dotnet publish game-client/GameClient.csproj -c ExportRelease-ios-arm64 -r ios-arm64

# 3. Build & Deploy via Xcode / devicectl
xcodebuild -project game-client/builds/ios/AtlasWorld.xcodeproj -scheme AtlasWorld -destination 'id=<DEVICE_UUID>' build
xcrun devicectl device install app --device <DEVICE_UUID> <PATH_TO_APP>/AtlasWorld.app
xcrun devicectl device process launch --device <DEVICE_UUID> com.atlasworld.client
```

---

## 🔗 Main Service Endpoints

| Service | Endpoint | Purpose |
| ---| --- | --- |
| **server-rs WebSocket & Meta API** | `ws://localhost:2567/ws` / `http://localhost:2567/v2/*` | Binary FlatBuffers WebSocket + Nakama `/v2/*` HTTP API |
| **Secondary Meta HTTP Listener** | `http://localhost:7350/v2/*` | Optional (`META_BIND_ADDR=0.0.0.0:7350`) drop-in Nakama HTTP port |
| **Colyseus Server (WS)** | `ws://localhost:2567/game` | Legacy binary websocket connection |
| **REST API (Static Data)** | `http://localhost:2567/api` | Mob types, configs, stats |
| **Metrics (Prometheus)** | `http://localhost:2567/metrics`| Live server tick & entity diagnostic metrics |
| **Dashboards (Grafana)** | `http://localhost:3000` | Analytics dashboards (admin/admin) |
| **React Interface** | `http://localhost:3001` | Browser-based generic client |

---

## 📁 Project Structure

| Path | Description |
| ---| --- |
| `.cursor/` | Project rules and roadmap implementation plans. |
| `docs/` | Architecture specs and API documentation. |
| `game-client/` | Godot 4.7 C# NativeAOT Mobile MMORPG client (scenes, scripts, shaders, assets). |
| `game-client/src/UI/Widgets/` | Ragnarok-style UI components: `PlayerFrame`, `TopBar`, `ChatBox`, `WardrobeModal`, `MobileControlsOverlay`. |
| `server-rs/` | Authoritative Rust ECS simulation engine + Native Rust Meta & Persistence Engine (`server-rs/src/meta/`). |
| `colyseus-server/` | Legacy Node.js authoritative game server. |
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
| `META_DB_PATH` | `./data/meta.db` (optional) | SQLite WAL file path for `RustMetaEngine` (uses `InMemoryMetaStore` when unset) |
| `META_POSTGRES_URL` | `postgres://...` (optional) | Postgres connection URL for multi-pod `PostgresMetaStore` |
| `META_BIND_ADDR` | `0.0.0.0:7350` (optional) | Secondary TCP listener serving Nakama `/v2/*` HTTP routes |
| `NAKAMA_SERVER_KEY` | `defaultkey` | Shared secret for Basic device auth and JWT fallback |
| `NAKAMA_HTTP_KEY` | `atlas_dev_http_key` | Shared secret for S2S `/v2/rpc/*?http_key=` calls |
| `PORT` | `2567` | Game WebSocket & primary HTTP gateway port |
| `AGONES_ENABLED` | `false` (local) / `true` (prod) | Whether to connect to Agones Kubernetes sidecar |
| `AGONES_SDK_PORT` | `9357` | Port for the Agones SDK sidecar gRPC/HTTP interface |

**Built for performance, scaled for players.** 🎯
