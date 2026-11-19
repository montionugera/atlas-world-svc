---
name: godot-asset-integration
description: Deterministic Godot 4.7 Mono C# asset integration standards for atlas-world-svc (`game-client/`). Covers `.glb`/`.tscn` import presets, VRAM texture compression (`compress/mode=2` vs lossless `compress/mode=0`), the 1 unit = 1 metre contract (`docs/unit-contract.md`), collision/LOD/instancing/material conventions, and exact verification commands (`audit_godot_imports.py`, `validate.mjs`, `check_asset_manifest.mjs`, `scripts/godot-verify.sh`). Use whenever importing, auditing, optimizing, or verifying 3D models, textures, shaders, or scenes in `game-client/`.
---

# Godot 4.7 Asset Integration (`atlas-world-svc`)

Use this skill whenever adding, updating, optimizing, or verifying 3D models (`.glb`), scenes (`.tscn`), textures (`.png`/`.jpg`/`.svg`), shaders (`.gdshader`/`.tres`), or manifest entries under `game-client/`.

**Runtime baseline (`game-client/project.godot`):** Godot `4.7.2` Mono (`C#`, `Forward Plus`), `120 Hz` physics ticks (`common/physics_ticks_per_second=120`), main scene `res://scenes/VerticalSlice.tscn`, autoloads `MetaGateway`, `AssetRegistry` (`game-client/src/Content/AssetRegistry.cs`), and `AudioRegistry`.

---

## 1. Unit, Coordinate & Scale Contract

Every length, radius, speed, and 3D mesh dimension in `server-rs/`, `content/`, and `game-client/` obeys **`1 game unit = 1 metre`** (`coord_scale = 1.0`, `docs/unit-contract.md` and `docs/asset-delivery-spec.md`):

- **Axes & transforms:** Forward `-Z`, Up `+Y`. Apply and freeze all transforms before export (`atelier/asset-forge/bake_export.py` enforces `export_apply=True, export_yup=True` on Blender `>= 4.5`).
- **Pivot/origin (`atelier/asset-forge/validate.mjs:38-39`):**
  - Characters/mobs: feet on ground plane (`Y` tolerance `<= 0.02 m`), centered on X/Z (`<= 0.10 m`).
  - Props/weapons: centered origin (or grip origin for socketed weapons).
- **Scale & budget bands (`atelier/asset-forge/forge.config.json`):**

| Kind / Category | Height Band (m) | Max Tris | Max Bytes | Max Texture | Required Clips |
|---|---:|---:|---:|---:|---|
| `chibiPlayer` | `0.90–1.20` (target `1.05`) | `10,000` | — | `1024 px` | `idle`, `walk`, `run`, `attack`, `death` |
| `pipelineCharacter` | `0.90–1.20` | `15,000` | `2,936,012` (2.80 MiB) | `1024 px` | `idle`, `walk`, `run`, `attack`, `death` |
| `character` (legacy/seed) | `1.60–2.00` | `10,000` | — | `1024 px` | `idle`, `walk`, `run`, `attack`, `death` |
| `mvpBoss` | `7.35–40.00` | `12,000` | — | `1024 px` | `idle`, `walk`, `run`, `attack`, `death` |
| Foliage / Terrain (`playerScaleAnchor.foliageCapsM`) | grass `<= 0.35`, bush `<= 0.65`, terrace step `<= 0.25` | — | — | `1024 px` | — |

- **Weapons:** Normalize weapon meshes to `~0.55–0.72 m` blade length at export. Do **not** add new runtime scale hacks to `game-client/src/World/WeaponSocket.cs:39-46` (existing `0.11f–0.68f` overrides exist only to compensate for legacy Quaternius/KayKit meshes).
- **Socket naming:** Godot converts glTF `handslot.r` to `handslot_r` and `mixamorig:RightHand` to `mixamorig_RightHand` (`WeaponSocket.cs:9-10`). `WeaponSocket.cs:17-18` resolves `handslot.r`, `handslot_r`, `prop_weapon_r`, `mixamorig_RightHand`, `RightHand`.

---

## 2. Godot 4.7 `.glb` & `.tscn` Import Standards

- **Filename convention (`validate.mjs:41`, `docs/asset-delivery-spec.md:27`):** `snake_case` matching `^[a-z0-9_]+\.glb$` (no spaces or uppercase).
- **Required `.glb.import` baseline** (verified across all `634` `.glb.import` files in `game-client/assets/`):
  - `gltf/naming_version=2`
  - `gltf/embedded_image_handling=1` (extracts embedded textures to `<stem>_*.{jpg,png}` on first import; `scripts/godot-verify.sh:48-65` validates that extracted textures and their `.ctex` targets exist for `studio-cache/*.glb`)
  - `nodes/apply_root_scale=true`
  - `nodes/use_name_suffixes=true` and `nodes/use_node_type_suffixes=true`
  - `meshes/ensure_tangents=true`
  - `meshes/generate_lods=true`
  - `meshes/create_shadow_meshes=true`
  - `meshes/light_baking=1`
  - `meshes/force_disable_compression=false`
- **Blocked glTF extensions on Godot 4.7.2:** Do **not** export `.glb` files with `KHR_mesh_quantization`, `EXT_meshopt_compression`, or Draco (`KHR_draco_mesh_compression`), and do **not** run `gltf-transform webp` on skinned/morph character GLBs (causes sparse-accessor errors and strips `VRMC_materials_mtoon`).
- **Sidecar hygiene:** Always commit `<asset>.import` sidecars for tracked files under `game-client/assets/` so UIDs and import parameters remain deterministic across worktrees. Never commit `game-client/.godot/imported/` (rebuilt by `godot --headless --path game-client --import`).
- **Blender export exit-code pitfall (`atelier/asset-forge/bake_export.py:7-13`):** Blender 4.5 exits `0` on unhandled Python exceptions; any Blender export script must catch errors and call `sys.exit(1)` explicitly.

---

## 3. VRAM Texture Compression (`compress/mode=2` vs `compress/mode=0`)

Audited baseline on `release/1.34` (`game-client/assets/`, excluding `.thumbs/`):
- **716 lossless `compress/mode=0` image imports** (`696` `.png`, `19` `.svg`, `1` `.jpg`) — of which **588 are inside 3D/world asset directories** (`characters/`, `creatures/`, `dungeon/`, `env/`, `loot/`, `models/`, `nature/`, `vfx/`, `weapons/`).
- Only **10 VRAM-compressed `compress/mode=2` `.png.import` files** currently exist (`dungeon/*_texture.png`, `nature/*_texture.png`, `characters/player_knight_knight_texture.png`).

### Compression Rules
1. **3D mesh & world textures** (`characters/`, `creatures/`, `dungeon/`, `env/`, `loot/`, `models/`, `nature/`, `weapons/`):
   - Set `compress/mode=2` (VRAM Compressed: S3TC/BPTC on desktop, ETC2 on mobile) and `mipmaps/generate=true`.
   - Keep max resolution `<= 1024 px` (`forge.config.json` `maxTextureSize`) and raw file size `<= 1.00 MiB`.
2. **2D UI, icons, SVG, and alpha-critical masks** (`art/`, `icons/`, `ui/`):
   - `compress/mode=0` (Lossless) is acceptable when crisp edges or exact alpha masks are required, but every tracked file still requires a committed `.import` sidecar (currently `icons/atlas_maro_bell_icon.png` is missing its `.import`).
3. **Never bulk-mutate `.import` files blindly:** Always run `audit_godot_imports.py` (dry-run by default) first, then re-import with Godot Mono headless (`--import`) after any `.import` parameter change so `.s3tc.ctex` caches regenerate cleanly.

---

## 4. Collision, LOD, Instancing & Material Conventions

- **LOD & Visibility Ranges:**
  - Keep `meshes/generate_lods=true` on all `.glb.import` files.
  - Pair mesh LODs with `VisibilityRangeEnd`, `VisibilityRangeEndMargin`, and `VisibilityRangeFadeModeEnum.Self` — see `game-client/src/World/MapChunkStreamer.cs:876-878` (`42.0f` end / `6.0f` margin) and `game-client/src/World/EntityView.cs:160-162` (`13.5f` end / `2.5f` margin).
- **GPU Instancing (`MultiMeshInstance3D`):**
  - Static, non-blocking repeatable props and ground cover (`blocksMovement == false`) batch into chunk-level `MultiMeshInstance3D` in `game-client/src/World/MapChunkStreamer.cs:109,413,888` (1 draw call per asset type, zero `Node3D` overhead). Keep instanced prop meshes single-surface where possible.
- **Collision:**
  - Rely on Godot import name suffixes (`-col`, `-colonly`, `-convcol`, `-convcolonly`, enabled by `nodes/use_name_suffixes=true`) or simple primitive/convex shapes rather than high-poly trimesh colliders.
- **Materials & Shaders (`game-client/assets/shaders/`):**
  - Active shaders: `cel_shader.gdshader`, `outline.gdshader`, `stylized_grass_floor.gdshader`, `weapon_glow.gdshader`, `maro_fountain_water.gdshader`, `maro_plunge_foam.gdshader`, `maro_river_water.gdshader`, `maro_waterfall_ribbon.gdshader`, `maro_wet_bank.gdshader`, plus `cel_material.tres`.
  - **Character material naming contract (`game-client/src/World/EntityView.cs:241-360`):** `ApplyAnimeToonShading` upgrades imported `StandardMaterial3D` surfaces at runtime using case-insensitive material-name matching:
    - `highlight` / `extra` → unshaded eye catchlight (no outline).
    - `eye` / `iris` / `eyelash` / `eyeline` / `brow` / `mouth` (or transparent materials) → toon diffuse, `DisableReceiveShadows = true`, no outline.
    - `face` / `skin` / `head` → porcelain toon skin, `DisableReceiveShadows = true`.
    - Preserve explicit, descriptive material names on character exports so facial parts do not accidentally inherit inverted-hull outlines or hair shadow artifacts.

---

## 5. Verification Commands (Run Before Claiming Done)

Run from the repository root in order of speed:

### 5.1 Import Sidecar, VRAM Compression & Budget Audit (Fast, Dry-Run by Default)
```bash
# Human-readable audit of game-client/assets/ (read-only, exits 0)
python3 .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py

# Machine-readable JSON or CI-style strict mode (exits 1 on violations)
python3 .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py --json
python3 .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py --strict

# Unit test for the audit script
python3 .agents/skills/godot-asset-integration/scripts/test_audit_godot_imports.py -v
```

### 5.2 Manifest Drift & GLB Structural Validation
```bash
# Stage-0 manifest, render-spec, clip-name, and file-existence drift gate
node scripts/check_asset_manifest.mjs

# Khronos glTF + forge.config.json game-rule validation (manifest or single GLB)
node atelier/asset-forge/validate.mjs --manifest game-client/assets/manifest.json
node atelier/asset-forge/validate.mjs <path/to/model.glb> --kind pipelineCharacter --tier bespoke
```
> **Known coverage boundaries:** `validate.mjs` validates only the 4 character kinds in `atelier/asset-forge/forge.config.json` (skipping `vfx` and `catalog-manifest.json`) and silently skips missing files in gitignored `game-client/studio-cache/`. Pair it with `audit_godot_imports.py` for full `game-client/assets/` coverage.

### 5.3 Godot 4.7.2 Mono Headless Import & C# Probes (`scripts/godot-verify.sh`)
**Never** run bare PATH `godot` to verify C# scenes — the non-mono binary prints `"Can't load script"` and still exits `0` (`scripts/godot-verify.sh:3-4`). Always use `scripts/godot-verify.sh` (which verifies `.mono.`, builds `game-client/GameClient.csproj`, runs bounded `--headless --import` if needed, and requires the probe's `PASS` line):
```bash
scripts/godot-verify.sh ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS'
scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'
scripts/godot-verify.sh ATLAS_VERIFY_PIPELINE_CHAR '^\[PipelineCharVerify\] VERDICT PASS$'
scripts/godot-verify.sh ATLAS_VERIFY_PLAYTEST_SANDBOX '^\[PlaytestSandboxVerify\] VERDICT PASS$'
```
