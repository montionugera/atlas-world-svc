# Handoff & Open-UltraCode Co-Design Spec: World Atlas UX/UI Overhaul & `joy-design` Spatial Workspace Primitives

- **Date:** 2026-10-22
- **Co-Design Pair:** **Gemini 4 Argon** (`w6:t1` · `f0226d6c-9234-444b-83dc-302b797e75e2`) × **Claude Opus 5.5 Thinker** (`w6:t2` Herdr Tab Session · `open-ultracode` Co-Design)
- **Target Repos:**
  - Primary Tooling App: `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release` (`scripts/catalog_explorer_web.py`, live at `http://127.0.0.1:8788/`)
  - Internal Design System Library: `/Users/pasitnusso/workspace/repos/joy-design` (`packages/tokens`, `manifests/`, `@joymify/svelte`, `@joymify/react`)
- **Workflow Discipline:** `open-ultracode` (`Planner` ➔ `Implementer` ➔ `Adversary` ➔ `Reconciler` ➔ `Verifier`) + `brainstorming` (`## Classification: Architectural`)

---

## Classification: Architectural

## Orientation
- **Problem Statement:** The current `DedicatedWorldAtlasComponent` (`http://127.0.0.1:8788/`) packs **6 stacked toolbar rows (~340px vertical height)**, a **fixed 345px left drawer**, a **cramped 520px SVG canvas**, **90 `D19–D108` studio bars**, and **3 bottom tables** into a single unsegmented view. Furthermore, switching from Overland (`RaceSpawns` filter active) into a Dungeon (`Kiln Cellar B1`) preserves the incompatible `RaceSpawns` filter, resulting in `⚠️ 0 matches for active filter (RaceSpawns / All)` and hiding all floor monsters.
- **Root Cause:** Controls for **5 distinct user personas** (Gamer/Explorer, Game Designer, Systems/Tools Architect, Developer/Tech Artist, LiveOps/GM) are rendered simultaneously instead of using **role-based progressive disclosure (`Persona Lenses`)** and **spatial canvas-first HUD architecture**.
- **Goal:** Redesign the World Atlas Explorer around **5 Persona Lenses**, a **Canvas-First Spatial Viewport (`joy-spatial-viewport-shell`)** with collapsible left/bottom docks and theater mode, **Smart Context-Aware Filters (`joy-context-filter-bar`)** that auto-heal zero-match filter traps on Town/Dungeon entry, and extract/codify **4 reusable `joy-design` internal library primitives**.

---

## 1. Multi-Role Persona Use-Case Matrix (What Each Role Wants to See & Explore)

| Persona Lens | Primary Goal & Mental Model | What They Need on Canvas (Primary Signature Moment) | Controls Shown in Top HUD (Max 4–5 Controls) | Secondary Dock / Drawer Content |
|---|---|---|---|---|
| **1. 🎮 Gamer / Player / Explorer** *(Default Lens)* | *"Where do I hunt at Lv.15? How do I walk/teleport from Gludin to Ant Nest B3? Where is the Blacksmith for +1..+15 refinement?"* | **Full-bleed Interactive Map (`680px` / `78vh`)** with clean Town/Dungeon/Monster pins, animated travel route, and 1-click floor warps (`B1⇄B2⇄B3`, `1F⇄2F⇄3F`). | (1) Compact `⌘K` Omni-Search popover · (2) Smart Context Filter chips (`All`, `Towns & Shops`, `Monsters`, `Bosses`) · (3) `Lv.Band` pill selector · (4) Quick Jump (`Town` / `Field` / `Dungeon`) | **Collapsible Left Place Card** (Shop Stock, `+1..+15` Anvil Rates, Mob Drops) + **Collapsible Travel Route Bar** |
| **2. 🎲 Game Designer / Content & Economy** | *"Is the Lv.1–99 progression curve smooth across all 6 races? Are quest chains, mob densities, and +1..+15 refinement drops balanced?"* | **Progression & Economy Overlay Canvas**: 6-Race Growth Splines (`D9`), 3-Track Quest Trial DAG (`D23`), Party Farming Heatmap (`D24`), Boss Hierarchy (`D22`). | (1) `6-Race Growth Path` selector (`A..L`) · (2) `Quest Trial Track` (`1st/2nd/3rd Class`) · (3) `Farming Heatmap` (`Solo`/`Duo`/`9p AoE`/`Raid`) · (4) `Design Studios` (`D75 Dialogue`, `D76 Spawner/Loot`, `D77 Skill Timelines`) | **Designer Studio Drawer**: `D10` Refinement Math, `D22–D24` Progression & Farming Tables, `D75–D77` Balance Inspectors |
| **3. 🏛️ Lead Systems & Tools Architect** | *"Do all 63 zones, 180 NPCs, and 108 dimensions obey the SSOT schema, scale laws (`>=6.0m` corridors), and zero-drift codegen gates?"* | **4-Perspective Topological Graph**: `World History ➔ 3 Continents ➔ 12 Districts ➔ 63 Connected Zones` + `D79` Schema/Codegen Drift & `D99` Hot-Reload status. | (1) `4-Perspective Scale Switcher` (`LOD 1..4`) · (2) `Carto Theme` (`L2Hub Parchment` vs `Google/Apple GIS`) · (3) `Governance & Drift Gate` (`D74`, `D79`, `D80`, `D90`, `D100`) | **Architect Governance Drawer**: `108D` Scorecard (`100.0/100`), `D79` Sub-Second Schema Gate, `D99` Cross-Tool Hot-Reload Bridge, Unified 63-Zone Matrix |
| **4. ⚙️ Developer / Tech Artist / Sim Engineer** | *"Do all 63 zones pass the 60 FPS GPU/VRAM budget (`D88`), GLB material gate (`D71`), Godot `@tool` 3D storybook (`D84`), 3D NavMesh (`D85`), and 10k-Bot Swarm (`D72`)?"* | **Runtime Telemetry & Spatial Grid Canvas**: `SpatialGrid` AOI cell heatmap (`D72`), 3D NavMesh slope/bridge sectors (`D85`), Cutscene Camera Rails (`D87`), Server-Mesh WAL corridors (`D82`). | (1) `3D Asset & GPU Gate` (`D71 GLB`, `D84 Godot Storybook`, `D88 VRAM`) · (2) `Sim & Spatial Engine` (`D72 10k-Bot Swarm`, `D82 Server-Mesh`, `D85 NavMesh`) · (3) `QA & Replay` (`D78 Build Farm`, `D89 Headless QA`, `D102 BLAKE3 Replay`) | **Engineering Telemetry Drawer**: `D71`, `D72`, `D78`, `D81`, `D82`, `D84`, `D85`, `D87`, `D88`, `D89`, `D102`, `D104`, `D106` |
| **5. 🛡️ LiveOps / GM / Economy Sentinel** | *"Where are stuck players or bot trains (`D83`)? Which seasonal event flags (`D86`), siege taxes (`D25`), or churn interventions (`D108`) are active?"* | **LiveOps Command & Sentinel Radar**: World Boss Respawn Radar (`D26`), Castle Siege Tax Domains (`D25`), Anti-Bot/RMT Sentinels (`D83`), World Incursions (`D93`), Churn Hotspots (`D108`). | (1) `GM Command & Rescue` (`D73 Stuck Rescue / Audit`) · (2) `Economy & Bot Sentinel` (`D83 Anti-Bot`, `D92 Auction Escrow`, `D94 Clan Treasury`) · (3) `Live Events & Retention` (`D86 Event Flags`, `D93 Incursions`, `D108 Churn Care`) | **LiveOps Operations Drawer**: `D25–D70` World Systems + `D73`, `D83`, `D86`, `D91–D98`, `D101`, `D105`, `D107`, `D108` |

---

## 2. Internal Design Library (`joy-design`) Leverage & New Component Evolution

### 2.1 How We Leverage `@joymify/tokens` (`theme.css`) Right Now
- `catalog_explorer_web.py` serves `/theme.css` directly from `/Users/pasitnusso/workspace/repos/joy-design/packages/tokens/dist/theme.css`.
- We adhere to `THESIS-cross-framework-design-system-parity-invariants`:
  1. **Spend Boldness Once:** The **2D Cartographic SVG Canvas (`#dedicatedWorldAtlasSvg`)** is the single signature visual hero of the viewport (`min-height: 640px` / `74vh` in Theater mode). All surrounding toolbars recede into calm, high-density dark navy surfaces (`#0d1624`, `#111b2b`, `#14253e`) with warm gold accent tokens (`#dab362` / `#c49a3a`) and crisp off-white ink (`#f8f3e8`).
  2. **Progressive Disclosure over Control Walls:** Replace the 6 stacked control rows with a **2-tier header**:
     - **Tier A: Persona Lens Switcher Bar (`joy-persona-lens-bar`)** — 5 role tabs + `⛶ Expand Map / Theater Mode` + `◀ Toggle Left Inspector` + `▼ Toggle Bottom Directory`.
     - **Tier B: Active Lens Compact Toolbar (`joy-context-filter-bar`)** — Shows ONLY the controls for the active lens, plus a collapsible `🧭 Route Calculator` popover and `🔎 Omni-Search` bar whose quick-jump pills collapse automatically when not searching.

### 2.2 Four New `joy-design` Spatial & Tooling Components to Standardize
1. **`joy-persona-lens-bar` (`manifests/persona-lens-bar.json`)**:
   - Role-scoped workspace mode selector (`gamer` | `designer` | `architect` | `developer` | `liveops`) with badge counts and keyboard shortcuts (`Alt+1..5`).
2. **`joy-spatial-viewport-shell` (`manifests/spatial-viewport-shell.json`)**:
   - Canvas-first split shell with collapsible left inspector drawer (`340px` ➔ `0px`), expandable canvas height (`560px` default ➔ `78vh` theater mode), and floating glass HUD controls.
3. **`joy-context-filter-bar` (`manifests/context-filter-bar.json`)**:
   - Context-aware filter chip group that validates active filter state against the current spatial context (`overland` vs `town` vs `field` vs `dungeon`) and **auto-heals incompatible filters** with a non-intrusive info badge instead of rendering an empty `0 matches` canvas.
4. **`joy-omni-command-bar` (`manifests/omni-command-bar.json`)**:
   - Compact single-row search + quick-warp selector bar where preset chips and results appear in a clean dropdown/tray on focus or query rather than permanently occupying vertical space.

---

## 3. Open-UltraCode Iterative Wave Plan

- **Wave UX-1 (Immediate High-Impact Overhaul in `scripts/catalog_explorer_web.py`):**
  1. **Auto-Heal Context-Incompatible Filters (Fix the `RaceSpawns` in Dungeon `0 matches` bug):**
     - When entering a Dungeon (`openDungeonSubMap`), if `ATLAS_STATE_STORE.filter` is `'RaceSpawns'` or `'TownMarks'` (which never exist inside dungeons), automatically reset `ATLAS_STATE_STORE.filter = 'All'` and show a helpful subtle status banner (`ℹ️ Auto-switched filter to All Layers for Dungeon Floor view`).
     - Similarly, when entering a Town Street Blueprint (`focusTownStreetBlueprint`), if `filter` is `'RaceSpawns'`, `'Monster'`, `'Mini-Boss'`, `'Raid'`, or `'MVP'`, auto-switch to `'All'` so all 12 buildings & 7 shop/refinement marks are immediately visible!
  2. **Introduce the 5-Role `Persona Lens Switcher` (`ATLAS_PERSONA_LENS`: `'gamer'` | `'designer'` | `'architect'` | `'developer'` | `'liveops'`):**
     - Render a sleek `.joy-persona-lens-bar` at the top of the World Atlas.
     - In **`🎮 Gamer / Explorer` lens (default)**: Hide the heavy `Race Growth Path` row, hide the `108D Studio Overlays` row, collapse the `Route Calculator` into a 1-click toggle pill (`🧭 Route Planner`), collapse the `Omni-Search` preset chips unless searching, and collapse the bottom `D14 Entity Matrix` into an on-demand disclosure drawer so the **Map Canvas dominates the screen**!
     - In **`🎲 Game Designer`, `🏛️ Architect`, `⚙️ Developer / Tech Art`, and `🛡️ LiveOps GM` lenses**: Automatically filter the `108D` studio dimension selector to ONLY the dimensions relevant to that role (instead of dumping all 90 dimension bars in one scroll box!).
  3. **Collapsible Left Place Drawer & Expandable Map Canvas (`ATLAS_LEFT_DRAWER_COLLAPSED` + `ATLAS_THEATER_MODE`):**
     - Add a `◀ Hide Details` / `▶ Show Details` toggle button right on the map edge and top bar, plus a `⛶ Expand Map (760px)` theater toggle so users can inspect the map full-width (`100%`) and full-height!
- **Wave UX-2 (Claude Opus 5.5 Thinker Adversarial Audit + `joy-design` Component Manifests & CSS Tokens):**
  - Co-design and review with Claude Opus 5.5 in the new Herdr tab (`w6:t2`) + `dispatch-thinker`, reconcile all UX/UI edge cases, and add the new component specs/tokens.

---

## 4. Instructions for Claude Opus 5.5 Thinker Session (`w6:t2`)

1. Read this spec (`/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release/docs/superpowers/specs/2026-10-22-atlas-ux-persona-workspace-design.md`).
2. Inspect `scripts/catalog_explorer_web.py` around `renderAtlasFilterBarHtml` (L15191), `renderCartoShellHtml` (L6713), and `renderDedicatedWorldAtlas` (L16648), plus `/Users/pasitnusso/workspace/repos/joy-design/DESIGN.md`.
3. Produce an **Open-UltraCode Adversarial Review & Co-Design Critique (`roles/adversary.md` + `roles/planner.md`)** covering:
   - Cognitive load & viewport budget ratios (Map Canvas % of viewport vs Chrome % of viewport) across the 5 Persona Lenses (`Gamer`, `Game Designer`, `Architect`, `Developer/Tech Art`, `LiveOps/GM`).
   - Exact component API contracts for `@joymify/tokens` / `joy-design` (`PersonaLensBar`, `SpatialViewportShell`, `ContextFilterBar`, `OmniCommandBar`).
   - Concrete Wave UX-2 / UX-3 interaction refinements (e.g. grouping the 90 `D19–D108` studio overlays into a clean dropdown selector or role-filtered pill switcher so only 1 active studio overlay card renders at a time instead of 90 stacked bars!).
4. Save your findings to `/tmp/handoff-atlas-ux-opus55-review.md` so both sessions can iterate continuously.
