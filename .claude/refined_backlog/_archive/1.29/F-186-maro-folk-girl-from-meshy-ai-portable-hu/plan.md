# Maro Folk girl from Meshy AI: portable humanoid rig, upper-body attack blend, hair tint and sword swap in Maro Bell — Implementation Plan

## Phase 1: Meshy AI 3D Generation, Auto-Rig, Hair Material Split & Asset Studio Publish
1. Inspect `content/concept-art/images/character-race-human-hearth-keeper.webp` and existing `~/asset-studio-private/atlas-3d-plan/characters/race-human-hearth-keeper/` assets.
2. Use Meshy AI API (`$MESHY_API`) to generate the Maro Folk girl 3D model from the female hearth-keeper concept image, auto-rig humanoid skeleton, and fetch Meshy animation presets (`idle`, `walk`, `run`, `attack`, `death`) — recording exact Meshy credits used.
3. Refine in Blender:
   - Normalize world height to **0.94 m** (F-183 Maro Folk female height).
   - Ensure standard humanoid bone naming (`mixamo` / `kaykit-core` compatible) + `prop_weapon_r` / `handslot.r` right-hand weapon socket so the rig and animation profile port cleanly to Elf (`Linde Folk`) and `Silme Seers`.
   - Separate/tag the hair material slot (`Hair` / `mat_hair`) so runtime hair tinting (`SetHairColor`) cleanly recolors the hair without affecting skin or outfit.
   - Add `sec_hair_*` / `sec_cape_*` secondary bones and verify all `game-character-3d` gates (`anim_anomaly_check.py`, `mesh_stretch_check.py`, contact sheet renders).
4. Publish the verified GLB to **Asset Studio** (`montionugera/asset-studio`) and record its `assetStudioAsset` UUID, `tag`, and `sha256`.

## Phase 2: Worktree Sync, Manifest Pull Entry & Portable Rig Validation
1. Run `psrw sync` inside the `F-186` worktree so `release/1.29` (including `F-183` Maro Bell and `F-184` 3 m/s speed rescale) is merged.
2. Widen `pipelineCharacter` height band in `atelier/asset-forge/forge.config.json` from `[0.95, 1.15]` to `[0.90, 1.20]` so 0.94 m female humanoids (`Maro Folk`, `Linde Folk`, `Silme Seers`) pass validation alongside 1.05 m–1.20 m characters.
3. Add the pull-only entry (`race:maro_folk_girl` / player/NPC binding) to `game-client/assets/manifest.json` (`license: "studio-private"`, `kind: "pipelineCharacter"`, `res://studio-cache/<sha256>.glb`) and run `node scripts/studio-pull.mjs`.

## Phase 3: Godot 4 Upper-Body Attack Layer, Hair Color Tinting & Sword Variant Swap
1. **Upper-Body Attack Layer (`AnimationController.cs`):**
   - Build a procedural `AnimationTree` (`AnimationNodeBlendTree`) on humanoid characters when `AnimationPlayer` and `Skeleton3D` are present:
     - Base locomotion state/blend (`idle` 0.2 s, `walk` 0.2 s, `run` 0.15 s).
     - Upper-body `AnimationNodeOneShot` (`attack` immediate / 0.05 s–0.15 s blend) with bone filter enabled on upper-body bones (`Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `LeftShoulder`..`LeftHand`, `RightShoulder`..`RightHand`, `prop_weapon_r`, `handslot_r` — and `sec_*` children) so leg bones (`Hips` rotation/legs `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftFoot`, `RightFoot`) keep playing `walk`/`run` while attacking on the move!
   - Optional `SpringBoneSimulator3D` attachment for `sec_hair_*` / `sec_cape_*` chains in Godot 4.
2. **Runtime Hair Color Tinting (`CharacterCustomization.cs` / `EntityView.cs`):**
   - Add `CharacterCustomization.SetHairColor(Node3D modelRoot, Color hairColor)` (and expose on `EntityView` / `VerticalSliceRoot`), which finds any mesh surface whose material name or surface/mesh name matches `hair` (or configured hair surface), duplicates its `BaseMaterial3D` / `ShaderMaterial` per instance, and applies the hair color tint without mutating shared resources or non-hair surfaces.
3. **Runtime Sword Look Swap (`WeaponSocket.cs`):**
   - Support equipping multiple sword models (`res://assets/weapons/sword.glb`, `res://assets/weapons/kk_sword_a.glb`, `res://assets/weapons/kk_sword_b.glb`, `res://assets/weapons/claymore.glb`) on `handslot_r` / `prop_weapon_r` while keeping the shared `sword` animation profile.
4. **Maro Bell Integration (`VerticalSliceRoot.cs` / `PipelineCharVerify.cs` / `PipelineStripRender.cs`):**
   - Support selecting the Maro Folk girl in `ATLAS_MAP_ID=maro-bell`, extend `PipelineCharVerify` to test 0.94 m height, upper-body attack while legs walk/run at 3 m/s, hair color tinting (2+ colors), and sword variant swapping (2+ swords).
   - Render showcase screenshots + animated GIF/video in Maro Bell (`game-client/studio-cache/renders/`), verify by eye, and serve via the edit host (`:8788`).
5. Run Gate 1 (`./scripts/precheck.sh --no-install`) and `psrw ship --no-deploy`.
