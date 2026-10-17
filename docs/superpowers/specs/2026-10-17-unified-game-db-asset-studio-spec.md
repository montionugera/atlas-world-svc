# Unified Game DB Explorer + AI Asset & Map Studio Specification

- **Date:** 2026-10-17
- **Status:** Approved — Executing 1-Map Pilot Workflow (`prontera_south_field`)
- **Primary Surface:** [`scripts/catalog_explorer_web.py`](../../scripts/catalog_explorer_web.py) + [`scripts/build_catalog_db.py`](../../scripts/build_catalog_db.py)
- **Data Contracts:** [`game-client/assets/catalog-manifest.json`](../../game-client/assets/catalog-manifest.json), [`content/ground_palettes.json`](../../content/ground_palettes.json), [`content/review-queue.json`](../../content/review-queue.json), [`content/maps/*.json`](../../content/maps/), [`contracts/content/*.json`](../../contracts/content/)

---

## 1. Design Goal

Scale content production to **1,000+ 3D/2D assets** and **100+ maps** using a **99% Automated AI + Procedural Pipeline** governed by a **1% Human-in-the-Loop Review & Feedback Queue** inside a single unified application (`scripts/catalog_explorer_web.py`), starting with a **1-Map Pilot Workflow (`prontera_south_field` / `freja-south-gate.json`)**.

---

## 2. Settled Architectural Decisions & Chibi Scale Anchor

1. **Chibi / Toddler Player Scale Anchor (`0.90m – 1.20m`, Target `1.05m`):**
   - Player character height is anchored at **`0.90m – 1.20m`** (`targetHeightM: 1.05m`) for cute 2.5-head Chibi proportions.
   - **Cascading Input & Gate Rules:**
     - **Ground Cover Visibility Cap:** Tier-A meadow grass must be **`≤ 0.35m`** (knee-high) and bushes **`≤ 0.65m`** (chest-high) so a `0.95m` player is never swallowed by foliage.
     - **Monster Size Bands:** Small (`0.50m–0.65m`), Medium (`1.10m–1.35m`), Large / MVP Boss (`1.90m–2.20m`, towering `~2x` over the player).
     - **Terrace Step Cap:** Max climbable step height **`≤ 0.25m`** per step.
     - **Gear Readability:** Weapons and headgear scaled `1.25x–1.40x` for 45° isometric camera readability.
2. **Single Unified Studio Surface (`scripts/catalog_explorer_web.py`):**
   - Merges **Game DB Explorer (Observatory)**, **Asset Studio & Biome Brush Composer (`ground_id` Smart Tag Pools + Checkboxes)**, **2D Map Blueprint Studio**, and the **3-Column Review Gate (`Inputs → Auto-Gates → In-Context Multi-Take Review UI`)** in one app.
3. **Closed-Loop Input-Contract Principle (Criteria = Generator Input = Machine Gate):**
   - Every review criterion (scale band, rig bones, road width floor `12m`/`4m`, foliage height cap `0.35m`, era/medium styleGuard) is **auto-injected into the generator input** and **verified by machine gates** before entering the human review queue.
4. **Smart Tag Pools + Checkbox Override (`content/ground_palettes.json`):**
   - Each `ground_id` scatter rule carries a `tagPool` (`biome`, `role`) plus an `assets` (checked) and `disabledAssets` (unchecked) list so designers get automatic variety across 1,000+ models while retaining 1-click checkbox overrides.
5. **Staged Review Queue (`content/review-queue.json` + Snapshot/Undo):**
   - Preserves backward compatibility with `atelier/asset-storybook` (`version: 1`, `verdicts: {}`, `workOrders: []`) while adding `proposals: []` for the 3-column Review Gate (`approve`, `feedback`, `reject`) and automatic snapshots in `build/studio-snapshots/`.
