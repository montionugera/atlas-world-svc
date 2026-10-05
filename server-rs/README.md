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

## 🏃 Running & Testing

```bash
# Unit & integration tests
cargo test

# Clippy linter
cargo clippy --all-targets -- -D warnings

# Code formatting check
cargo fmt --check
```
