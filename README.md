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

### Dedicated 20-Dimension (`D1–D20`) Semantic-Zoom World, Town & Multi-Floor Dungeon Atlas (`scripts/catalog_explorer_web.py` — `:8788`)
- **Dedicated Semantic-Zoom Atlas (`DedicatedWorldAtlasComponent` / `renderDedicatedWorldAtlas`):** Interactive 2D cartographic explorer inspired by Lineage II (`l2hub.info/c3/map` Gludin / Dark Elven Village / Oren by Cheese, The Ant Nest `B1–B3`, Cruma Tower `1F–3F`, Tower of Insolence) and Google/Apple Maps:
  - **3-Tier Semantic Zoom LOD:**
    - **Tier 1 (`1.0×–2.2×` Macro Geography):** Uncluttered continuous world map with priority AABB label culling, inter-zone travel highways, and all **6 Playable Race Spawn Locations** (`Human`, `Lunar`, `Ogre/Orc`, `Dwarf`, `Dark-Lunar`, `Furral`).
    - **Tier 2 (`2.2×–4.5×` Regional Roads & Portals):** Reveals regional hunting territory rings, level-band highway shields, and clickable **Multi-Floor Dungeon Entrance Portals**.
    - **Tier 3 (`4.5×–12.0×` Town Street, Building & Service-Mark Blueprint):** Automatically transitions to walled Town Street Blueprints across all **15 Towns** (6 Starting Towns + 9 Castle/Hub Towns) with `#1..#12` numbered buildings, **7 canonical service marks** (`equip_shop`, `consumable_shop`, `blacksmith` / `refinement_anvils`, `temple`, `warehouse`, `guild`, `gatekeeper`), and an Oren-by-Cheese color-coded `1..12` NPC Roster.
  - **Multi-Floor Underground & Tower Sub-Maps (`openDungeonSubMap` / `switchDungeonFloor`):** Interactive floor stacks across all **16 Multi-Floor Dungeons & Catacombs** (`B1 ⇄ B2 ⇄ B3` underground labyrinths and `1F ⇄ 2F ⇄ 3F` vertical spires) with clickable inter-floor warp portals, vertical cutaway elevation diagrams (`D12`), and clickable room/chamber tactical inspectors (`D18`).
  - **Interactive Blacksmith Refinement (`+1..+15`) & Spoil Source Locator (`D19` — `refinement_grade_matrix`):** Covers all **6 Equipment Grades** (`No-Grade Lv.1–19`, `D-Grade Lv.20–39`, `C-Grade Lv.40–51`, `B-Grade Lv.52–60`, `A-Grade Lv.61–75`, `S-Grade Lv.76–99`) with `+1..+15` anvil rates (Safe `+3`, Max `+15`), representative weapons/armor, required spoil materials, and 1-click buttons to **Jump to Blacksmith Town Street Map** or **Highlight Material Drop Zones / Open Dungeon Floor**.
  - **Bidirectional 4-Perspective Studio ⇄ Dedicated World Atlas Sync (`D20` — `syncStudioNodeToDedicatedAtlas`):** Drilling into any Town, Field Hunting Area, or Dungeon node in the 4-Perspective Studio automatically synchronizes `ATLAS_FOCUSED_TOWN_ID`, `ATLAS_FOCUSED_FIELD_ID`, and `ATLAS_ACTIVE_DUNGEON_ID` on the Dedicated World Atlas.
  - **Interactive 5-Tier Boss Power Hierarchy & Sealed-God Chain Overlay (`D21` — `boss_hierarchy_chains`):** Covers all **6 Primordial Sealed Gods** (`god-sola-hearth-weaver`, `god-krono-brass-titan`, `god-vesper-dream-eater`, `god-aurelia-dawn-forger`, `god-thalassa-abyss-tide`, `god-legendary-dragon`) with causal 5-tier chains (**Tier 5 Sealed God → Tier 4 MVP Apostles → Tier 3 Raid Bosses → Tier 2 Mini-Bosses → Tier 1 Minion Packs**), SVG hierarchy lines (`studioBossHierarchyChainOverlay`), and 1-click warp buttons to each entity's exact dungeon floor (`B1–B3` / `1F–3F`) or overland hunting habitat.
  - **Picture-in-Picture (PiP) World Radar Mini-Map (`D22` — `renderAtlasOverviewMiniMapPipSvg`):** Renders an interactive Overview World Radar Mini-Map inside zoomed Town Street Blueprints, Field Tactical Blueprints, Fortress Blueprints, Dungeon Floor Sub-Maps, and Step 4 Town/Hunting Area SVG views (`studioOverviewMiniMapPip`) with a glowing viewport indicator box, adjacent zone connection pins, and a 1-click **Expand to World Map (1.0×)** button.
  - **Complete 20-Dimension (`D1–D20`) & 22-Dimension (`D1–D22`) Score Matrix (`100.0/100`):**
    - `D1` 6-Race Spawns · `D2` 15 Town Street Blueprints & 1..12 NPCs · `D3` 16 Multi-Floor Dungeons (`B1–B3` / `1F–3F`) · `D4` Monster/Mini-Boss/Raid/MVP Spawn Tiers · `D5` Connected Travel Highways & Anti-Clutter · `D6` 7 MDA Experience Pillars · `D7` 24 Field Tactical Blueprints · `D8` 8 Harbor/ClanHall/Fortress Blueprints · `D9` 6-Race Growth Routes (Stages `A..L`) · `D10` NPC Shop & `+1..+15` Refinement Catalogs · `D11` 4 Town Layout Archetypes · `D12` Dungeon Vertical Cutaway Elevations · `D13` Instant Omni-Search & Quick-Jump Index · `D14` Spawn & Refinement-Spoil Matrix · `D15` 11 Per-Archetype Raster Plates · `D16` Unified 63-Zone Map Directory · `D17` BFS Travel Route & Gatekeeper Calculator · `D18` Clickable Dungeon Chamber Inspector & Telemetry · `D19` 6-Grade `+1..+15` Refinement & Spoil Source Locator · `D20` Bidirectional Studio ⇄ Atlas Sync & Documentation · `D21` 6-God 5-Tier Boss Power Hierarchy Chains · `D22` Picture-in-Picture (PiP) World Radar Mini-Map.
- **6-Role Studio Council (`.claude/agents/`) & Deterministic Multi-Iteration Loop:**
  - **Council Personas:** `studio-product-owner.md`, `studio-cartographer.md`, `studio-lore-architect.md`, `studio-dungeon-architect.md`, `studio-combat-economist.md`, and `studio-ux-director.md`.
  - **Governance & Iteration CLI:**
    ```bash
    # Run 10-gate World Governance & JSON Schema Draft 2020-12 check (GOV-01..GOV-10)
    python3 scripts/studio_world_governance.py --check

    # Audit 20-Dimension (D1–D20 = 100.0/100) / 7-MDA-pillar scores or auto-expand next wave
    python3 scripts/run_atlas_iteration_loop.py --auto-expand-next-wave

    # Launch the World Studio & Catalog Explorer on :8788
    python3 scripts/catalog_explorer_web.py --port 8788
    ```

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
| **World Studio & Semantic-Zoom Atlas** | `http://localhost:8788` | Interactive 4-Layer World Studio, 15 Town Street Blueprints & 16 Multi-Floor Dungeon Sub-Maps |

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
