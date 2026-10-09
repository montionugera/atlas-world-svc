# server-rs live gameplay parity — plan (TDD + audit loop)

**Goal (verbatim):** Make the live server-rs runtime reach gameplay parity with the legacy Colyseus server for every behaviour, each fixed test-first, then re-audit and loop until a fresh audit finds no gap.

**Root pattern behind every gap:** systems were built and unit-tested in isolation but never wired into the
live path (`main.rs` → `populate_entities` is a deterministic *replay harness* population). Tests passed, the
game didn't work.

**Structural guard (do first, prevents recurrence):**
- `AtlasSimulation::live(cfg)` = the ONLY constructor `main.rs` uses. `populate_entities` stays for the golden-trace harness only.
- Every behaviour below gets a **live-path integration test** in `server-rs/tests/live_runtime.rs` that builds the sim
  via `AtlasSimulation::live(..)` (same as `main.rs`), steps N ticks, and asserts the behaviour. A system that exists
  but isn't wired fails these tests.
- Client-visible behaviours also get a check in `client/react-client/e2e/gameplay.e2e.mjs` (real Chromium vs live server).

Legacy source: `git show 19d32661^:colyseus-server/src/<path>` (deleted in F-064).

## Gap list (audit 2026-10-09, ranked by player visibility)

| # | Behaviour | Status | RED test first (live_runtime.rs unless noted) | Fix |
|---|---|---|---|---|
| 1 | Mob wander / chase / return-home | not wired | mobs' positions change within 3s with no players near; a player placed within chase_range is approached (distance shrinks) | live mobs spawn with full bundle (MobAi, ThreatTable, ElementalAttributes, MobSpawnAnchor, bestiary stats) — share one `spawn_mob` fn with mob_lifecycle |
| 1b | Proximity aggro | missing | player inside chase_range → mob ThreatTable top_target == player | aggro scan in mob_ai: add_threat for nearest live player within chase_range; damage → add_threat on the victim mob |
| 1c | Mob move speed | bug | chase speed == derived bestiary speed, not attack_power | `move_speed` on MobAi (or component) from `derive_mob_stats().speed` |
| 2 | Mob melee closes distance + single cooldown | partial | mob chases then damages player; cooldown decremented once per tick | after 1; remove double cooldown decrement (combat.rs:37 vs mob_ai.rs:36) |
| 4 | Player death → respawn | missing | player HP→0, after respawn delay HP==max, is_alive, at spawn point | `player_respawn_system` (legacy delay) |
| 5 | Mob death → despawn → respawn | not wired | killed mob despawned, id appears in removed_ids, respawns after delay with full bundle | anchor on live mobs; sim tracks despawned ids → snapshot `removed_ids` |
| 6 | Physics collision | missing | overlapping player+mob / player+player pushed apart to ≥ r1+r2 within a few ticks; arena bounds hold | extend separation to all bodies (player, bot, mob) with radii; map statics later (#13) |
| 7 | Real max_health on wire | bug | snapshot max_health == Health.max for a non-100 avatar | send `health.max` (main.rs:123) |
| 8 | Player attack gated by attack input (legacy attackQueue) | divergent | human avatar does not damage mob in range unless input.attack; bots still auto | gate on PlayerInputState.attack for human avatars |
| 9 | Projectiles visible | missing | snapshot contains EntityType::Projectile after a cast resolves | capture_snapshot includes Projectile entities; client renders them |
| 10 | Kill/XP events | not wired | mob kill → event on wire; MatchEventQueue drained in main loop | drain in `main.rs`; add events to WorldSnapshot schema; real target_id |
| 11 | Disconnect cleanup | missing | ws disconnect → avatar removed, id in removed_ids (only when session's last socket closes) | ws emits disconnect notice; main calls `remove_player_avatar` |
| 3 | Mob names / types | missing (wire) | client e2e: no "Unknown Mob" label; snapshot carries mob type | `mob_type` in EntityDelta (fbs + Rust + TS regen); client name lookup |
| 12 | Bots seek mobs | dumb | bot moves toward nearest mob within range | steer bots to nearest mob |
| 13 | Map identity / dims / spawn areas / statics | missing | `MAP_ID` selects dims + spawn areas from content/generated; static obstacles block movement | map config loader |

## Waves (sequential — they share simulation.rs/main.rs)

- **Wave A — sim wiring:** guard + rows 1, 1b, 1c, 2, 4, 5 (sim side), 6, 7, 8, 11.
- **Wave B — wire protocol + client:** rows 3, 5 (removed_ids client), 9, 10; client renders projectiles, names, removals; `gameplay.e2e.mjs`.
- **Wave C — world:** rows 12, 13.

Each wave: RED tests → GREEN → `cargo fmt && cargo clippy --all-targets -D warnings && cargo test` → independent review →
refactor → re-verify → restart live server → e2e → commit.

## Audit loop
After Wave C: a fresh auditor (no prior context) repeats the parity audit against the live path. Every new finding
becomes a row here and a new wave. Done = an audit returns zero gaps + Gate 1 PASS + e2e PASS.

## README
Update `server-rs/README.md` (live runtime, env: MAP_ID, respawn timers) and `client/react-client/README.md` per wave.
