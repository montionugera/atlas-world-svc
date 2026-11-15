# Implementation Plan — I-309 / F-224: Maro Bell Concept-Faithful Town Overhaul

## Goal
Deliver the complete Maro Bell Concept-Faithful Town Overhaul across Categories A–F of the Master Checklist (`maro-bell-master-checklist.md`): remove environment black outlines & grey-box slabs, build the 3-tier elevation terraces, river & stone arch bridges, fortified city walls & retaining walls, 5-tier modular building kit (`Bell Sanctuary Arch`, `Civic Guild Hall`, `Inn & Tavern`, `2-Story Houses A/B`, `1-Story Cottage`, `Windmill`, `Plaza Fountain`, `Market Stalls`, `Bell Banner Pole`), multi-species trees/bushes/plaza surfaces, and 9-zone urban layout verified against the 3 canon concept boards.

## Tasks

- [x] **Task 1 (Category A — Engine Render Clean-Up):**
  - Update `EntityView.cs`, `MapChunkStreamer.cs`, and `VerticalSliceRoot.cs` so environment props/structures do not attach `outline.gdshader` `NextPass` black outlines.
  - Suppress grey-box debug slabs (`valley-wall-*`, `cliff-*`, `height-post-*`, `npc-spot-*`) when rendering dressed Maro Bell while preserving `staticObstacles` (`42` entries).
- [x] **Task 2 (Categories C, D, E — Studio-Private Asset Kit Generation & Upload):**
  - Build, gate-verify (`env_gate.py`), and upload to Asset Studio (`rights=restricted`, tag `maro-concept-overhaul-1115`) the new structural, architectural, foliage, and surface pieces:
    - Bridges, Walls & Stairs: `env:maro-stone-arch-bridge`, `env:maro-retaining-wall-arch`, `env:maro-terrace-stairs`, `env:maro-city-curtain-wall`, `env:maro-city-bastion`, `env:maro-aqueduct-arch`
    - Buildings (5 Scale Tiers): `env:maro-bell-sanctuary-arch`, `env:maro-civic-guild-hall`, `env:maro-inn-tavern`, `env:maro-house-2story-a`, `env:maro-house-2story-b`, `env:maro-house-1story-b`, `env:maro-windmill`
    - Plaza & Market Props: `env:maro-plaza-fountain`, `env:maro-market-stall-a`, `env:maro-market-stall-b`, `env:maro-bell-banner-pole`
    - Foliage & Surfaces: `env:maro-blossom-tree-pink`, `env:maro-cypress-pine-a`, `env:maro-cypress-pine-b`, `env:maro-flower-bush-lavender`, `env:maro-planter-box-flowers`, `env:maro-ivy-wall-vine`, `env:maro-ground-plaza-flagstone`, `env:maro-ground-terrace-tile`
  - Register all new keys as `studio-private` pull-only entries in `game-client/assets/manifest.json` and `art-source/LICENSES.md`, then pull into `game-client/studio-cache/`.
- [x] **Task 3 (Categories B, C, D, E — 3-Tier Terrain, River, 9-Zone Urban Layout & Scene Hookup):**
  - Dress `content/maps/maro-bell.json` and `MaroBellVerify.cs` with the 3-tier elevation terraces (`0m`, `+3.0m`, `+6.5m`), southern river/moat (`-2.2m`) & reflective water surface, stone arch bridge, curved city curtain walls & bastions, terrace retaining walls & grand stairs, Central Plaza flagstone ring & astrolabe fountain, and dense 9-zone building streetwalls + multi-species foliage without modifying `staticObstacles`.
- [x] **Task 4 (Category F — 5 Concept-Matched Camera Renders, Review & Gate 1):**
  - Render all 5 concept-matched camera views (`F1` Riverside & Bridge, `F2` Market Boulevard Looking North, `F3` Central Plaza & Fountain, `F4` Great Bell Sanctuary Terrace, `F5` Bird's-Eye 9-Zone Overview), downscale (`sips -Z 1024`), visually inspect via `read_file`, update `maro_bell_master_checklist.md` to `[x]`, and pass `scripts/precheck.sh --no-install`.
