---
title: "First 10 Minutes POC — The First Light of Maro Bell"
id: E-011
status: epic
---

# E-011: First 10 Minutes POC — The First Light of Maro Bell

## Outcome

An ordinary adventurer enters **Maro Bell** (`content/maps/maro-bell.json`, 80×160 m starter village under **The Great Bell** / ระฆังใหญ่) on the authoritative **Godot C# + `server-rs` (Rust ECS + `RustMetaEngine` SQLite)** stack and experiences a cohesive, server-connected **10-minute playable journey** that proves four emotions in sequence — **Wonder → Belonging (Friendship) → Playfulness (Agency) → Mystery** — without instructional overload, without portraying the player as a Cala Knight, and without corrupting canonical `q-maro-01..08` progression saves.

Central question answered by this Epic:
> **Can Atlas make an ordinary adventurer feel small in an enormous, beautiful world — and make helping someone with a small problem feel important enough to stay?**

## Overall Atlas Project Roadmap Context

| Phase | Name | Purpose | Contents | Completion Evidence | Explicitly Out of Scope |
|---|---|---|---|---|---|
| **P0** | Technical Foundation | Make existing systems reliable | **A** (Coordinate Contract Test `F-200`), **B** (Nakama Removal `F-201..F-203`), **C** (`millcross-ford` Compiled-Map Gate), **D** (`30 Hz` Rational Time Migration when ready) | Unit & persistence contracts, compiled-map verification, deterministic test harnesses | Multi-server shared saves |
| **P1** | **First 10 Minutes POC (`E-011`)** | Prove wonder, warmth, gameplay, and curiosity | Maro Bell guided 10-minute playtest (`POC-00`..`POC-06`) | Playable, observed 10-minute experience + evidence-backed playtest report | Full MMORPG economy, all 6 starter towns, completing all 8 Lv1–10 quests in 10 mins |
| **P2** | Vertical Slice | Prove one complete MMO gameplay loop | Full Maro Bell & Maro Valley exploration, all 8 starter quests (`q-maro-01..08`) at full Lv1–10 pacing, base-class skills/gear, Lantern Vermin family, multiplayer party, Field Boss / Bellkeeper | One representative regional MMO loop end-to-end with real server authority | Complete continent or Chapter VIII |
| **P3** | Launch Foundation | Scale repeatable content pipeline & MMO services | Six starter-town framework, hub, progression, and regional content pipelines | Reusable quest, NPC, world asset, and progression pipelines; production readiness gates | Every future region built simultaneously |
| **P4** | Base Game Story Releases | Deliver approved chapter arc progressively | Chapter 0–VIII milestones (world losing time) and associated regions | Approved chapter story delivered through staged releases | All chapters at initial launch |
| **P5** | Expansion I | Retrace the unfinished legacy of the Last Cala Knight | Historical traces of the Last Cala Knight (female, unnumbered, Himmel heart / Serie strength) | Substantial new journey centered on historical traces | Making players Cala Knights |

## Ten-Minute Critical Path & Emotional Arc in Maro Bell

| Time Window | Beat | Description | Primary Cast / System | Emotional Target (Wonder / Connection / Mystery) |
|---|---|---|---|---|
| **00:00–01:15** | **Arrival** | A tiny traveller enters Maro Bell along the lantern-lit road (`Tiny Human, Massive World`: foreground brass lanterns → village road → cliffs → distant porcelain ribs). | World / Environment (`maro-bell.json`) | Wonder 2→5 · Connection 0 · Mystery 0 |
| **01:15–02:30** | **The Great Bell** | The immense suspended Great Bell reveals itself between the cliffs. **Pip** (Spark/traveller, 19) welcomes the player (`q-maro-01` onboarding beat). | **Pip** (full interaction), **Reed** & **Tovin** (ambient presence) | Wonder 5 · Connection 1→3 · Mystery 0 |
| **02:30–04:15** | **A Small Kindness** | Help **Amber** (lantern-oil seller, 34) with a practical lantern errand (`q-maro-02` beat); a village lantern visibly transitions unlit → repaired/lit. | **Amber** (full interaction) | Wonder 4 · Connection 4 · Mystery 1 |
| **04:15–06:15** | **A Playful Encounter** | Follow a trail to recover Pip's missing delivery (`q-maro-03` beat) and fight **Soot Munchers** (Lv1–3, shared Lantern Vermin rig) under Rust authority. | **Pip** / **Soot Muncher** | Wonder 3 · Connection 5 · Mystery 2 |
| **06:15–07:45** | **The Old Lantern (First Trace)** | **Bram** (Heart, 60) shows an old family lantern repaired long ago with extraordinary, uncredited care (`q-maro-04` `first_trace` beat — no identity reveal). | **Bram** (full interaction) · First Trace | Wonder 4 · Connection 5 · Mystery 4 |
| **07:45–09:00** | **A Bell Out of Time** | **Edda** (Scar, 46) notices an impossible discrepancy in the Great Bell's schedule (`q-maro-05` beat). | **Edda** (full interaction) | Wonder 4 · Connection 4 · Mystery 4 |
| **09:00–10:00** | **The Impossible Flame (Time-Wound)** | A lantern abruptly burns through its oil in seconds (`q-maro-06` `time_wound` climax + optional visual glimpse of **Oil Leech**); ends with an ordinary invitation to keep helping beyond the Bell. | **Amber / Edda / Bram** · Time-Wound | Wonder 5 · Connection 4 · Mystery 5 |

## Architectural & Canon Guardrails

1. **Canon-Safe POC Scenario Isolation:** The canonical `q-maro-01..08` chain spans Levels 1–10. The 10-minute POC uses an isolated POC scenario/demo state (or prerequisite-gated demo beats) so showcasing `first_trace` (`q-maro-04`) and `time_wound` (`q-maro-06`) within 10 minutes never silently marks Lv4–7 quests completed in a normal progression save.
2. **Locked Technical Stack:** `unitContract: "metres-v1"` (`1 unit = 1 m`), locked 2.5D ground-following height (`rapier2d` planar authority, `35°` walkable slope parity, no height-dependent combat), single-server `server-rs` + `RustMetaEngine` (`SqliteMetaStore`, no Nakama), existing `maro-bell.json` (`80×160 m`).
3. **Locked Story & Cast Rules:**
   - Last Cala Knight is female, unnumbered in player text ("the Ninth" retired), never named/revealed in the POC; players are ordinary adventurers, never Cala Knights.
   - All 6 Maro Bell NPCs present: **Pip, Amber, Bram, Edda** (full POC interaction) + **Reed, Tovin** (ambient/minimal dialogue).
   - Enemy focus: **Soot Muncher** fully playable on the shared **Lantern Vermin** rig (Wick Runner & full Oil Leech combat deferred to Vertical Slice; optional visual Oil Leech glimpse in Slice 5).

## Slices

- **POC-00 — POC Integration Baseline:** Repeatable `maro-bell` launch profile on Godot C# + `server-rs` (`metres-v1`, 2.5D, `35°` slope, `RustMetaEngine`), mapped `maro-bell` room ID on server & client with no silent fallback to `map-for-play`, deterministic test character reset, and minimal diagnostics HUD (position, map ID, connection, FPS, activePOC beat).
- **POC-01 — Wonder: The Road to the Great Bell (00:00–02:30):** Spawn-to-Bell lantern road composition (`Tiny Human, Massive World`: foreground lanterns, cliffs, suspended Great Bell, distant porcelain ribs), reveal camera framing/occlusion, environmental audio, **Pip** greeting (`q-maro-01` beat), and ambient **Reed** / **Tovin** placement.
- **POC-02 — Warmth: A Small Kindness (02:30–04:15):** **Amber** interaction (`q-maro-02` beat), reusable interactable lantern/supply object, authoritative beat completion in `server-rs`, visible world-state transition (unlit → repaired/lit lantern), and warm village acknowledgment.
- **POC-03 — Playfulness: The Missing Delivery (04:15–06:15):** Shared **Lantern Vermin** base rig with polished **Soot Muncher** appearance (idle/move/attack/hit/defeat clips), `server-rs` authoritative combat encounter & parcel recovery along Pip's trail (`q-maro-03` beat), combat SFX/VFX, and encounter reset/replay path.
- **POC-04 — Emotional Mystery: Bram's Old Lantern / First Trace (06:15–07:45):** **Bram** interaction (`q-maro-04` beat), old lantern hero prop with uncredited precision repair detail, close-up inspect interaction, restrained audio cue, and canon-safe `first_trace` POC state persistence without spoiling the Last Cala Knight's identity.
- **POC-05 — Disturbance: The Bell Out of Time & The Impossible Flame (07:45–10:00):** **Edda** bell-timing anomaly dialogue (`q-maro-05` beat) chained into a deterministic, replayable **Time-Wound** lantern oil-drain climax (`q-maro-06` beat, synchronized light/audio transition + optional Oil Leech visual glimpse) and closing invitation toward the wider valley.
- **POC-06 — Player Impression Validation & Scorecard Gate:** End-to-end 10-minute POC playthrough harness + headless Godot/Rust verification probe (`ATLAS_VERIFY_POC_MARO_10M`), telemetry capture (beat timestamps, FPS, interactions), and the 7-metric POC Evaluation Scorecard & playtest debrief template.
