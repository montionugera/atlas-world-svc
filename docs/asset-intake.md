# Asset Intake Checklist

How a raw external asset (AI / marketplace / commission) becomes a game-ready `res://` asset.
Run this for every asset. It is the operational contract behind the CI drift-gate.

## 0. License first
- [ ] Confirm the license is commercial-safe (prefer **CC0**). Add a row to `art-source/LICENSES.md`.
- [ ] Drop the raw original under `art-source/<category>/` (LFS-tracked).

## 1. Normalize geometry (the step that silently breaks things if skipped)
- [ ] **Scale: 1 unit = 1 metre.** The server runs in world units and rendering multiplies by `scale`;
      a mis-scaled model renders wrong-sized relative to physics. Verify a human-sized character is ~1.8u tall.
- [ ] **Orientation:** Godot forward is **−Z**; face the model that way.
- [ ] **Pivot:** characters → at the **feet** (origin on ground plane); props → **center**.
- [ ] Apply transforms (freeze scale/rotation) so the exported mesh is clean.

## 2. Export / import
- [ ] Export to **glTF `.glb`** (Godot-native). Bake into `game-client/assets/<category>/<name>.glb`.
- [ ] Let Godot import; set the per-type import preset (see below). Commit the `.import` file.
- [ ] Characters: verify the `AnimationPlayer` lists the expected clips; rename clips to the project convention.

## 3. Register
- [ ] Add a manifest entry in `game-client/assets/manifest.json` keyed by the server type id
      (`mob:<mobTypeId>` | `projectile:<type>` | `player` | `npc` | `zone:<type>` — see `generated/asset-keys.json`):
      ```json
      "mob:spear_thrower": { "scene": "res://assets/characters/skeleton.glb", "source": "market", "license": "CC0 (Quaternius)", "tier": "seed", "kind": "character" }
      ```
- [ ] Run `node scripts/check_asset_manifest.mjs` → must pass (no broken path, license present).

## 4. Verify
- [ ] Headless probe or windowed launch: the entity renders the new asset (not a capsule), correctly sized.

## Import presets (fill in as conventions settle)
- Characters: import as scene, physics off, generate LODs (later), keep animations.
- Props/env: import as scene, no animation.
- (VFX / audio presets: added in Stages 2–3.)
