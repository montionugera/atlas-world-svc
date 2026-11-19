# I-309: Maro Bell Concept-Faithful Town Overhaul — Clean Render, 3-Tier Terraces, River & Bridges, City Walls, Modular Buildings, Foliage & 9-Zone Urban Layout

## Goal (Owner, Verbatim)
- `"ทำไมมันมีเส้นดำๆเยอะเลย เอาออกได้ไหม"`
- `"แล้วก็มันไม่เห็น Design เลยสักนิดเดียว เราวางแผนยังไงดีให้ได้ Model ของเมืองใกล้เคียงกับ Concept Art ที่สุด"`
- `"เราวางแผน อย่างละเอียด แต่ละส่วน จากนั้น ก็รวมงานที่ทำพร้อมๆกันได้แล้วค่อยๆทำส่วนโครงสร้างก่อน เช่น โซนนิ่ง อาคาร ถนน สะพาน แม่น้ำ ระดับความสูงของพื้น กำแพงเมือง สภาพโดยรอบ หา Asset ต้นไม้หลายๆแบบ พุ่มไม้ พื้นหญ้า พื้นหิน"`
- `"ทำเช็คลิส อะไรแบบนี้ก่อนไหม"` -> `"Okei"`

## Problem
1. **Heavy Black Outlines on Environment (`outline.gdshader`):** `MapChunkStreamer.cs` and `VerticalSliceRoot.cs` call `EntityView.ApplyAnimeToonShading(..., EntityKind.Npc)` on all environment GLBs, attaching the inverted-hull `outline.gdshader` `NextPass` (`outline_thickness * clip_position.w`), which extrudes jagged black bands across every building roof crease, cliff crack, curb edge, and tree trunk.
2. **Legacy Grey-Box Slabs & Flat Meadow Layout (`content/maps/maro-bell.json`):** The map still uses the flat `F-183` grey-box skeleton (`terrainAmplitude: 0`, 30m grey slabs `valley-wall-west/east` and `cliff-west/east`, `great-bell` floating in mid-air at `hover: 10m`, 10 grey `height-post-*` tombstones at the entrance, and only 3 isolated houses across an empty 80x160m grass plane).
3. **Missing Architectural & Urban Kit from the Canon Concept Boards (`11-atlas-cala-knight-town-design-board.png`, `10-maro-bell-town-concept-showcase.png`, `05-maro-bell-riverside-market.png`):**
   - Concept Art defines a **9-Zone Multi-Tiered Walled Town** (`Zone 1 Great Bell Plaza`, `Zone 2 Market District`, `Zone 3 Crafting Quarter`, `Zone 4 Residential Area`, `Zone 5 Adventurer's Guild`, `Zone 6 Inn & Tavern`, `Zone 7 Shrine & Records`, `Zone 8 North Gate`, `Zone 9 South Gate & River Bridge`) with 5 architectural scale tiers (`Door 3.2m`, `1-Story House 6m`, `2-Story House 12m`, `Civic Hall/Guild 18-24m`, `Bell Tower Sanctuary 26-30m`), a stone arch bridge over a river/moat, grand terrace stairs & retaining walls, a central plaza fountain/astrolabe, market stalls, blue-gold bell banners, and diverse foliage (pink blossom trees, cypress pines, lavender flower bushes, flower planters, ivy vines) + plaza flagstone and terrace tile ground surfaces.

## Architecture & Scope

### Category A — Render Clean-Up & Lighting
- **A1 (Strip Environment Black Outlines):** Update `EntityView.ApplyAnimeToonShading` (or add `includeOutline: false` for environment props in `MapChunkStreamer.cs` and `VerticalSliceRoot.cs`) so environment GLBs never receive `outline.gdshader` `NextPass` while preserving character/mob outlines.
- **A2 (Eliminate Grey-Box Slabs & Debug Posts from Visual Scene):** Replace/suppress `valley-wall-west/east`, `cliff-west/east`, `height-post-*`, and `npc-spot-*` white/grey boxes in `MapChunkStreamer` / `MaroBellVerify.Render` while keeping server `staticObstacles` (`42` entries) 100% byte-identical for gameplay collision parity.
- **A3 (Golden Alpine Sun, Sky & Water Shader):** Upgrade `MaroBellVerify.Render` and live scene lighting with warm directional sunlight, sky horizon gradient, and reflective river water surface (`river_water_surface`).

### Category B — Terrain Elevation (3 Tiers), River/Moat & Outer Valley Surroundings
- **B1 (3-Tiered Elevation Terraces):**
  - Riverbed / Moat (`y = -2.2m`) along the south gate approach (`z = 78..92`) and curving along the outer curtain wall.
  - Tier 1 Lower Town (`y = 0.0m`, `z = 76..10`): South Gate (`Zone 9`), Market Boulevard (`Zone 2`), Crafting Quarter (`Zone 3`).
  - Tier 2 Mid Town & Central Plaza (`y = +3.0m`, `z = 10..-35`): Central Plaza Ring, Residential Area (`Zone 4`), Adventurer's Guild (`Zone 5`), Inn & Tavern (`Zone 6`).
  - Tier 3 Upper Bell Sanctuary (`y = +6.5m`, `z = -35..-72`): Great Bell Plaza (`Zone 1`), Shrine & Records (`Zone 7`), North Gate (`Zone 8`).
- **B2 (River, Canal & Riverside Dock):** Water plane, stone quay embankments, and wooden dock by the south bridge.
- **B3 (Outer Valley Cliffs & Aqueduct):** Layered valley cliff faces (`r05` + rocks), distant stone aqueduct arches (`env:maro-aqueduct-arch`), and waterfall accent.

### Category C — Roads, Plaza, Bridges, Retaining Walls, Stairs & City Walls
- **C1 (9-Zone Road & Plaza Network):** Wide Main Boulevard (`width: 12m`), Central Circular Plaza (`diameter: 44m`), and radial streets (`width: 6–8m`) connecting Zones 1–9.
- **C2 (Stone Arch Bridges):** `env:maro-stone-arch-bridge` spanning the southern river (`Zone 9`) and northern ravine (`Zone 8`).
- **C3 (Terrace Retaining Walls & Grand Stone Stairs):** `env:maro-retaining-wall-arch` and `env:maro-terrace-stairs` connecting Tier 1 -> Tier 2 and Tier 2 -> Tier 3.
- **C4 (Fortified City Curtain Wall & Bastions):** `env:maro-city-curtain-wall` and `env:maro-city-bastion` curving around the town perimeter, tying into `gate-west` / `gate-east` (`env:maro-gate-tower`).

### Category D — 5-Tier Modular Building Kit & 9-Zone Urban Massing (`studio-private`)
- **D1 (`env:maro-bell-sanctuary-arch`, `28m` Landmark):** Monumental white limestone, royal blue & gold arched bell sanctuary housing `r20` (`env:maro-great-bell`) at `Zone 1`.
- **D2 (`env:maro-civic-guild-hall`, `20m` & `env:maro-inn-tavern`, `13.5m`):** Civic Guild Hall at `Zone 5` and 2-story timber-stone Inn & Tavern at `Zone 6`.
- **D3 (`env:maro-house-2story-a` & `env:maro-house-2story-b`, `12m`):** Blue-roofed 2-story timber-frame townhouses & shops forming continuous streetwalls along `Zone 2 Market Boulevard`, `Zone 3`, and `Zone 4`.
- **D4 (`env:maro-house-1story-b`, `6.5m` & `env:maro-windmill`, `17m`):** 1-story terracotta/blue cottage for `Zone 4` and stone tower windmill for `Zone 3/4` ridge, alongside `r04` (`amber-shop`), `r17` (`bram-house`), and `r18` (`tovin-shrine`).
- **D5 (`env:maro-plaza-fountain`, `env:maro-market-stall-a`, `env:maro-market-stall-b`, `env:maro-bell-banner-pole`):** Central plaza astrolabe fountain, striped market stalls, and blue-gold bell banners.

### Category E — Ground Surfaces, Multi-Species Trees & Bushes (`studio-private`)
- **E1 (Ground Surfaces):** `env:maro-ground-plaza-flagstone` (warm cream-grey plaza stone), `env:maro-ground-terrace-tile` (stepped stone tiles), plus `r06` cobble road, `r16` meadow grass & dirt edge, and `river_water_surface`.
- **E2 (Multi-Species Trees — 6 types):** Existing `apricot-tree-a/b` & `broadleaf-tree-a/b` + new `env:maro-blossom-tree-pink` (pink flowering cherry/blossom tree) and `env:maro-cypress-pine-a/b` (tall tapered alpine cypress/pine).
- **E3 (Bushes, Flowers & Ivy):** Existing `bush-a/b/c` & `grass-clump-*` + new `env:maro-flower-bush-lavender` (purple/pink flower bush), `env:maro-planter-box-flowers` (wooden flower planter), and `env:maro-ivy-wall-vine` (hanging wall ivy).

### Category F — Shot-by-Shot Concept Art Verification
- Render and inspect 5 concept-matched camera views (`F1` Riverside & South Bridge, `F2` Main Market Boulevard Looking North, `F3` Central Plaza & Astrolabe Fountain, `F4` Great Bell Sanctuary Terrace, `F5` Bird's-Eye 9-Zone Town Overview).

## Acceptance Criteria
- [ ] **AC1 (No Black Outlines & No Grey-Box Slabs):** Environment meshes render with zero `outline.gdshader` `NextPass` black lines and zero grey-box placeholder walls/tombstones in camera renders.
- [ ] **AC2 (Structural & Architectural Kit Gate Green):** All new `env:maro-*` structural, building, prop, foliage, and surface assets pass `env_gate.py` / `check_asset_manifest.mjs`, are uploaded to Asset Studio (`rights=restricted`), and registered as `studio-private` pull-only entries (`0` `.glb`/textures/renders tracked in git).
- [ ] **AC3 (3-Tier Terrain, River, Bridges, Walls & 9-Zone Urban Massing):** `content/maps/maro-bell.json` and `MaroBellVerify` render the 3 elevation tiers, river & stone arch bridge, city curtain walls & retaining walls, grand stairs, Bell Sanctuary Arch framing `r20`, Civic Guild Hall, Inn, 2-story streetwalls, Windmill, Market Stalls, Plaza Fountain, multi-species trees/bushes, and plaza flagstone while keeping `staticObstacles` at `42` entries byte-identical.
- [ ] **AC4 (5 Concept-Matched Camera Shots & Full Gate 1):** All 5 camera shots (`F1..F5`) are rendered, downscaled (`sips -Z 1024`), visually inspected via `read_file`, linked via `img-preview-link`, and `scripts/precheck.sh --no-install` passes 100%.
