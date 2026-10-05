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

## 🏃 Running & Testing

```bash
# Unit & integration tests
cargo test

# Clippy linter
cargo clippy --all-targets -- -D warnings

# Code formatting check
cargo fmt --check
```
