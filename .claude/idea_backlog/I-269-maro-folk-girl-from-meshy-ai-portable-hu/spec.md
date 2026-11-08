---
title: "Maro Folk girl from Meshy AI: portable humanoid rig, upper-body attack blend, hair tint and sword swap in Maro Bell"
id: I-269
status: idea
---

# Maro Folk girl from Meshy AI: portable humanoid rig, upper-body attack blend, hair tint and sword swap in Maro Bell

## Goal
Build and wire a **0.94 m Maro Folk (human) girl** from **Meshy AI** (using `content/concept-art/images/character-race-human-hearth-keeper.webp` as the source concept) into the **Godot client** inside the **Maro Bell** grey-box town (`ATLAS_MAP_ID=maro-bell`), walking and running at the F-184 **3 m/s** game pace with **AnimationTree upper-body attack layering** (so legs keep moving while attacking), **reusable humanoid rig / animation profile** for easy porting to Elf (`Linde Folk`) and `Silme Seers`, **runtime hair color tinting**, and **runtime sword variant swapping** (same weapon class, different look).

## Problem
1. **No Meshy-built Maro Folk girl in Maro Bell:** F-183 built the Maro Bell grey-box town and F-184 scaled player run speed to 3 m/s, but there is no 0.94 m Maro Folk female character generated via the owner's Meshy AI -> Auto-Rig -> Godot 4 `AnimationTree` technique standing, walking, running, and attacking in Maro Bell.
2. **Whole-body attack overrides locomotion:** `AnimationController.cs` currently plays `attack` on `AnimationPlayer` across the whole skeleton, stopping leg locomotion when attacking while moving. The owner's technique requires a lower-body locomotion blend (`idle` 0.2 s, `walk` 0.2 s, `run` 0.15 s) plus an upper-body attack layer (`immediate` / one-shot blend on spine/chest/arms/head/weapon bones) so legs continue walking/running during an attack swing.
3. **Portability across humanoid races:** New humanoid races (`Linde Folk` elf, `Silme Seers`) must reuse the same skeleton contract (`mixamo` / humanoid bone map + `handslot.r` / `prop_weapon_r` socket) and data-driven weapon-class animation profile without per-character controller code.
4. **Hair color & sword skin customization:** The owner wants runtime hair color changes (material/surface or shader/vertex region tint on the hair shell/surface without re-exporting GLBs) and runtime swapping between different sword models (`sword.glb`, `kk_sword_a.glb`, `kk_sword_b.glb`, `claymore.glb`, etc.) using the same 1H sword animation set.

## Technique & Architecture
1. **Meshy AI -> Blender -> Asset Studio (`pull-only`, `studio-private`):**
   - Generate the Maro Folk girl 3D mesh + PBR textures from `content/concept-art/images/character-race-human-hearth-keeper.webp` (0.94 m target scale per F-183 Maro Folk F height).
   - Auto-rig humanoid skeleton + animation clips (`idle`, `walk`, `run`, `combat_idle`, `attack`, `block`, `hit`, `death`), refine in Blender (normalized 0.94 m height, `handslot.r` / `prop_weapon_r` weapon socket, isolated/tagged `Hair` mesh surface or material slot so runtime hair tinting targets only hair, optional secondary `sec_hair_*` / `sec_cape_*` chains for `SpringBoneSimulator3D` or baked secondary motion), pass `game-character-3d` gates, and publish to **Asset Studio** (`montionugera/asset-studio`).
   - Register in `game-client/assets/manifest.json` as a `pull-only` entry (`license: "studio-private"`, `kind: "pipelineCharacter"`, `res://studio-cache/<sha256>.glb`). Never commit generated GLBs or mark CC0 in `atlas-world-svc`.
2. **Godot 4 Portable Humanoid Rig + Upper-Body Attack Layer (`AnimationController` / `AnimationTree`):**
   - Keep `AnimationController` data-driven by manifest/weapon profile so any humanoid sharing the standard bone set (`Maro Folk`, `Linde Folk`, `Silme Seers`) plugs in with zero C# changes.
   - Add an `AnimationTree` (`AnimationNodeBlendTree`: lower-body locomotion `idle`/`walk`/`run` with 0.2 s / 0.2 s / 0.15 s transitions + `AnimationNodeOneShot` upper-body filtered on upper-body bones `Spine`/`Spine1`/`Spine2`/`Neck`/`Head`/arms/hands/weapon socket) so triggering `Attack()` while moving plays the attack clip on the upper body while the legs keep playing `walk` or `run`.
   - Support `SpringBoneSimulator3D` (or baked secondary chains) on `sec_*` hair/cloth bones when present on the skeleton.
3. **Runtime Hair Color Tinting & Sword Variant Swapping:**
   - **Hair Color Customization (`CharacterAppearance` / `HairTint`):** Discover hair surfaces/meshes by material or node/surface name (`*hair*` / `Hair`) or UV/region mask, duplicate the material instance per entity, and apply a configurable hair color tint (`SetHairColor(Color)`) without mutating shared resources or non-hair surfaces.
   - **Sword Look Swap (`WeaponSocket`):** Extend `WeaponSocket` to swap between multiple sword PackedScenes (`res://assets/weapons/sword.glb`, `res://assets/weapons/kk_sword_a.glb`, `res://assets/weapons/kk_sword_b.glb`, etc.) on `handslot_r` / `prop_weapon_r` while keeping the same sword animation profile.
4. **Maro Bell Town Showcase & Probe (`ATLAS_MAP_ID=maro-bell`):**
   - Wire the Maro Folk girl into the Maro Bell town scene (`ATLAS_MAP_ID=maro-bell`) and verify via a headless/windowed Godot probe + rendered video/GIF and screenshots on the edit host (`:8788`).

## Acceptance criteria
- [ ] Maro Folk girl GLB (0.94 m ± 5% world height, humanoid rig with `idle`, `walk`, `run`, `combat_idle`, `attack`, `death`, `handslot_r` / `prop_weapon_r` socket, and distinct `Hair` surface/material) is generated via Meshy AI + Blender, published to Asset Studio, and wired into `game-client/assets/manifest.json` as a `pull-only` (`studio-private`) entry; `node scripts/studio-pull.mjs` and `node scripts/check_asset_manifest.mjs` pass with zero tracked `studio-cache/` files.
- [ ] Portable rig contract: `validate.mjs` / `AnimationController` accepts the 0.94 m Maro Folk girl (height band widened to `[0.90, 1.20]` m to match `characterScaleBandMeters` for female races and future `Linde Folk` / `Silme Seers` ports) and drives any humanoid rig sharing the bone set via data-driven clip mappings without per-race C# branches.
- [ ] Upper-body attack while moving: a Godot probe (run via `scripts/godot-verify.sh`) proves that when the character moves at walk/run speed (up to 3 m/s) and triggers `Attack()`, the upper-body bones (`Spine` / `RightArm` / `RightHand`) animate the attack swing while the lower-body bones (`LeftUpLeg` / `RightUpLeg`) continue the walk/run stride rather than freezing in the attack stance.
- [ ] Runtime hair color customization: calling `SetHairColor(Color)` on the character instances a per-entity material override and changes the hair surface color (verified by asserting the hair material albedo/tint changes for >= 2 distinct colors while skin/outfit surfaces remain unchanged).
- [ ] Runtime sword look swap: calling `WeaponSocket.Equip` with at least 2 different sword models (e.g. `res://assets/weapons/sword.glb` and `res://assets/weapons/kk_sword_a.glb`) swaps the equipped sword mesh under the right-hand socket while preserving the shared sword attack animation and < 1 mm hand-offset drift across attack frames.
- [ ] In `ATLAS_MAP_ID=maro-bell`, a windowed Godot render captures the 0.94 m Maro Folk girl standing in Maro Bell, blending `idle -> walk -> run` (at 3 m/s), attacking while moving, showing hair color variants and sword swaps; the resulting strip/GIF/screenshots are saved to `game-client/studio-cache/renders/` and served on the edit host with a tested review link.
- [ ] Gate 1 (`./scripts/precheck.sh --no-install`) passes green.
