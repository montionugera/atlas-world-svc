# F-185 Plan: 1 unit = 1 m (divide every server number by 10)

**Contract (frozen):** 1 game unit = 1 metre everywhere. Server lengths, positions and speeds = old value / 10. `coord_scale` becomes 1.0. Cooldowns, damage, tick rate, angles are NOT touched. Never flip `coord_scale` alone.
**Rule per number:** length (m-ish) -> /10; speed -> /10 (via `SPEED_SCALE` 0.15 -> 0.015); acceleration -> /10; time, damage, counts, ratios -> unchanged. Lifetimes keep distance: `scaled_lifetime` stays consistent.
**Parity baseline:** capture BEFORE edits (Phase 0) the on-screen metres: Maro Bell crossing time, player run 3 m/s, mob chase m/s, knockback metres, a projectile range. They must match after.

## Phase 0 - Baseline + guard (R2)
- Record parity numbers from existing tests (speed_rescale_test.rs, maro-bell.test.mjs) into `docs/unit-contract.md` ("1 unit = 1 m", the per-number rule above).
- Add `scripts/tests/unit-contract.test.mjs`: fails if any `content/maps/*.json` still has width/height > 1000 or any *_meters field > 1000 (red now, green after Phase 2).

## Phase 1 - server-rs (R1, one Sonnet worker, one cargo job at a time)
- `map.rs`: coord_scale 0.1 -> 1.0 (both places), default arena 1000 -> 100, doc comment = contract.
- Divide by 10 every length/speed/accel literal in: ecs/components.rs, content/{map,races,stats,bestiary}.rs, simulation.rs, main.rs, systems/{projectile,combat,player_input,mob_ai,steering,live,skill_execution,separation}.rs, combat/{skills,buffs}.rs. `separation.rs:19` min_separation_radius included.
- `core/speed.rs`: SPEED_SCALE 0.15 -> 0.015; update guard test + `speed_rescale_test.rs` pins (30 -> 3 units/s; Maro Bell walk still 45-65 s with map 80x160).
- Re-check rapier: `physics/world.rs` integration params, collider sizes, knockback impulses so push distance in metres is unchanged.
- Gate: `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`, parity numbers equal to Phase 0.

## Phase 2 - content (R1, committed idempotent script)
- `scripts/rescale_units_to_metres.mjs` (model: `scripts/rescale_spine.mjs`): divides width, height, chunkSizeWorld, playerSpawn, routes, groundZones, heightTerraces.radius, structures x/z/radius/size, props, spawnAreas, staticObstacles, arrivalPointMeters, triggerBoxMeters, minSpacingMeters in all 45 `content/maps/*.json`; guard: marker `"unitContract":"metres-v1"` in each file, skip if present.
- `_manifest.runtime.json`: starterSpawns x/y /10; safeZoneRadiusMeters 40 -> 4? NO: it is already metres-true (40 m) -> leave; verify against Maro Bell. Studio nodes: `dimensions_meters` 4000 -> 400, `spawn_point_meters` fixed (98 + 2 files, studio schema description updated).
- Regenerate via `scripts/compile_world_maps.py` (drop coord_scale math, default 1) and re-run its drift gates.
- Update `validate_studio_hierarchy.py` ranges (road 3.5-12 and structure radii) to metres, and `maro-bell.test.mjs` (width 80, height 160, remove `*10`).

## Phase 3 - clients (R1)
- Godot: `ServerCoordScale`, EntityManager, UnifiedMapDocument, MapChunkStreamer, VerifyVerticalSliceProbe -> 1.0f; `MetaIds.cs` speed mirror /10; anything with literal server-unit sizes. One dotnet/Godot job at a time (Argon tab may be running Godot).
- React client: prediction constants (F-184 scaled them) /10; map render scale.
- Contracts `derivedStats.ts` mirror /10; nakama unchecked -> grep.

## Phase 4 - verify + ship (R1)
- Parity table before/after, Godot Maro Bell probe screenshot same framing, React loads.
- code-reviewer + rust reviewer, ONE fix round; `PRECHECK_FULL=1 ./scripts/precheck.sh`; `psrw ship --no-deploy`; review link.

## Open items found by scout (not yet inventoried)
Per-literal list for projectile.rs (~40) and components.rs (~22); bestiary/mob JSON with lengths; nakama use; MaroBellVerify.cs.
