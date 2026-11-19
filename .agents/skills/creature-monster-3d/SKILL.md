---
name: creature-monster-3d
description: Author, rig, animate, budget, and QA non-humanoid 3D creatures and monsters (`.glb`) for `atlas-world-svc` (Godot 4.7). Covers the 13 `content/bestiary/` body plans, 9 non-humanoid archetypes (quadruped, winged/drake, arachnid/insect, multi-limb, serpent, slime, spirit, automaton, plant), rigging and procedural clip synthesis (`synthesize_clips.py`), LOD/poly/texture budgets, `mob-shape.mjs` gate integration, and `atlas-3d` MCP QA (`glb_inspect`, `jev_qa`, `vision_qa`).
---

# Creature & Monster 3D (`atlas-world-svc`)

Use this skill whenever creating, rigging, animating, optimizing, or auditing non-humanoid 3D creatures and monsters (`.glb`) in `atlas-world-svc`.

Every rule below is grounded in live repo evidence (`game-client/assets/creatures/`, `content/bestiary/`, `scripts/lib/mob-shape.mjs`, `content/studio/mob_body_plan_picks.json`, `docs/unit-contract.md`, `atelier/asset-forge/forge.config.json`) and the multi-archetype procedural clip toolkit (`~/.gemini/config/skills/game-character-3d/references/`).

---

## 1. Non-Humanoid Body Plans & Archetype Mapping

### Canonical Bestiary Body Plans (`content/bestiary/README.md` & `bestiary.json`)
`content/bestiary/bestiary.json` defines **116** Undertow monsters across **12** ecological families and **13** skeletal-layout `bodyPlan` silhouettes. Always match a creature's 3D rig topology to its `bodyPlan` (grouped by silhouette, not family):

| Bestiary `bodyPlan` (Count) | 3D Archetype Topology | Skeleton & Grounding Rules |
|---|---|---|
| `quadruped-beast` (18), `quadruped-drake` (3) | Quadruped (`4-legs-quadruped`) | Horizontal spine (`Pelvis -> Spine -> Spine1 -> Neck -> Head`), 2 forelegs off `Spine1`/clavicle, 2 hindlegs off `Pelvis`, `Tail1..N` (`sec_tail_cb0_*`). Diagonal gait pairs (`FL+RR` vs `FR+LR`). **Never** apply biped upright arm re-posing to forelegs. |
| `winged-drake` (3), `winged-small` (6) | Winged (`birds-winged`) | Heavy drakes (`mob-violet-ash-drake`, `mob-scar-drake`, `mob-ashcrown-drake`) have 4 limbs + large wing span; small flyers are wing-dominated. Multi-link wing chains (`Wing1..3_L/R` or `sec_wing_l0_*`/`r0_*`) + tail fan. **Grounding:** keep airborne flyers aloft in `idle`/`walk`/`run`; only `death` settles to `y = 0`. |
| `insect-low` (11), `insect-upright` (2) | Arachnid / Multi-Legged (`insects`) | Compact thorax/abdomen (`Pelvis -> Thorax -> Abdomen`), 4/6/8 multi-segment legs (`Coxa -> Femur -> Tibia`), antennae (`sec_antenna_l0_*`/`r0_*`), mandibles. Keep each chitin segment **rigid (`1–2` bone influences max)**. |
| `serpentine` (6) | Serpent / Slime (`serpents-slimes`) | Pure axial spline (`Spine1..8 -> Tail1..6`) with upright hood/head and lateral S-wave undulation. For slimes (`8–12` bones): volume-preserving squash-and-stretch; pin hats/crowns with `rigid_prop.py` (`prop_hat_c`, uniform scale `1.0`). |
| `spirit` (11) | Floating Spirit (`spirits-floating`) | Legless hovering core + `4–6` radial lower-hem/ribbon chains. Vertical bobbing + phase-staggered skirt sway (`18–25°`). |
| `automaton` (11) | Mech / Construct (`robots-mechs`) | **100% rigid-piece skinning (`1` influence per mechanical island)** so brass/iron plates, pistons, and cannons never bend like rubber. |
| `plant-rooted` (6) | Stationary Plant (`plants`) | Rooted base (`Pelvis` fixed at `[0, 0, 0]` across all clips, `0.000` floor drift) + flexible stem (`Stem1..3`) + vine/leaf chains (`sec_vine_*`, `sec_leaf_*`). |
| `torso-dragger` (1) | Limbless / Forelimb Crawler | Torso + 2 forelimbs (`mob-ashfield-crawler`), no legs; ground-pinned pelvis slide with asymmetric forelimb pull. |
| `humanoid-raider` (24), `giant-hulk` (14) | Biped / Heavy Biped | Use humanoid rig conventions (`game-character-3d`); giant hulks scale `1.5–2×` human silhouette with stooped spine and thick limbs. |

---

## 2. Scale, Rigging, Retargeting & Clip Constraints

### Unit Contract & Current Repo Inventory
- **1 game unit = 1 metre** (`coord_scale = 1.0`, `docs/unit-contract.md`); glTF 2.0 `.glb`, **+Y up**, **-Z forward**, transforms frozen at `scale = (1, 1, 1)`, `snake_case` filenames (`docs/asset-delivery-spec.md`).
- **Gameplay anchors (`docs/unit-contract.md:32`, `atelier/asset-forge/forge.config.json:2-11`):** slim chibi player is **`0.90–1.20 m`** (`1.05 m` target), player body radius `1.2 m`, standard mob body radius **`1.4 m`**, mob high speed `1.65 m/s`.
- **Current `game-client/assets/creatures/` inventory (15 GLBs + `skeleton_Atlas_Pirate.png`):**
  - All 15 live in `game-client/assets/catalog-manifest.json` (`kind: "creature"`, `driftGated: false`) and are **not validated** by `atelier/asset-forge/validate.mjs`.
  - **Known legacy defects to avoid repeating in new creatures:**
    - Excessive bone/material counts: `demon.glb` (`129` bones), `bunny.glb` (`98` bones), `orc.glb` (`86` bones, `11` materials).
    - Over-budget geometry & corrupted clip names: `skeleton.glb` (`11,668` tris; duplicated Blender prefix `CharacterArmature|CharacterArmature|CharacterArmature|Death|...`).
    - Inconsistent armature prefixes across seed packs (`CharacterArmature|*`, `Armature|Slime_*`, `SpiderArmature|Spider_*`).
- **Rig-reference gap (`atelier/asset-forge/rig-reference/`):** currently contains **0 non-biped** `.bones.json` contracts (only `kaykit-core`, `kaykit-adventurer`, `kenney-mini`, `meshy-humanoid`, `mixamo-65`). Never force a quadruped, spider, or drake onto a biped rig reference.

### Retargeting & Procedural Clip Synthesis
- **Required clip states (`forge.config.json`):** `idle`, `walk`, `run`, `attack`, `death` (optional: `hit`, `cast`). Export clean, unprefixed lowercase action names (never duplicated `Armature|Armature|...` names).
- **Retargeting rule:** only retarget animations between creatures sharing the **same `bodyPlan` and joint hierarchy**. For mismatched rigs or static meshes, synthesize archetype-native clips with the verified scripts in `~/.gemini/config/skills/game-character-3d/references/`:
  ```bash
  # Universal 3-layer auto-rigger + clip synthesizer (idle/walk/run/attack/cast/hit/death)
  blender -b -P ~/.gemini/config/skills/game-character-3d/references/synthesize_clips.py -- \
    <in.glb> <out.glb> clips=all archetype=auto fps=24

  # Archetype-specific procedural passes (run headless via Blender >= 4.5)
  blender -b --factory-startup -P ~/.gemini/config/skills/game-character-3d/references/quadruped_locomotion.py -- in.glb out.glb --gait trot
  blender -b --factory-startup -P ~/.gemini/config/skills/game-character-3d/references/wing_flap.py -- in.glb out.glb --flap-deg 28 --feather-lag 0.45
  blender -b --factory-startup -P ~/.gemini/config/skills/game-character-3d/references/swim_wave.py -- in.glb out.glb --wave-deg 22 --wave-len 0.65
  ```
- **Secondary chains:** follow `sec_<part>_<side><idx>_<link>` naming (note `atelier/asset-forge/validate.mjs:144` currently caps links at `_[1-3]$`), keep `<= 4` bone influences per vertex, and verify `0°` loop closure on `idle`/`walk`/`run`.

---

## 3. LOD, Poly, Texture & Godot 4.7 Budgets

> **Validator gap:** `atelier/asset-forge/forge.config.json` currently defines only 4 kinds (`character`, `chibiPlayer`, `mvpBoss`, `pipelineCharacter`) and has **no `creature` / `mob` kind**. Until `forge.config.json` adds creature size tiers, enforce the budgets below via `glb_inspect`, `audit_godot_imports.py`, and Godot import checks.

| Tier (`.claude/agents/monster-and-mob-designer.md`) | Height / Scale Band | Max Triangles | Max Bones | Materials & Textures | File Size |
|---|---|---:|---:|---|---:|
| **Normal Monster** (`Monster`, pack `x15..x45`) | `0.60 – 2.20 m` (by `bodyPlan`) | **`<= 4,500`** (archetype median `1.5k–2.8k`) | `<= 36` | `1` mat (max `2`), `512 px` (max `1024 px`) | `<= 950 KB` |
| **Mini-Boss** (`Mini-Boss`, room leader) | `1.80 – 3.50 m` | **`<= 6,500`** | `<= 48` | `<= 2` mats, `1024 px` | `<= 1.50 MB` |
| **Raid Boss** (`Raid`) | `3.50 – 7.50 m` | **`<= 10,000`** | `<= 60` | `<= 2` mats, `1024 px` | `<= 2.20 MB` |
| **MVP Boss** (`MVP`, `forge.config.json:26-31`) | **`7.35 – 40.00 m`** | **`<= 12,000`** | `<= 64` | `<= 3` mats, `1024 px` | `<= 2.80 MB` |

- **LOD & Import:** keep `meshes/generate_lods=true`, `meshes/ensure_tangents=true`, `nodes/apply_root_scale=true` in `<creature>.glb.import`, and commit `.glb` + `.glb.import` together.
- **Textures:** max `1024 px`; external `.png.import` files must use `compress/mode=2` (VRAM compressed) + `mipmaps/generate=true`, not lossless `mode=0`.
- **Blocked glTF extensions (Godot 4.7.2):** **FORBIDDEN:** `KHR_mesh_quantization`, `EXT_meshopt_compression`, Draco, and `gltf-transform webp` on skinned GLBs. Export plain glTF 2.0 `.glb` from Blender `>= 4.5` (`export_apply=True`, `export_yup=True`).

---

## 4. `content/bestiary/` & Mob Body-Plan Gate Integration

- **Design backlog vs gated data (`content/bestiary/README.md`):**
  - `content/bestiary/bestiary.json` is ungated design data (deliberately has no `assetKey`, `status`, or `tier`).
  - Zone placement files (`content/bestiary/placement-thornveil.json`) **are strictly gated** against `content/schemas/bestiary-placement.schema.json` by `scripts/check_content.mjs`.
- **F-167 Body-Plan Gate (`scripts/lib/mob-shape.mjs`):**
  - *History note:* the one-shot migration script `scripts/mob_body_plan_pass.py` was **retired in F-215** (`18ef8012e`). Do **not** recreate or invoke it.
  - The active live contract is **`scripts/lib/mob-shape.mjs`** (`checkMobShape`, `TIER_RANGES` for `Monster`/`Mini-Boss`/`Raid`/`MVP`, `BODY_KIN_RACE`, and `FILLER_RE`) backed by **`content/studio/mob_body_plan_picks.json`** and tested by **`scripts/tests/mob-shape-gate.test.mjs`**.
- **Promoting a bestiary monster to a live 3D entity:**
  1. Author character sheet `content/characters/mob-<slug>.md` and register server mob definition (`content/generated/mob-types.json` + `content/generated/asset-keys.json`).
  2. Save source `.blend` in `art-source/bespoke/mob_<slug>/`, log provenance in `art-source/LICENSES.md`, export `game-client/assets/creatures/<slug>.glb`, and register in `game-client/assets/catalog-manifest.json` (or `manifest.json` if drift-gated).
  3. Generate & commit `.glb.import` via `scripts/godot-verify.sh`.

---

## 5. Verification & QA (`atlas-3d` MCP + Local Gates)

Run deterministic gates first, then visual QA via `atlas-3d` MCP (`~/asset-studio-private/atlas-3d-plan/tools/atlas_3d_mcp.py`):

### Stage 1 — Local Structural, Content & Godot Gates
```bash
# 1. F-167 mob body-plan & boss-name gate unit tests
node --test scripts/tests/mob-shape-gate.test.mjs scripts/tests/bestiary-placement.test.mjs

# 2. Asset manifest & Godot import/VRAM audit
node scripts/check_asset_manifest.mjs
python3 .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py

# 3. Godot 4.7.2 Mono headless import & animation/entity probe (never bare PATH `godot`)
scripts/godot-verify.sh ATLAS_VERIFY_ANIM '^\[AnimationVerify\] RESULT: PASS'
```

### Stage 2 — `atlas-3d` MCP Structural & Visual QA
1. **Mesh, Rig & Bounds Audit (`glb_inspect`):**
   - Call `glb_inspect(glb_path="<abs-path>", space="world", top_stretched_tris=5)`.
   - Verify world AABB matches the tier height band (§3), grounded feet `min_y ≈ 0` (except airborne flyers/spirits), bone count within cap, material count `<= 2`, and zero stretched spike triangles.
2. **Fast Silhouette Pre-Gate (`jev_qa`):**
   - Call `jev_qa(mode="prop", concept_path="<2d-concept.png>", render_path="<3d-render.png>", threshold=0.67, max_ar_delta=0.45)` to verify silhouette faithfulness and aspect ratio in ~1s.
3. **Open-Ended Visual Defect Scan (`vision_qa` + `image_crop_inspect`):**
   - Use `image_crop_inspect(image_path="<render.png>", crop_box_norm=[x1, y1, x2, y2], max_dim=1024, out_path="/tmp/creature_crop.png")` for head/limb/joint close-ups (never `Read` full-res PNGs directly in main context).
   - Call `vision_qa(images=["<concept.png>", "<turntable_or_pose_sheet.png>"], rubric="raw", structured=True, prompt="Open-ended 3D creature QA: inspect silhouette match to bodyPlan, limb/wing/chitin deformation, ground contact (or airborne hover), texture readability at isometric distance, clipping, and shading defects.", out_path="/tmp/creature_qa.json")`.
   - Report technical cleanliness and concept faithfulness separately; never prime the prompt with "approved/exempted" excuses.
