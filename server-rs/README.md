# server-rs: Authoritative High-Density Rust Game Server

`server-rs` is the authoritative game simulation engine for Atlas World, built on `bevy_ecs 0.15` and `rapier2d 0.22`. It delivers deterministic tick simulation at 20 Hz, FlatBuffers binary delta replication, Agones fleet orchestration, and full elemental combat parity with the legacy game server.

---

## ⚔️ Elemental Combat & Skill Systems (Epic E-002 / Release 1.11)

### 1. 7-Element Multiplication Matrix
Implements the RO-style World Wisdom elemental combat table:
- **Natural Cycle (2.0x Strong, 0.5x Weak):**
  - $\text{Water} \to \text{Fire} \to \text{Earth} \to \text{Wind} \to \text{Water}$
- **Opposed Duel Pair (Mutual 2.0x Strong):**
  - $\text{Holy} \leftrightarrow \text{Void}$
- **Inert Baseline (1.0x Neutral):**
  - $\text{Neutral}$ deals and receives 1.0x damage against all elements.
- **Resistances & Same Element (0.5x):**
  - Reverse of cycle and element against itself deals 0.5x.

### 2. Defense Mitigation & Damage Calculator
- **Formula:**
  $$\text{total\_def} = (\text{if magical } \text{m\_def} \text{ else } \text{p\_def}) + \text{armor}$$
  $$\text{reduction} = \min(\text{total\_def}, \text{base\_damage} \times 0.8)$$
  $$\text{after\_def} = \max(1.0, \text{base\_damage} - \text{reduction})$$
  $$\text{final\_damage} = \max(1.0, \lfloor \text{after\_def} \times \text{element\_mult} \rfloor)$$
- **Guarantees:**
  - Defense reduction capped at 80% maximum damage reduction.
  - Guaranteed minimum floor of 1 damage on all landed hits.

### 3. Skill Catalog & Cooldown Tracking
- **`skill_1` (Meteor Strike):** Fire AoE, magical, 1.5s cast, 5.0s cooldown, 5.0s GCD.
- **`skill_2` (Precision Strike):** Earth single-target, physical, 1.0s cast, 2.0s cooldown, 1.0s GCD.
- **`skill_3` (Blizzard):** Water AoE, magical, 1.0s cast, 4.0s cooldown, 1.5s GCD. Applies **Freeze** (5.0s duration, 0.2 movement speed multiplier).
- **`skill_4` (Thunder Strike):** Wind AoE, magical, 0.5s cast, 5.0s cooldown, 1.0s GCD. Applies **Stun** (1.2s duration, movement locked).
- **`skill_dash` (Dash):** Neutral physical, instant cast, 0.5s cooldown. Applies instant 160.0 velocity impulse in facing/movement direction.

### 4. Projectile Kinematics & Spatial Collision
- Projectiles move kinematically via `Velocity` each tick.
- Range and lifetime expiration despawns projectiles automatically.
- Collisions are resolved via `SpatialGrid` against opposing factions, calculating elemental damage and applying status effects.

### 5. Mass-Based Knockback & Impulse Physics
- Entities carry a `Mass` component:
  - Players and bots: `15.0`
  - Skirmisher mobs: `20.0`
  - Bruiser & Tank mobs: `40.0`
  - Default mobs: `25.0`
- Both melee attacks (`combat_system`) and projectile hits (`projectile_collision_system`) impart knockback impulses:
  $$\text{impulse\_magnitude} = \frac{\text{clamp}(\text{damage} \times 20.0, 1.0, 2000.0)}{\text{victim\_mass}}$$
- The impulse vector pushes the victim along the attack direction and sets a `knockback_timer` (0.2s) in `StatusEffects`, during which mob AI steering preserves velocity pushback without premature override.

---

## 💾 Nakama Persistent Storage & Stat Derivation (F-063 / E-002 Slice 4)

### 1. Configuration & Environment Variables
- `NAKAMA_BASE_URL`: HTTP REST/RPC endpoint for the Nakama cluster (e.g. `http://nakama:7350`).
- `NAKAMA_HTTP_KEY`: Nakama server HTTP runtime key used for authenticating server-to-server RPCs (e.g. `defaultkey`).
- `NAKAMA_TIMEOUT_MS`: Request timeout in milliseconds (default: 5000ms).
- `NAKAMA_RETRIES`: Number of exponential backoff retry attempts on transient network or 5xx failures (default: 3).

### 2. Persistence Lifecycle
- **Session Verification:** During WebSocket handshake, player bearer tokens are validated with Nakama `GET /v2/account` (or local JWT auth guard fallback).
- **Persistent Loadout Retrieval:** Upon successful authentication, `NakamaClient::get_loadout` fetches the player's persistent profile (`level`, `xp`, `allocated` primary stats), equipped weapons/armor, and skill loadouts.
- **Avatar Initialization:** `AtlasSimulation::spawn_player_avatar_with_loadout` initializes the player's ECS avatar with server-authoritative derived combat attributes. If offline or loadout is unavailable, it gracefully falls back to level 1 defaults.
- **Match Event Queue:** In-game achievements and quest objectives (e.g., `mob_kill`) are enqueued in `MatchEventQueue` and reported back to Nakama via `report_match_events` RPC batches with deduplication and idempotency.

### 3. Server-Authoritative Combat Stat Derivation
Mirrors `contracts/src/meta/derivedStats.ts` exactly:
- **Constants:** `GROWTH = 1.045`, `STAT_COEF = 0.5`, `STAT_MAX = 99.0`, `BASE_HP = 108.9`, `BASE_ATK = 19.602`, `BASE_DEF = 5.94`, `GEAR_REFERENCE = 18.0`, `UNARMED_GEAR = 0.25`.
- **Formulas:**
  $$\text{grow} = \text{GROWTH}^{(\max(1, \text{level}) - 1)}$$
  $$\text{share}(p) = \frac{\text{clamp}(p, 1, 99)}{99}$$
  $$\text{offMagnitude} = 1 + 2 \times \text{STAT\_COEF} \times \text{share}(\text{allocated}[\text{weapon.atk\_stat}])$$
  $$\text{defMagnitude} = 1 + 2 \times \text{STAT\_COEF} \times \text{share}(\text{vit})$$
  $$\text{atk} = \text{BASE\_ATK} \times \text{grow} \times \text{offMagnitude} \times \text{weapon.gear}$$
  $$\text{def} = \text{BASE\_DEF} \times \text{grow} \times \text{defMagnitude}$$
  $$\text{maxHealth} = \text{BASE\_HP} \times \text{grow} \times \text{defMagnitude}$$
  $$\text{p\_atk} = \text{atk} \times 2 \times \text{rho}$$
  $$\text{m\_atk} = \text{atk} \times 2 \times (1 - \text{rho})$$
  $$\text{p\_def} = \text{m\_def} = \text{def}$$
  $$\text{maxMoveSpeed} = 20.0 + 0.2 \times \text{agi}$$
- Level 1 `basic_sword` anchor parity: 110 HP, 22 pAtk, 0 mAtk, 6 pDef, 6 mDef, 20.2 speed.

---

## 🌍 Live Runtime (`main.rs`) vs Golden-Trace Harness

`main.rs` builds the world **only** via `AtlasSimulation::live(LiveConfig)` and advances it
with `sim.live_tick(inputs, disconnected)`. `with_arena` / `populate_entities` remain the
deterministic replay population for `tests/trace_replay.rs` and must not be used live.
`tests/live_runtime.rs` drives the same two calls, so a system that exists but is not wired
into the live path fails there.

Live behaviour:
- **Mobs** are drawn from the embedded bestiary (Route tier) with the full bundle shared with
  respawn (`systems::mob_bundle`): `MobAi` (wander / chase / attack / return-home, leash 300px),
  `ThreatTable`, `ElementalAttributes`, `MobSpawnAnchor`, bestiary HP / attack / speed.
- **Aggro**: the nearest live player inside a mob's `chase_range` is added to its threat table;
  any melee or projectile damage adds threat on the victim mob toward the attacker.
- **Mob attacks** are owned by `mob_ai_system` (one cooldown decrement per tick). Melee reach
  is edge-to-edge (bestiary range + 12px player + 14px mob radius).
- **Players**: human avatars only melee while `ClientInput.attack` is held; bots auto-attack.
  In live mode, bots scan within 300px for the nearest alive mob, approaching and attacking it. If no mob is in range, they wander while avoiding borders.
- **Collision**: players, bots and mobs are circles (player 12px, mob 14px — matching the
  client renderer) pushed apart to `r1 + r2` every tick and clamped to the arena. Static obstacles (e.g. town buildings, fences) are loaded from map definitions and block movement via circle-AABB push-out and Rapier2D static colliders.
- **Death**: dead mobs stay visible ~0.5s as a corpse (sent with `state_flags = 0`), then
  despawn (id sent in the snapshot's `removed_ids`) and respawn at their anchor
  `MOB_RESPAWN_MS` after death; dead players cannot move or cast and respawn at their spawn
  point with full HP after
  `PLAYER_RESPAWN_MS` (legacy Colyseus respawned players manually; server-rs auto-respawns).
- **Disconnect**: when a session's **last** socket closes, its avatar is removed and its id is
  sent in `removed_ids`. Closing one of several sockets for a session keeps the avatar.
- **Wire `max_health`** is the entity's real `Health.max`.

Wire snapshot (`schemas/game_protocol.fbs`, fields only ever **added**; regenerate Rust with
`flatc --rust` + `rustfmt`, TS into `contracts/` and `client/react-client/` with `flatc --ts`):
- `state_flags`: `STATE_FLAG_ALIVE` (1) and `STATE_FLAG_BOT` (2, only `BotAgent` players —
  human avatars never carry it).
- `mob_type`: the mob's bestiary id (from `MobSpawnAnchor`), e.g. `mob-millpond-gnawer`.
- `target_id`: a live mob's `ThreatTable` top target; a human's `ClientInput.target_id`.
- **Projectiles** are sent as `EntityType::Projectile` (id = FNV of the ECS entity,
  `owner_id` / `target_id` = wire ids). They are ephemeral: never in `removed_ids`, clients
  rebuild their projectile set each snapshot.
- `events`: one `Hit` (source, target, amount) per melee/projectile damage application and a
  `Kill` when that hit was lethal (live-only `HitLog` resource, drained every `live_tick`).
  `MatchEventQueue` is drained every tick too (`LiveFrame.match_events`); `main.rs` only logs
  those at debug level — no persistence sink is wired into the live loop yet.

| Env var | Default | Meaning |
|---|---|---|
| `MAP_ID` | `default` | Map identifier selecting arena dimensions, spawn areas, and static obstacles (`default`, `map-for-test-deflect`, `map-for-test-projectile`) |
| `SIM_SEED` | `0x1337c0de` | Live world seed |
| `PLAYER_COUNT` | `10` | Number of bots |
| `MOB_COUNT` | `50` | Number of bestiary mobs |
| `ARENA_WIDTH` / `ARENA_HEIGHT` | `1000` | Arena size (px, overridden by map if configured) |
| `MOB_RESPAWN_MS` | `5000` | Mob respawn delay (legacy `respawnDelayMs` default) |
| `PLAYER_RESPAWN_MS` | `5000` | Player auto-respawn delay |
| `ATLAS_DEBUG` | unset | `1`/`true` turns the debug controls on, any other value off. Unset: on only in a debug build (`cargo run`, not `--release`) while neither `NAKAMA_SERVER_KEY` nor `JWT_SECRET` is set (development mode); a release build stays off |

Rooms (`content::map::ROOM_IDS`): `map-for-play`, `map-for-test-projectile`, `map-for-test-deflect`,
`map-for-test-terrain`, and `map-for-test-large` (4000 x 4000, 10 bots, 200 mobs, spawn at 2000,2000;
zones in `MapConfig::large_test_map`). Snapshots carry every entity of the room to every client
(no area-of-interest filter), about 44 bytes per entity.

With `RUST_LOG` at its default the server logs `tick timing interval_ms=… work_ms=…`
(min/p50/p95/max over 200 ticks) every 10 s.

### Debug controls (development mode only)

Plain HTTP on the game port. Every route answers 404 unless the controls are on (see
`ATLAS_DEBUG`), the caller is on this machine (loopback peer) and the `Host` header is
`localhost`, `127.0.0.1` or `[::1]` (any port).

```bash
curl 'localhost:2567/debug/state?map=map-for-play'
curl -X POST localhost:2567/debug/command -H 'Content-Type: application/json' \
  -d '{"map":"map-for-play","cmd":"set_bots","count":100}'
```

`POST /debug/command` must be sent as `Content-Type: application/json` (otherwise `415`), with a
body of at most 64 KiB (`413`; a malformed `Content-Length` is `400`). CORS headers are sent only
to pages on `http://localhost` or `http://127.0.0.1` (any port), so no other site can call or
read these routes from a browser.

`POST /debug/command` takes `{"map": <room, default map-for-play>, "player": <session id>, "cmd": …}`:
`state`, `set_bots {count}`, `add_bots {delta}`, `set_mobs {count}`, `add_mobs {delta}`,
`spawn_mobs {mob_type, count, x?, y?}` (around `player` when x/y are omitted), `clear_mobs`,
`pause_mobs {paused}`, `pause_bots {paused}`, `set_invulnerable {enabled}` and `teleport {x, y}`
(the last two act on `player`). Success: `200 {"ok":true,"state":{…}}`; failure:
`400 {"ok":false,"error":"…"}`. Counts are clamped to 300 bots and 1000 mobs per room. Commands
are applied by the tick loop between ticks, at most 4 per tick; a command not answered within
2 s gets `503` and is dropped.

---

## 🎮 Player Input & Respawn Protocol

- **`ClientInput` extensions (`schemas/game_protocol.fbs`):**
  - `target_x: float`, `target_y: float`: World coordinates for skill aiming and mouse targeting.
  - `respawn: bool`: Player-initiated instant respawn request. Honoured only in development
    mode (see `ATLAS_DEBUG`); otherwise ignored, and `PLAYER_RESPAWN_MS` revives the dead.
- **Respawn Mechanics:**
  - Revives the player at `SpawnPoint` with full health.
  - Clears `PlayerRespawnTimer` and resets `CastingState` and `CooldownTracker`.
  - Clears all mobs' threat tables on the revived player and resets pursuing mobs (`Chase`/`Attack`) to `ReturnHome`.

---

## 🏃 Running & Testing

```bash
# Unit & integration tests
cargo test

# Clippy linter
cargo clippy --all-targets -- -D warnings

# Code formatting check
cargo fmt --check
```
