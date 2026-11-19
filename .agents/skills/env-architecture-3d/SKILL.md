---
name: env-architecture-3d
description: Author, normalize, validate, and visually gate 3D environment, terrain, spline, and modular architecture `.glb` assets for `atlas-world-svc` (Godot 4.7 Forward+). Covers the 1m unit contract, Maro Bell M1–M6 conventions, scale-law conflict resolution, modular kit grid/pivot/collision rules, budgets, and render/QA verification gates.
---

# Environment & Modular Architecture 3D (`atlas-world-svc`)

Use this skill whenever building, editing, auditing, or integrating 3D environments, terrain, splines, water, modular buildings, dungeon kits, or foliage (`.glb`, `.env.json`, `.gdshader`, `.glb.import`) in `atlas-world-svc`.

Every rule below is grounded in live repo contracts (`docs/unit-contract.md`, `docs/asset-delivery-spec.md`, `atelier/asset-forge/forge.config.json`, `game-client/src/World/`) and the active Maro Bell M1–M6 factory (`~/asset-studio-private/atlas-3d-plan/`).

---

## 1. Unit Contract & Scale-Law Conflict Resolution

### Canonical Coordinate & Unit Contract
- **1 game unit = 1 metre** (`coord_scale = 1.0`) across `server-rs/`, `content/maps/*.json` (`"unitContract": "metres-v1"`), and `game-client/` (`docs/unit-contract.md`).
- **glTF 2.0 binary (`.glb`)**, **+Y up**, **-Z forward**, transforms frozen/applied (`scale = (1, 1, 1)`), textures embedded or sidecar-imported, `snake_case` filenames (`docs/asset-delivery-spec.md`).
- **Legacy 0.1 m exception:** `content/towns/town-millcross.json` remains in its 0.1 m design frame (`server-rs` and `scripts/compile_world_maps.py` multiply its footprints by `0.1`). Do not mix 0.1 m values into new 3D `.glb` assets.

### Explicit Scale-Law Contradictions (Flagged & Resolved)

Four competing scale references exist across the repo and factory. Follow this precedence table — never silently mix them:

| Source | Stated Rule | Status & Resolution |
|---|---|---|
| `docs/unit-contract.md` (F-185) + `.claude/agents/asset-forge-director.md` + `atelier/asset-forge/forge.config.json` | **1 unit = 1 m.** Chibi player `[0.90, 1.20] m` (`1.05 m` ref); `grass <= 0.35 m`, `bush <= 0.65 m`, `terraceStep <= 0.25 m`, `riser <= 0.18 m`, `main_road >= 12.0 m`, `footpath >= 4.0 m`, dungeon corridors `>= 6.0 m`. | **Canonical baseline** for gameplay clearances, foliage sightlines (head always visible above bushes), and `content/studio/` validation. |
| `.claude/agents/town-canon-reviewer.md` (lines 28–29, 43) | Cites `cart roads >= 12u (mob diameter 10)`, `foot roads >= 4u (player diameter 2.6)`, and stale `tools/art-forge/forge.config.json`. | **Stale pre-F-185 unit wording** (`2.6u`/`10u` are old 0.1 m server units; actual path is `atelier/art-forge/forge.config.json`). Keep road floors in **metres** (`>= 12.0 m` / `>= 4.0 m`) per `asset-forge-director.md`. |
| `docs/asset-delivery-spec.md` (line 10) | `standing humanoid ≈ 1.8u tall`. | **Superseded for characters/props** by the `0.90–1.20 m` chibi law (six-race lineup runs `1.00 m` dwarf woman to `1.58 m` ogre man). Still valid only for format/axis/naming rules. |
| Maro Bell Owner Decisions (`CANON.md` "All A" / I-303 + M6 P2 `maro-bell-master-checklist.md`) | **"Tiny Human, Massive World":** characters stay ~`1.00–1.58 m` chibi, while Maro Bell monumental landmarks use `1.30 m` as an environment scale figure (civic `15–22 m`, bell tower `24–30 m`, lowest tree leaf `>= 5.0 m`). For **M6 residential/market kit houses**, owner scaled the kit to **`0.7`** (`world door 2.24 m`, `ridge 9.70 m`, `width 7.0 m`). | **Authoritative for Maro Bell M1–M7.** Do not build characters at `1.30 m`, and do not build M6 kit houses at the old oversized `3.2 m` door / `14 m` height. |

> **Pipeline boundary note:** `atelier/art-forge/forge.config.json` governs **2D concept art** (ComfyUI Flux / Z-Image Turbo + `styleGuard` `era`/`medium`/`forbiddenTokens`), NOT 3D `.glb` validation. 3D `.glb` tooling lives in `atelier/asset-forge/` and (for Maro Bell env) `~/asset-studio-private/atlas-3d-plan/tools/`.

---

## 2. Repo Inventory & Layout

- **`game-client/assets/models/env/maro-bell/`** — Active Maro Bell masterplan assets (e.g. `maro_bell_m1_masterplan.glb` + Ashlar limestone/warm-stone textures + `.import` sidecars).
- **`game-client/assets/env/`** — 13 seed environment GLBs (`barrel`, `blacksmith`, `bush`, `crate`, `farm`, `fence`, `house`, `inn`, `mountain`, `rock`, `sawmill`, `stable`, `tree`).
- **`game-client/assets/dungeon/`** — 283 modular dungeon kit GLBs + textures (`kind: "dungeon"` in `catalog-manifest.json`).
- **`game-client/assets/nature/`** — 198 nature/foliage GLBs (`kind: "environment"` in `catalog-manifest.json`).
- **`game-client/assets/shaders/`** — Stylized environment shaders: `maro_river_water.gdshader`, `maro_fountain_water.gdshader`, `maro_waterfall_ribbon.gdshader`, `maro_plunge_foam.gdshader`, `maro_wet_bank.gdshader`, `stylized_grass_floor.gdshader`, `cel_shader.gdshader`, `outline.gdshader`.
- **`content/maps/maro-bell.json`** & **`content/ground_palettes.json`** — Runtime map layout (still grey-box volumes until E3 GLB wiring) and ground palettes.
- **Manifest gap:** `game-client/assets/catalog-manifest.json` (`driftGated: false`) tracks `environment` (211) and `dungeon` (283) entries, while `atelier/asset-forge/forge.config.json` currently defines only 4 character kinds. Always run `scripts/check_asset_manifest.mjs` after adding entries and gate individual env GLBs with `env_gate.py` / `glb_inspect`.

---

## 3. Modular Kit, Grid, Pivot & Collision Standards

### Pivot, Origin & Grid Snapping
- **Pivot (`floor_center`):** lowest mesh vertex at **`y = 0.0 ± 0.01 m`**, ground footprint (`vertices within 5 cm of min_y`) centered at **`cx = 0 ± 0.02 m`, `cz = 0 ± 0.02 m`**.
- **Modular Kit Grid (`grid_m = 0.5 m`):**
  - Kit run length stays **`2.0 m`** on the **`0.5 m` grid** (a tiling unit, independent of body scale).
  - For run pieces (`walls`, `curbs`, `fences`, `facades`): `min_x` and `max_x` must be multiples of `0.5 m` within `±0.01 m`, and both end planes must have **identical `(y, z)` vertex profiles** (`>= 3` verts) so adjacent copies weld with zero gap.
- **Doorway & Stair Clearances:**
  - Door opening recess: zero triangles inside `[x0, x1] × [0, door_h] × [front, front + depth_m]` (`depth_m >= 0.3 m`; `>= 1.80 × 1.40 m` chibi floor, `2.24 m` M6 kit scale, `>= 3.0 m` civic landmarks).
  - Stairs / terraces: uniform risers (`<= 0.18 m` canon / `<= 0.19 m` scaled / `<= 0.25 m` terrace step cap).
- **Foliage & MultiMesh Batching:**
  - Grass `<= 0.35 m` (`<= 0.43 m` scaled ceiling); bush `<= 0.65 m` (`<= 0.80 m` scaled ceiling); tree lowest leaf `>= 5.0 m` (`leaf` material), trunk radius `<= 0.95 m` (`trunk` material).
  - Grass GLBs must contain `grass` in their file/node name for `MultiMeshInstance3D` batching.

### Collision & Sidecars
- **Sidecar contract (`<piece>.env.json`):** write next to every finished modular env GLB:
  ```json
  {"recipe": "<recipe path>", "variant": "<id>", "footprint_m": [w, d], "center_xz": [0, 0]}
  ```
- **Player-height collision hull:** X/Z extent of mesh geometry clipped to **`y = 0.05..1.30 m`** must match `footprint_m` within **`±0.10 m`** (prevents roofs/eaves or decorative bases from falsifying walkable bounds).
- **Godot runtime integration:** `game-client/src/World/MapChunkStreamer.cs` builds the obstacle grid and `game-client/src/World/TerrainElevation.cs` resolves height queries. Always commit `<asset>.glb` and `<asset>.glb.import` together (`.import` is tracked in git, not LFS).

---

## 4. Maro Bell M1–M6 Architecture, Terrain & Spline Conventions

Follow the milestone-gated progression (`M1 → M2 → M3 → M4 → M5 → M6 → M7`). Never mix deprecated `M{<N}` greyblock nodes into later milestones (causes z-fighting and fails `EnvRenderPreGate`).

- **M1 — Town & Terrain Master Plan:** Circular 9-zone 3-tier hillside (`420 m` playable diameter, 6 carved sub-terraces), sculpted riverbed (`-3.2 m`), perimeter cliffs, and background mountains (`maro_bell_m1_masterplan.glb`).
- **M2 — Continuous Spline Roads, Curbs & Stairs:** Single-centerline curve-extruded roads and curbs with `World-Up` stable cross-sections (`<= 1 mm` seam tolerance), explicit welded junctions (`J01..J16`), and uniform-riser stairs.
- **M3 — Continuous Spline Walls, Retaining Arches, Bastions & Bridge:** Continuous curved curtain walls/battlements, tangent-matched bastion junctions, shared-pier retaining arches (`1.55 m` piers + ashlar backing), and a true 3-arch semicircular river bridge with slim cutwaters.
- **M4 — Stylized River, Fountain & Waterfall (Forward+):** Depressed riverbed + wet-edge bank blend + 4-layer `.gdshader` (`maro_river_water.gdshader`: depth turquoise absorption, dual flow-aligned ripples, depth-intersection shoreline/pier foam, sun sparkles) + multi-sheet waterfalls (`maro_waterfall_ribbon.gdshader`) + plunge-pool foam (`maro_plunge_foam.gdshader`) + `GPUParticles3D` mist. Target uncapped frame time `<< 25 ms`.
- **M5 — Monumental Landmarks & De-Perfection Law (applies M5–M7):**
  - Smooth shading + rounder curved masonry; **never CG-perfect/ruler-straight**.
  - Apply bevelled stone edges, per-block stone colour variation, grime in recesses, and tread wear.
- **M6 — Hero House & Shared Modular Facade Kit:**
  - Kit scale **`0.7`** (`2.24 m` door, `9.70 m` ridge, `7.0 m` width); real 3D recessed arched doors, inset rectangular/mullioned upper windows, shutters, protruding timber framing, flower balconies, blue tiled dormers.
  - **Palette:** 60% cream limestone (`#E3D5AB`) / warm sand (`#CFB48D`) walls & paving; 30% roofs & timber — roofs split **blue 45% `#365B87`** (near sanctuary/boulevard/market), **terracotta 45% `#C96E42`** (residential hillside), **grey slate 10% `#687780`** (workshops); 10% gold trim (`#D4A845`), flowers, banners.
  - **Anti-patterns to reject:** squat houses (use tall narrow facades + steep roofs), uniform-grid timber framing (use structural posts/beams + selective braces), arching every opening (arch doors only), flat white walls (warm cream plaster over visible stone ground floor), plain triangular roof caps (require deep eaves, ridge caps, tile thickness, dormers).

---

## 5. Budgets, Materials & Godot 4.7 Export Rules

| Dimension | Budget / Limit | Source / Notes |
|---|---|---|
| **Triangles** | Modular building `<= 8,000 tris` target (M6 kit avg `~8.1k`, max `11.3k`); hero landmark per-recipe; small env prop `<= 800 tris` | `.claude/agents/technical-artist-pipeline-dcc.md`, `RECIPE.contract.md`, M6 checklist |
| **Materials / Draw Calls** | `<= 2` materials per modular piece; hero house `<= 6` primitives/draw calls | `env_gate.py:227`, M6 P2 |
| **Textures & Tiling** | `512–1024 px` max edge; seamless tiling edge-diff `<= 0.04` (`SEAM_LIMIT`); external PNGs should use VRAM compression (`compress/mode=2` in `.png.import`, not lossless `mode=0`) | `env_gate.py:18,234,302`, audit report |
| **glTF Extensions (Godot 4.7.2)** | **FORBIDDEN:** `KHR_mesh_quantization`, `EXT_meshopt_compression`, Draco, and `gltf-transform webp` (causes sparse-accessor errors and drops extensions). Export plain glTF 2.0 binary from Blender `>= 4.5` (`export_apply=True`, `export_yup=True`). | Verified in `atlas-3d-plan` KB & `atelier/asset-forge/bake_export.py` |
| **LOD & Occlusion** | Keep modular kits instance-friendly (`MultiMeshInstance3D` for foliage/props); verify camera sightlines have `< 40%` occlusion (`maxOcclusionRatio = 0.4f`). | `EnvRenderPreGate.cs` |

---

## 6. Verification & Camera-Parity Gates

Run gates in order from fast/deterministic to visual QA. Never claim done without passing output.

### Stage 1 — Structural & Manifest Gates (Local)
```bash
# 1. Manifest & file-presence drift gate
node scripts/check_asset_manifest.mjs

# 2. Codegen-gated asset validator
node atelier/asset-forge/validate.mjs --manifest game-client/assets/manifest.json

# 3. Per-piece environment geometry/pivot/seam/collision gate (when recipe exists in atlas-3d-plan)
python3 ~/asset-studio-private/atlas-3d-plan/tools/env_gate.py <piece.glb> \
  --recipe ~/asset-studio-private/atlas-3d-plan/recipes/env/maro-arrival/<rNN-slug>.json
```
Also inspect any new `.glb` via `atlas-3d` MCP **`glb_inspect`**:
- `glb_inspect(glb_path="<abs-path>", space="world", top_stretched_tris=5)` — check world AABB (`w × d × h`), `min_y ≈ 0`, material count, and zero spike triangles.

### Stage 2 — Godot 4.7 Mono Pre-Render & Camera-Parity Gates
Always run through `scripts/godot-verify.sh` (never bare `godot`, which may be non-mono and exit `0` on C# errors):
```bash
# EnvRenderPreGate: camera sightline occlusion (< 0.4), deprecated M{<N} sweep, shader time-delta strip
scripts/godot-verify.sh ATLAS_VERIFY_ENV_PREGATE '^\[EnvRenderPreGateVerify\] VERDICT PASS$'

# Maro Bell world streaming, obstacle grid, camera zoom, and M5/M6 pre-gate verification
scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'
```
For windowed render captures (headless Godot produces no pixels), set `ATLAS_RENDER_MARO_BELL=<out_dir>` to emit camera-parity plates (`maro-bell-top-down.png`, `maro-bell-eye-gate.png`, and milestone views).

### Stage 3 — Visual QA (`jev_qa` → `vision_qa` / `codex-qa`)
1. **Fast ~1s System-1 Pre-Gate (`atlas-3d` MCP `jev_qa`):**
   - `jev_qa(mode="env", milestone="M{1..7}", images=[...], threshold=0.72)` (or CLI `~/asset-studio-private/atlas-3d-plan/bin/jev-env-qa --milestone M{1..7} <views.png>`).
2. **Structured Vision Grader (`atlas-3d` MCP `vision_qa` or CLI `codex-qa`):**
   - `vision_qa(images=[...], rubric="env", milestone="M{1..7}", structured=True, out_path="/tmp/env_qa.json")`
   - Or CLI: `~/.local/bin/codex-qa --rubric env --milestone M{1..7} --structured --out /tmp/env_qa.json <refs_and_views.png>`
   - **Pass bar:** `>= 8.0 / 10` + owner sign-off (required for M6 and M7). Always include an open-ended defect scan (clipped geometry, flat materials, z-fighting, scale mismatch) rather than a closed yes/no checklist.
3. **Close-up Inspection:** use `atlas-3d` MCP `image_crop_inspect(image_path=..., crop_box_norm=[...], max_dim=1024, out_path="/tmp/crop.png")` — never `Read` full-resolution PNGs directly in the main thread.
