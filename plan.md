# Implementation Plan: F-061 (E-002 Slice 2) Elemental Combat System, Skill Execution & Projectile Kinematics in server-rs

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-061-elemental-combat-system-skill-execution`  
**Branch:** `feat/F-061`  
**Epic:** `E-002` (Complete game logic parity and full colyseus-server decommissioning)  
**Goal:** Implement full elemental combat parity, RO-style 7-element multiplier matrix, defense mitigation formulas, 5 player/mob skills, cooldowns and casting states, and projectile kinematics/collision in `server-rs` with Bevy ECS, verified by end-to-end integration tests.

---

## Task 1: Elemental Attribute System & Damage Calculator
- **Location:** `server-rs/src/combat/elements.rs` and `server-rs/src/combat/damage.rs`
- **Specification:**
  - `Element` enum: `Neutral`, `Earth`, `Water`, `Wind`, `Fire`, `Holy`, `Void`.
  - Full 7x7 multiplier matrix (`get_element_multiplier(attack, defense) -> f32`) matching `colyseus-server/src/config/combat/elements.ts` bit-for-bit:
    - Cycle: Water > Fire > Earth > Wind > Water (2.0x strong).
    - Opposed pair: Holy <-> Void (mutual 2.0x).
    - Same element & reverse cycle: 0.5x.
    - Neutral: 1.0x across all defenders; all attacks 1.0x against neutral.
  - `DamageType`: `Physical`, `Magical`.
  - `DamageCalculator`:
    - `total_def = (if magical { m_def } else { p_def }) + armor`
    - `reduction = min(total_def, base_damage * 0.8)`
    - `after_def = max(1.0, base_damage - reduction)`
    - `multiplier = get_element_multiplier(attack_elem, defense_elem)`
    - `final_damage = floor(after_def * multiplier).max(1.0)`
  - Unit tests covering all element pairings and defense boundary clamping.

---

## Task 2: ECS Components for Combat, Cooldowns & Status Effects
- **Location:** `server-rs/src/ecs/components.rs` and `server-rs/src/combat/skills.rs`
- **Specification:**
  - Components:
    - `ElementalAttributes`: `element: Element`, `p_def: f32`, `m_def: f32`, `armor: f32`.
    - `CooldownTracker`: HashMap/SmallVec of active cooldown keys and remaining seconds (supports per-skill and `global_magic_cd`).
    - `CastingState`: `casting_until: f32`, `skill_id: Option<String>`, `is_casting: bool`.
    - `StatusEffects`: active `freeze` (remaining duration, speed multiplier) and `stun` (remaining duration).
  - Skill Catalog:
    - `skill_1` (Meteor Strike): Fire AoE, 1.5s cast, 5s cd.
    - `skill_2` (Precision Strike): Earth melee/single-target, 1s cast, 2s cd.
    - `skill_3` (Blizzard): Water AoE with Freeze (speed multiplier 0.2, 5s), 1s cast, 4s cd.
    - `skill_4` (Thunder Strike): Wind AoE with Stun (1.2s duration), 0.5s cast, 5s cd.
    - `skill_dash` (Dash): Instant impulse (160 speed), 0.5s cd.
  - Systems:
    - `cooldown_tick_system`: decrements active cooldown timers.
    - `status_effect_tick_system`: decrements freeze/stun timers, removes expired effects.

---

## Task 3: Projectile Kinematics & Spatial Collision Resolution [COMPLETED]
- **Location:** `server-rs/src/ecs/components.rs` and `server-rs/src/systems/projectile.rs`
- **Specification:**
  - Component `Projectile`:
    - `owner: Entity`, `target: Option<Entity>`, `damage: f32`, `damage_type: DamageType`, `element: Element`.
    - `speed: f32`, `radius: f32`, `max_range: f32`, `traveled_distance: f32`, `lifetime: f32`.
    - `effects: Vec<SkillEffect>` (e.g. freeze, stun).
  - Systems:
    - `projectile_kinematics_system`: integrates position by velocity, increments `traveled_distance`, despawns on range/lifetime exceeded.
    - `projectile_collision_system`: spatial query against opposing entities, runs `DamageCalculator`, applies damage & status effects to `Health`, despawns projectile.

---

## Task 4: Skill Execution & Player Input Integration [COMPLETED]
- **Location:** `server-rs/src/systems/skill_execution.rs` and `server-rs/src/simulation.rs`
- **Specification:**
  - Reads `PlayerInputState`:
    - If `attack` flag is set and not on basic attack cooldown: perform basic attack in facing direction.
    - If `skill_slot` > 0: validate cooldowns via `CooldownTracker`, check casting state.
    - For instant skill (`skill_dash`): apply impulse vector to `Velocity`, set dash cooldown.
    - For casted skills (`skill_1` .. `skill_4`): start casting, lock movement, upon cast completion spawn projectile / apply AoE.
  - Incorporate `status_effects` into movement: Stun zeroes velocity; Freeze scales avatar speed by multiplier.
  - Wire schedule in `AtlasSimulation`.

---

## Task 5: Integration Tests & Parity Verification
- **Location:** `server-rs/tests/elemental_combat_skills.rs`
- **Specification:**
  - Test 1: Elemental multiplier verification (Fire vs Earth = 2x, Fire vs Water = 0.5x, Holy vs Void = 2x).
  - Test 2: Defense reduction verification (capping at 80%, minimum 1 damage floor).
  - Test 3: Skill casting, global cooldown lockout, and Dash impulse.
  - Test 4: Projectile spawning, linear motion, and collision with mob.
  - Test 5: Blizzard freeze reduces target speed, Thunder strike stuns target.

---

## Task 6: Documentation, Precheck & Ship
- Update `server-rs/README.md`.
- Verify `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test`.
- Run `./scripts/precheck.sh --no-install`.
- Commit changes to `feat/F-061`.
- Ship to `release/1.11` via `psrw ship --no-deploy`.
