---
name: prop-weapon-3d
description: Author, normalize, validate, and visually QA 3D weapons, shields, equipment, and props (`.glb`) for `atlas-world-svc` (Godot 4.7). Covers the 1m unit contract, chibi scale-law reconciliation, `WeaponSocket.cs` and 5-empty grip orientation, poly/texture budgets, `art-source/seed/weapons` to `game-client/assets/weapons` intake, and `atlas-3d` MCP QA (`glb_inspect`, `jev_qa`, `vision_qa`).
---

# Props, Weapons & Equipment 3D (`atlas-world-svc`)

Use this skill whenever creating, normalizing, importing, or auditing 3D weapons, shields, loot pickups, or interactive props (`.glb`) in `atlas-world-svc`.

Every rule below is grounded in live repo code (`game-client/src/World/WeaponSocket.cs`, `docs/unit-contract.md`, `docs/asset-delivery-spec.md`, `atelier/asset-forge/`), the weapon contract checker (`weapon_contract_check.py`), and the `atlas-3d` MCP server.

---

## 1. Scale Rules & Contradiction Resolution

### Canonical 1m Unit Contract
- **1 game unit = 1 metre** (`coord_scale = 1.0`, `docs/unit-contract.md`).
- **Format:** glTF 2.0 binary (`.glb`), **+Y up**, **-Z forward**, object scale frozen at `(1, 1, 1)`, `snake_case` filenames (`docs/asset-delivery-spec.md`).
- **Character scale anchor:** slim chibi adventurer **`0.90–1.20 m`** (`1.05 m` reference in `atelier/asset-forge/forge.config.json:2-11` and `.claude/agents/asset-forge-director.md:14-19`).

### Explicit Scale-Law Contradiction & Runtime Tech Debt
1. **`docs/asset-delivery-spec.md:10` vs `forge.config.json`:** `asset-delivery-spec.md` states `standing humanoid ≈ 1.8u tall`, whereas shipped playable characters are **`0.90–1.20 m`** (`1.05 m` reference; six-race lineup `1.00–1.58 m`). **Resolution:** size all new weapons and held equipment to the **`1.05 m` chibi reference** (~`0.58×` realistic 1.8 m lengths), never 1.8 m human scale.
2. **Existing `WeaponSocket.cs` scale hacks (do not extend):** raw Quaternius (100× FBX root scale) and KayKit (1.8 m) seed meshes in `game-client/assets/weapons/` are un-normalized, so `game-client/src/World/WeaponSocket.cs:39-46` hardcodes `CatalogScaleFactor`:
   - `sword: 0.22f`, `kk_sword_a: 0.34f`, `kk_sword_b: 0.34f`, `claymore: 0.11f`, `axe: 0.68f`.
   - **Rule for all new/normalized weapons:** bake the target metre dimensions directly into the `.glb` geometry at `scale = (1, 1, 1)` so runtime equips at **`1.0f`** with zero `CatalogScaleFactor` hacks.

### Target 1m-Normalized Weapon Class Dimensions (`1.05 m` Character Scale)
Enforced by `weapon_contract_check.py` (located at `~/.gemini/config/skills/game-character-3d/references/weapon_contract_check.py`):

| Class | Length Along Long PCA Axis (m) | Grip Shaft Radius | Notes |
|---|---|---|---|
| **`sword`** (1H) | **`0.45 – 0.90 m`** (~`0.55–0.72 m` target) | `1.0 – 1.2 cm` | Thin PCA end = blade tip (`thin_is_business = True`) |
| **`spear`** | **`1.00 – 1.60 m`** (~`1.30 m` ref) | `1.0 – 1.2 cm` | End opposite thin shaft = spearhead (`thin_is_business = False`) |
| **`bow`** | **`0.55 – 1.20 m`** (~`0.95 m` ref) | `1.0 – 1.2 cm` | Measured across handle wrap (`±8%` length / `4 cm` lateral of `grip_main`) |
| **`shield`** | **`0.22 – 0.60 m`** (~`0.25–0.27 m` chibi ref) | n/a | Largest extent; owner feedback capped chibi shield at ~`0.25–0.27 m` |

---

## 2. Socket, Grip & Pivot Orientation Contract

### Character Runtime Sockets (`WeaponSocket.cs` & Rig References)
- `game-client/src/World/WeaponSocket.cs:16-18` attaches equipped weapons to `BoneAttachment3D` **`handslot_r`** (Godot converts glTF `handslot.r` → `handslot_r`), searching `SocketBoneNames = {"handslot.r", "handslot_r", "prop_weapon_r"}` and falling back to `FallbackBones = {"prop_weapon_r", "mixamorig_RightHand", "RightHand"}`.
- Verified rig-reference parent bindings in `atelier/asset-forge/rig-reference/`:
  - `mixamo-65.bones.json`: `handslot.r` → `prop_weapon_r`
  - `meshy-humanoid.bones.json`: `handslot.r` → `prop_weapon_r`, `handslot.l` → `prop_shield_l`
  - `kaykit-core.bones.json`: `handslot.r` → `hand.r`, `handslot.l` → `hand.l`

### Weapon Attach Empties (Metadata-Only Swapping)
Every new weapon/shield `.glb` must carry **empty nodes** (no `mesh`, no `skin`) in world glTF metres so any character composes the weapon deterministically via `socket × inverse(grip_main)`:

- **Shafted weapons (`sword`, `spear`, `bow`):** `grip_main`, `grip_off`, `rest_stow`, `tip`, `butt`
- **Bow extras:** `string_a`, `string_b`, `nock`, `arrow_rest` (`nock` and `arrow_rest` within `0.5 m` of `grip_main`)
- **Shields (`shield`):** `grip_main`, `grip_off` (forearm strap), `rest_stow`

### Grip Frame Rules (Verified by `weapon_contract_check.py`)
1. **`grip_main` `+Y` axis:** points along the shaft toward the business end (`<= 2°` from shaft PCA axis for `sword`/`spear`/`bow`; `90 ± 2°` to the thin face-normal PCA axis for `shield`).
2. **`grip_main` `+Z` axis:** edge / thumb side.
3. **`grip_dir`:** `+Y` points toward the business end (`<= 45°`); when `tip` and `butt` exist, `(tip - butt)` must agree with `+Y`.
4. **`shaft_radius`:** cross-section ring at `grip_main` (averaged over `±0.5 cm`) must be **`1.0 – 1.2 cm`** so closed Mixamo/chibi fists wrap cleanly without clipping or floating.
5. **Non-held props & loot pivots:**
   - Floor-resting props (`game-client/assets/env/{barrel,crate}.glb`): pivot at **floor center** (`min_y = 0 ± 0.01 m`, centered X/Z).
   - Pickups / loot (`game-client/assets/loot/`): pivot at **geometric center** (`docs/asset-delivery-spec.md:12`).

---

## 3. Poly, Texture, Material & Godot 4.7 Budgets

> **Validator gap note:** `atelier/asset-forge/forge.config.json` currently defines only 4 character kinds (`character`, `chibiPlayer`, `mvpBoss`, `pipelineCharacter`) and has **no `weapon`, `prop`, or `loot` schema**. Enforce the budgets below via `glb_inspect`, `weapon_contract_check.py`, and Godot import checks until `forge.config.json` is extended.

| Asset Class | Triangle Budget | Texture / Material | Notes |
|---|---|---|---|
| **1H / 2H Weapons** | `<= 1,500 – 2,500 tris` | `1` material (max `2`), `512 px` (max `1024 px`) PBR base + normal + ORM | No n-gons; crisp silhouette at isometric zoom (`3.5–30 m`) |
| **Shields / Off-hand** | `<= 1,000 – 1,500 tris` | `1` material (max `2`), `512 px` (max `1024 px`) | Keep thickness readable from 3/4 bird's-eye camera |
| **Props & Loot** | `<= 500 – 1,200 tris` | `1` material, `256 – 512 px` | `game-client/assets/loot/` (8 GLBs: `book`, `coin`, `crown`, `gem`, `necklace`, `potion`, `potion_bottle`, `scroll`) |
| **Shaders** | Forward+ stylized | `game-client/assets/shaders/weapon_glow.gdshader` (enchant/rarity glow), `cel_shader.gdshader`, `outline.gdshader` | Avoid per-asset shader forks |
| **Godot 4.7.2 Export** | Plain glTF 2.0 `.glb` | **FORBIDDEN:** `KHR_mesh_quantization`, `EXT_meshopt_compression`, Draco, `gltf-transform webp` | External `.png.import` files should use `compress/mode=2` (VRAM compressed), not lossless `mode=0` |

---

## 4. Intake, Normalize & Validate Pipeline (`art-source/seed/weapons` → `game-client/assets/weapons`)

### Actual Repo Locations & Current Pipeline Limits
- **Seed weapon donors:** `art-source/seed/weapons/{arrow/Arrow.glb, spear/Spear.glb, sword/Sword.glb}` (3 files).
- **Runtime weapon catalog:** `game-client/assets/weapons/` (60 `.glb` files + `.glb.import` sidecars), registered in `game-client/assets/catalog-manifest.json` (`kind: "weapon"`, `render: "model3d"`, `driftGated: false`).
- **Known character-only script limits (do NOT assume they work on static weapons):**
  - `atelier/asset-forge/bake_export.py:44-45` fails if no `ARMATURE` object exists in the `.blend`.
  - `atelier/asset-forge/intake.mjs` copies only into `game-client/assets/characters/` and validates against character kinds in `forge.config.json`.

### Step-by-Step Weapon / Prop Workflow
1. **Author / Normalize in Blender `>= 4.5`:**
   - Start from a seed donor in `art-source/seed/weapons/` or a clean bespoke `.blend` saved under `art-source/bespoke/<asset_name>/source/<asset_name>.blend` (Git LFS).
   - Scale geometry data to the 1m class length table (§1) with `scale = (1, 1, 1)` applied; ensure grip radius `1.0–1.2 cm`.
   - Place the required empty nodes (`grip_main`, `grip_off`, `rest_stow`, `tip`, `butt`, plus bow extras if `bow`) with `+Y` along shaft toward business end and `+Z` to edge/thumb side.
   - Export glTF 2.0 `.glb` (`export_format="GLB"`, `export_apply=True`, `export_yup=True`, no Draco/meshopt/quantization) to `game-client/assets/weapons/<snake_case>.glb` (or `game-client/assets/loot/` / `game-client/assets/env/` for non-weapons).
2. **Run Contract & Structural Checks:**
   ```bash
   # Weapon empties, grip axis/direction, shaft radius, and class length
   python3 ~/.gemini/config/skills/game-character-3d/references/weapon_contract_check.py \
     game-client/assets/weapons/<asset>.glb --class sword|spear|bow|shield
   ```
   Then run `atlas-3d` MCP `glb_inspect` (§5) to verify world AABB, material count, and zero spike triangles, and confirm clean Godot import (`scripts/godot-verify.sh`). (`atelier/asset-forge/validate.mjs` wraps the `gltf-validator` npm package from `atelier/asset-forge/package.json` for manifest-gated entries.)
3. **Register Provenance, Manifest & Runtime Catalog:**
   - Add license/provenance entry to `art-source/LICENSES.md` **before** committing.
   - Add entry (`scene`, `render: "model3d"`, `kind: "weapon"|"loot"|"prop"`, `source`, `license`, `tier`, `label`) to `game-client/assets/catalog-manifest.json`.
   - If the weapon is runtime-swappable on characters, add its key to `WeaponSocket.SwordCatalog` in `game-client/src/World/WeaponSocket.cs` (at `1.0f` scale — no `CatalogScaleFactor` override).
4. **Generate Godot Sidecar & Run Gates:**
   - Run headless mono import via `scripts/godot-verify.sh` so Godot writes `game-client/assets/weapons/<asset>.glb.import`, and **commit `.glb` + `.glb.import` together**.
   - Run manifest drift check:
     ```bash
     node scripts/check_asset_manifest.mjs
     ```

---

## 5. Visual & Structural QA via `atlas-3d` MCP

Use the `atlas-3d` MCP server (`~/asset-studio-private/atlas-3d-plan/tools/atlas_3d_mcp.py`) to verify geometry and visual fidelity before shipping:

1. **Geometry & Bounds Audit (`glb_inspect`):**
   - Call `glb_inspect(glb_path="<abs-path>", space="world", top_stretched_tris=5)`.
   - Verify world AABB matches the class length band (§1), `grip_main`/pivot is sane, material count `<= 2`, and zero stretched spike triangles.
   - *Known limitation:* `glb_inspect` does not yet report `extensionsUsed` or texture VRAM compression — confirm clean glTF extensions via Blender export settings + Godot `.glb.import` / `.png.import` sidecars.
2. **Fast Silhouette & Aspect-Ratio Pre-Gate (`jev_qa`):**
   - Call `jev_qa(mode="prop", concept_path="<2d-concept.png>", render_path="<3d-render.png>", threshold=0.67, max_ar_delta=0.45)`.
   - Catches squashed/stretched blades, wrong aspect ratio, or silhouette drift in ~1s before spending Vision QA tokens.
3. **Close-Up Grip & Guard Inspection (`image_crop_inspect`):**
   - Call `image_crop_inspect(image_path="<render.png>", crop_box_norm=[x1, y1, x2, y2], max_dim=1024, out_path="/tmp/weapon_crop.png")` to inspect hand-grip seating, guard thickness, and blade alignment without loading full-size PNGs into main context.
4. **Open-Ended Visual Defect Scan (`vision_qa` / `codex_qa`):**
   - Call `vision_qa(images=["<concept.png>", "<turntable_or_held_render.png>"], rubric="raw", structured=True, prompt="Open-ended 3D weapon/prop QA: check silhouette faithfulness, blade/shaft proportion against a 1.05m chibi character, grip seating in hand, material readability, clipping, and shading defects.", out_path="/tmp/weapon_qa.json")`.
   - Separate technical cleanliness from concept faithfulness honestly; never prime the prompt with "approved/exempted" excuses.
