---
title: "POC-03: Playfulness — The Missing Delivery (04:15-06:15 Lantern Vermin shared rig, Soot Muncher encounter, parcel recovery)"
id: I-290
status: idea
epic: E-011
---

# I-290 POC-03: Playfulness — The Missing Delivery (04:15–06:15)

## Goal
Prove that moving, targeting, and using an introductory combat action feels responsive and enjoyable under `server-rs` authority without turning the opening into a heavy combat tutorial.

## Player-Facing Experience (04:15–06:15)
**Pip's** delivery has gone missing (`q-maro-03` beat). The player follows a nearby trail in `maro-bell`, encounters **Soot Munchers** (Lv1–3, built on the shared **Lantern Vermin** rig) disturbing supplies, defeats them in a playful encounter, recovers the parcel, and returns to the village.

## Scope In vs Out
- **Scope In:** Shared **Lantern Vermin** base rig with polished **Soot Muncher** appearance (idle, locomotion, attack, hit reaction, defeat animations), `server-rs` authoritative HP/damage/range/defeat logic, Godot attack & hit VFX/SFX, parcel recovery interaction, and encounter reset/replay path.
- **Scope Out:** Full class balance, all advanced skills, boss combat, PvP, elaborate loot tables, and full Wick Runner / Oil Leech combat encounters (deferred to P2 Vertical Slice).

## Acceptance criteria
- [ ] **Soot Muncher** spawns on the shared **Lantern Vermin** rig with working idle, move, attack, hit, and defeat animations.
- [ ] `server-rs` authoritatively resolves attack range (metres), damage, defeat, and parcel recovery for the `q-maro-03` POC beat.
- [ ] Attack animation, collision feedback, and visual/audio hit reaction align in Godot.
- [ ] Encounter resets cleanly for repeatable playtest runs.
