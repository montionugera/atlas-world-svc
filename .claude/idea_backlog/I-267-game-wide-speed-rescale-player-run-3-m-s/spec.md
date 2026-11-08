---
title: "Game-wide speed rescale: player run 3 m/s"
id: I-267
status: idea
---

# Game-wide speed rescale: player run 3 m/s

## Goal
Owner decision 2026-11-08: the player runs at **3 m/s** (about 11 km/h, a fast jog for a 1 m person); race heights stay 0.9-1.2 m. Every other game speed scales by the same factor, so mobs, dashes, projectiles and knockback keep today's feel relative to the player.

## Problem
The player runs at **20 m/s** (72 km/h). Chain: `server-rs/src/content/stats.rs:108` gives base 20 + 0.2 x AGI + race bonus; `server-rs/src/simulation.rs:1386` multiplies by 10, giving 200 server units/s; `physics.rs:75` applies it as velocity per second, and the client draws 1 server unit = 0.1 m (`coord_scale` 0.1). The F-183 Maro Bell grey box (160 m long) takes 8 s to cross; Aden in Lineage 2 takes about a minute. At 3 m/s the same town takes about 53 s, so the town does not need to grow.

## Rule
- One factor: **k = 0.15** (20 m/s -> 3 m/s), applied once, in one place in code (a named constant), not by hand-editing every literal.
- Scaled: player base move speed and the AGI/race bonuses, mob move speeds (code and `content/bestiary/bestiary.json` if it feeds the runtime), NPC speeds, chase/wander/steering caps, dash speed, projectile speeds (players and mobs), and knockback/recoil impulses.
- Projectile **lifetimes** come from range / speed, so ranges stay the same and lifetimes grow; check no hard-coded lifetime or despawn timer breaks this.
- **Not** scaled: distances (attack range, aggro radius, map sizes), damage, cooldowns, tick rate. If a distance looks wrong at the new pace, file it as an idea instead.
- The client must agree: `game-client/src/UI/MetaIds.cs:169` mirrors the speed formula, and any animation walk/run thresholds or prediction that read speed must use the new numbers.

## Acceptance criteria
- [ ] A Rust test proves a level-1 player with 0 AGI and no race bonus moves 30 server units/s (3.0 m/s) on normal ground.
- [ ] A Rust test proves the ratio is unchanged: for at least one mob, the dash, and one projectile, new speed / new player speed equals old speed / old player speed (within 1 percent).
- [ ] The scale factor exists once in server code; a test or grep check fails if a raw pre-scale speed literal is reintroduced in the movement path.
- [ ] A Rust test proves walking the F-183 Maro Bell road from `playerSpawn` to the bell terrace takes 45-65 s of simulated time.
- [ ] The client displays and animates with the new speeds: the speed mirror in `MetaIds.cs` matches the server, and a Godot probe (via `scripts/godot-verify.sh`) shows the player plays the run clip, not idle or walk-only, at 3 m/s.
- [ ] All existing combat, mob AI, projectile and knockback tests pass, updated only where a number is the scaled speed itself (every changed expectation listed in the commit body).
- [ ] Gate 1 (`./scripts/precheck.sh`) green.
