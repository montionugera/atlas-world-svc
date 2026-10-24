# Dedicated Semantic-Zoom World, Town & Multi-Floor Dungeon Atlas Component (`atlas-world-svc`)

## Goal
Replace fragmented, cluttered map canvases in the World Studio Observatory (`scripts/catalog_explorer_web.py`) with a **Dedicated Semantic-Zoom World & Dungeon Atlas Component** (`DedicatedWorldAtlasComponent`) that renders crystal-clear macro geography (travel paths, towns, hunting areas, dungeons like *Gludin Village* and *The Ant Nest*), automatically transitions level-of-detail (LOD) as the user zooms into Town streets/buildings/service marks, opens multi-floor underground/tower Dungeon sub-maps via clickable warp points, and filters spawns/markers (`Monster`, `Mini-Boss`, `Raid`, `MVP`, `Town Marks`) in real time.

## Non-Goals
- Rewriting the 3D Godot client terrain renderer (`game-client/`) — this spec scopes the 2D Cartographic Atlas & Data Model in `content/studio/` and `scripts/catalog_explorer_web.py`.
- Removing the existing 4-perspective governance/rationale editor (`World History`, `Continent`, `District`, `Town/Hunting Area` inspector cards remain accessible below/beside the unified map).

## 6-Role Studio Council & 7 MDA Experience Pillars
This specification is co-authored and gated by the 6 specialized Studio Roles in `.claude/agents/`:
1. **Product Owner (`product-owner.md`):** Enforces the T-Shaped Production Strategy and the **7 MDA Experience Pillars**:
   - **Aesthetic:** Uncluttered Lineage II (`c3_aden` / `l2hub` / `PMFun`) parchment & blueprint cartography; zero overlapping `[D01..D11]` debug boxes at macro zoom.
   - **Continuity:** Continuous spatial & level flow from Starter Town (`Lv.1–10`) → Field Hunting (`Lv.1–15`) → Multi-Floor Dungeon (`B1→B2→B3`, `Lv.9–22`) → All-Race Convergence Hub (`Lv.10–20`) → Vertical Tower (`1F→2F→3F`, `Lv.25–38`).
   - **Narrative:** Every town, road, and dungeon floor ties to the 4-Chapter History (`1.1 Founding` .. `1.4 Awakening`) and God-Scars.
   - **Challenge:** Strict boss power hierarchy (`GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB`) escalating floor-by-floor.
   - **Discovery:** 3-Tier Semantic Zoom LOD (`1.0×–2.2×` Macro → `2.2×–4.5×` Regional → `4.5×–12.0×` Town Street Blueprint) plus clickable Dungeon/Tower Warp Points.
   - **Fantasy:** 6 Playable Races, class guild halls, temples, and dual Canon + Lineage II archetype naming (*Lantern Hollow / Gludin Village*, *Kiln Cellar / The Ant Nest*, *Escapement Anvil / Cruma Tower*).
   - **Submission (Abiding Pastime / Flow):** Instant `Monster | Mini-Boss | Raid | MVP | Town Marks` + `Level Band` filtering (`<16ms`) and frictionless Hub-and-Spoke farming loops.
2. **Game Designer Lead (`game-designer-lead.md`) & Player Growth Path Designer (`player-growth-path-designer.md`):** Owns the Stage A–L travel road network, the 7 canonical Town Service Marks (`equip_shop`, `consumable_shop`, `blacksmith`, `temple`, `warehouse`, `guild`, `gatekeeper`), and the Multi-Floor Underground (`B1⇄B2⇄B3`) & Tower (`1F⇄2F⇄3F`) warp topology.
3. **Game Story Designer (`game-story-designer.md`) & Monster/Mob Designer (`monster-and-mob-designer.md`):** Owns the numbered `1..12` Town Building & color-coded NPC Roster (*Oren by Cheese* standard: `trainer` Red, `merchant` Yellow, `warehouse` Green, `guard` Blue, `gatekeeper` Purple, `priest` Cyan) and the `Monster / Mini-Boss / Raid / MVP` spawn & filter taxonomy.
4. **Lead Systems & Map Architect (`systems-map-architect.md`):** Enforces 100% data-driven rendering from `t_shaped_world_atlas.json` via `AtlasStateStore`, `OverlandGeographicRenderer` (with priority AABB label collision culling), and `DungeonSubMapRenderer` (push/pop floor stack).

## Users & Jobs
- **World Designer / Product Owner:** Inspect the entire world geography on one uncluttered canvas, trace travel highways between Towns (`Lantern Hollow / Gludin Village`) and Hunting/Dungeon zones (`Kiln Cellar / The Ant Nest`), zoom smoothly into any Town to verify street/building/shop placement (`Equip`, `Consumable`, `Blacksmith`, `Temple`, `Warehouse`, `Guild`, `Gatekeeper`), click Dungeon Warp Points to inspect floor-by-floor underground/tower layouts (`B1 → B2 → B3`, `1F → 2F → 3F`), and filter spawns by tier (`Monster`, `MVP`, `Raid`).

## Success Measure
- **100% single-canvas geographic legibility:** Zero overlapping `[D01..D11]` dashed grid boxes at macro zoom; all 3 continents, travel paths, towns, hunting areas, and dungeon entrances render with Lineage II (`c3_aden` / `l2hub`) parchment clarity.
- **Automatic 3-tier Semantic Zoom (LOD) transition:** Zooming across thresholds (`1.0×–2.2×` Macro Geography → `2.2×–4.5×` Regional Roads & Level Bands → `4.5×–12.0×` Town Street, Building Footprints & Service Marks) updates visible detail in `<16ms` without page reload.
- **Multi-floor Dungeon & Tower Warp traversal:** Clicking any Dungeon/Tower warp point opens its sub-map overlay/canvas with floor switcher and inter-floor warp portals (`Surface ⇄ B1 ⇄ B2 ⇄ B3` or `1F ⇄ 2F ⇄ 3F`).

## Approaches Considered
1. **Unified Semantic-Zoom SVG/Canvas Atlas Component with Sub-Map Stack (Recommended):** One dedicated `DedicatedWorldAtlasComponent` backed by the structured cartographic dataset (`content/studio/t_shaped_world_atlas.json`, governed by `content/studio/schemas/t-shaped-world-atlas.schema.json`). Uses continuous pan/zoom with automatic LOD layer visibility (`lod-macro`, `lod-regional`, `lod-street`), inline/focused Town Street & Building blueprints (like Lineage II *Gludin/Dark Elven Village* and *Oren by Cheese*), and a push/pop Sub-Map Stack for Multi-Floor Underground Dungeons & Towers.
2. **Separate Static Tabs per Scale (Current):** Requires manual tab switching between `World`, `Continent`, `District`, and `Connected Map Directory`; loses spatial context when zooming. Rejected.
3. **WebGL 3D Globe:** Heavy shader complexity and poor 2D parchment blueprint/text legibility for town shops and NPC rosters. Rejected.

## Requirements (EARS)
- **R-1 (Macro Geographic Clarity):** While `zoom < 2.2×` on the Overland World Canvas, the `DedicatedWorldAtlasComponent` shall render topographic parchment coastlines, mountain ridges, rivers, continuous travel highways, and hand-illustrated landmarks (Towns, Castles, Fortresses, Hunting Areas, Dungeon Entrances) with zero overlapping district box frames.
  - *Failure Twin:* If two landmark labels collide at `zoom < 2.2×`, then the component shall prioritize `Castle > Starting Town > Hub Town > Major Dungeon/Raid > Field Zone` and reveal secondary labels as zoom increases.
- **R-2 (Semantic Zoom into Town Streets, Buildings & Service Marks):** When the user zooms to `zoom >= 4.5×` over a Town (or double-clicks / clicks "Zoom to Town Blueprint"), the component shall automatically transition to the **Town Street & Building LOD**, displaying perimeter walls, gates, streets, stairs, central plaza, numbered/named building footprints, and distinct service marks (`⚔️ Weapons & Armor / Equip Shop`, `🧪 Consumable / Grocery Store`, `⚒️ Blacksmith`, `🏛️ Temple / Sanctuary`, `📦 Warehouse`, `🛡️ Class Guilds`, `🌀 Gatekeeper`) plus the color-coded NPC roster legend (`Trainer`, `Merchant`, `Warehouse`, `Guard`, `Gatekeeper`, `Priest`).
  - *Failure Twin:* If a Town node lacks custom building polygons, then the component shall deterministically synthesize a valid walled town street/building layout from the node's `resident_npcs` and `portals` bindings so no Town ever renders blank.
- **R-3 (Dungeon & Multi-Floor Tower Warp Sub-Map):** When the user zooms to a Dungeon/Tower or clicks a **Dungeon Warp Point** (`🕳️ Dungeon Entrance` or `🗼 Tower Gate`), the component shall open the **Dungeon/Tower Sub-Map Canvas** showing the active floor's rooms, corridors, boss chambers, monster spawns, and clickable **Inter-Floor Warp Portals** (`Warp to B2`, `Ascend to 2F`, `Exit to Overland Map`).
  - *Failure Twin:* If an invalid floor ID is requested in URL state, then the component shall fall back to Floor 1 (`B1` or `1F`) and display a non-blocking toast.
- **R-4 (Multi-Category Map Filter Bar):** When the user toggles any filter pill (`All`, `Monster`, `Mini-Boss`, `Raid`, `MVP`, `Town Marks`, `Travel Paths`, `Dungeons`) or Level Band (`All`, `Lv.1–20` .. `Lv.81–99`), the component shall immediately filter visible spawn pins, boss markers, and highlighted zones on both the Overland Map and Dungeon Sub-Maps and sync to URL hash state.
  - *Failure Twin:* If the active filter combination matches zero entities on the current map view, then the component shall display an inline empty-filter banner with a one-click `Reset Filters` button.
- **R-5 (Coordinate Deep-Linking & URL State Sync):** When the user pans, zooms, selects a landmark/warp, switches a dungeon floor, or changes filters, `writeUrlState` / `syncUrlState` shall persist and restore `#tab=studio&loc=X:Y&zoom=Z&floor=F&filter=CAT&band=LV` in the URL hash.
  - *Failure Twin:* If `loc=X:Y` or `zoom=Z` is malformed or out of `world_grid_spec` bounds (`[-131072..229376, -262144..262144]`), then the component shall clamp to valid bounds and center on the default starter town (`Lantern Hollow`).
- **R-6 (WCAG 2.2 Keyboard & Non-Drag Accessibility):** While the Atlas Canvas is focused, the component shall provide full keyboard navigation (`Tab` across landmarks/warp portals/service marks, `Enter`/`Space` to inspect or warp, `+`/`-` to step zoom across LOD thresholds, Arrow keys to pan, `1`–`4` or PageUp/PageDown to switch dungeon floors, and `Escape` to pop the Dungeon Sub-Map or reset to Macro view) with `>=24×24px` interactive hit targets and high-contrast focus rings.
  - *Failure Twin:* If pointer drag is unavailable, then one-click toolbar controls (`+`, `−`, `1:1`, LOD pills, Town/Dungeon quick-jump buttons) shall execute every pan, zoom, and floor transition without drag gestures.

## UI State Matrix
| Screen / Mode | Ideal State | Empty / Filtered-Out State | Loading / Transition | Error / Fallback |
|---|---|---|---|---|
| **Overland Macro (`1.0×–2.2×`)** | Continents, travel paths, Towns (*Gludin/Lantern Hollow*), Dungeons (*Ant Nest/Kiln Cellar*), filtered Mob/MVP/Raid pins | Inline badge: `0 matches for filter — [Reset Filters]` | Smooth CSS/SVG transform interpolation | Clamps out-of-bounds `loc=X:Y` to default world bounds |
| **Regional LOD (`2.2×–4.5×`)** | Territory boundaries, highway route shields, secondary hunting area labels, level-band badges, and dungeon entrance callouts | Hides filtered-out spawn pins; preserves roads and town/dungeon portals | Progressive label reveal without layout jump | Falls back to macro landmark pins if regional metadata is absent |
| **Town Blueprint (`≥4.5×` / Focused)** | Parchment + architectural blueprint with Streets, Building footprints, Equip/Grocery/Blacksmith/Temple/Warehouse marks & numbered NPC roster | Shows streets & buildings; hides filtered-out marker types | Cross-fade from macro town icon to street blueprint | Deterministic procedural town blueprint fallback |
| **Dungeon / Tower Sub-Map** | Multi-floor selector (`B1`, `B2`, `B3` / `1F`, `2F`, `3F`), room corridors, Mob/Raid/MVP spawns, clickable floor warp portals + `⬆ Return to World Map` | Shows room geometry + warp portals; `[Reset Filters]` if spawns hidden | Breadcrumb push `World ➔ Zone ➔ Floor B1` | Resets to `B1` / `1F` with recovery toast: `Floor not found — showing Floor 1` |

## Interfaces & Files Touched
- `content/studio/schemas/t-shaped-world-atlas.schema.json` & `scripts/studio_world_governance.py` — Extend schema (`additionalProperties: false` + `spawnRow.entity_type` enum to include `MVP`) and `GOV-10` validator for `town_blueprint` service marks and multi-floor `floors[]` (`B1..B3` / `1F..3F`) dungeon graphs.
- `content/studio/t_shaped_world_atlas.json` — Enrich with multi-LOD town building/service-mark blueprints (Equip Shop, Grocery/Consumable, Blacksmith, Temple, Warehouse, Guilds, Gatekeeper, numbered NPC roster) and multi-floor underground/tower dungeon graphs (`floors[]` with `rooms[]`, `spawns[]`, and `warp_points[]`).
- `scripts/generate_l2j_atlas_maps.py` — Clean geographic parchment relief plate, town blueprint plate, and multi-floor dungeon plates.
- `scripts/catalog_explorer_web.py` — Dedicated `DedicatedWorldAtlasComponent` (`renderDedicatedWorldAtlas`, semantic zoom LOD controller, multi-floor dungeon warp stack, Monster/MVP/Raid/Mark filter bar, and sidebar consolidation while preserving existing `renderWhcBigPictureSvg`..`renderTownOrHuntingAreaBigPictureSvg` exports or updating callers).
- `tests/test_studio_web_perspectives.py` — Automated verification of semantic zoom LOD layers, town service marks, dungeon multi-floor warp points, URL deep-linking, and Monster/MVP/Raid filters.
- `README.md` — Document the Dedicated Semantic-Zoom World & Multi-Floor Dungeon Atlas component, LOD thresholds, filter bar, and URL deep-linking parameters.

## Acceptance Criteria & End-to-End Verification
- [ ] **AC-1:** Overland World Map clearly renders geographic travel paths, towns (e.g., *Lantern Hollow / Gludin Village*), hunting areas, and dungeons (*Kiln Cellar / The Ant Nest*) on one continuous canvas without cluttering grid boxes.
- [ ] **AC-2:** Zooming into a Town (`zoom >= 4.5×` or clicking a Town) automatically adjusts to the **Town Street & Building Blueprint LOD** showing streets, building footprints, service marks (`Equip Shop`, `Consumable/Grocery Shop`, `Blacksmith`, `Temple`, `Warehouse`, `Guild`, `Gatekeeper`), and numbered NPC legend.
- [ ] **AC-3:** Clicking a **Dungeon Warp Point** opens the **Dungeon / Tower Sub-Map** supporting multi-floor warp navigation (`Underground B1 ⇄ B2 ⇄ B3` and `Tower 1F ⇄ 2F ⇄ 3F`) and a one-click warp back to the overland entrance.
- [ ] **AC-4:** Map filter bar filters `Monster`, `Mini-Boss`, `Raid`, `MVP`, `Town Marks`, and `Level Bands` dynamically across overland and dungeon maps.
- [ ] **AC-5:** URL hash deep-linking (`loc=X:Y`, `zoom`, `floor`, `filter`, `band`) and keyboard navigation (`Tab`, `Enter`, `+`/`-`, Arrow keys, `Escape`) work end-to-end, and `GOV-10` schema validation passes with 0 errors.
- **Verification Command:** `python3 -m unittest tests/test_studio_web_perspectives.py` and live HTTP checks against `http://127.0.0.1:8788`.

## Assumptions
- `ASSUMED: Keep both Cradle of Embers canon names and Lineage II archetype subtitle aliases (e.g., "Lantern Hollow (Gludin / Talking Island Archetype)", "Kiln Cellar Ant-Nest Labyrinth (The Ant Nest Archetype)") so both lore and classic L2 references are immediately recognizable — reversible: Y`
- `ASSUMED: Consolidate the sidebar map navigation so "🧭 Interactive World & Dungeon Atlas" is the primary unified map component while preserving the 4-Perspective Studio Governance tabs — reversible: Y`
- `ASSUMED: Semantic Zoom auto-switches LOD at 2.2× (Regional) and 4.5× (Town Street Blueprint), and also provides one-click LOD / Town / Dungeon Warp buttons for mouse-free navigation — reversible: Y`

## Appendix — audit trail
- 2026-10-20 self-grill-audit: verdict safe-with-fixes. Corrected: (1) removed phantom `content/studio/semantic_world_atlas.json` claim in favor of canonical `t_shaped_world_atlas.json`; (2) added `content/studio/schemas/t-shaped-world-atlas.schema.json` (`additionalProperties: false` & `MVP` in `spawnRow.entity_type`) + `scripts/studio_world_governance.py` (`GOV-10`) to Interfaces so new `floors[]` and town service marks pass validation; (3) added `R-5` URL hash deep-linking (`loc=X:Y`, `zoom`, `floor`, `filter`, `band`), `R-6` WCAG 2.2 keyboard/non-drag accessibility, Regional LOD (`2.2×–4.5×`) state-matrix row, and `README.md` sync. Open: none.
