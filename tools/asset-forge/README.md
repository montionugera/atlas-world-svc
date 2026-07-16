# Asset Forge

Pipeline for turning a Blender kitbash into a validated, game-ready
character `.glb`: **AUTHOR** (Blender, interactive) → **BAKE** (headless
Blender export) → **VALIDATE** (Khronos + game rules) → **INTAKE**
(transactional manifest write) → **VERIFY** (existing rails: drift-gate,
Storybook, headless probes).

This README is the AUTHOR runbook plus the command reference for the rest
of the pipeline. See `docs/superpowers/specs/2026-07-15-asset-forge-design.md`
for the full design.

## Stage: AUTHOR (Blender, interactive — this is guidance, not a script)

1. **Import a donor.** Open Blender and import a rigged character glb from
   `art-source/seed/kenney-mini-characters/*.glb` (CC0). This is your
   kitbash base — it already carries the shared rig and the 32 Kenney
   animation clips.

2. **May change** (creative latitude):
   - Mesh geometry — sculpt, reshape, swap parts between donors.
   - Materials.
   - Textures — new colormap, or a per-mob texture.

3. **Must not change** (mechanically enforced by VALIDATE — see the
   troubleshooting table below):
   - Armature bone names and hierarchy.
   - Armature modifiers.
   - Animation clip names.

   The whole point of the kitbash strategy is that the 32 shared Kenney
   clips come free and already match the `AnimationController`'s default
   clip-map. Breaking rule 3 doesn't just look wrong in Blender — VALIDATE's
   `skeleton` and `clips` checks will fail the bake outright.

4. **Scale to target.** Donors are ~0.7u tall; the delivery spec (and
   VALIDATE's `height` rule) require **1.6–2.0u**. Scale the whole kitbash
   up (~2.4×) and apply transforms.

   > **Caution:** applying scale on an armature can distort animation
   > location F-curves. If it does, VALIDATE's `height`/`clips`/`skeleton`
   > checks will catch it on the next bake — that's the loop-back this
   > pipeline is built around, not a special case to code around.

   #### Working apply-scale procedure
   Verified during the first real authoring session (mob_aggressive_brute,
   donor character-male-b, factor 2.7218). Do NOT use object-level scale +
   `Ctrl+A → Apply Scale` — applying scale on the armature does not adjust
   pose-bone location F-curves, and parented meshes make the apply order
   ambiguous. Scale the DATA directly, all three pieces with the same
   factor `f = 1.8 / current_height`:

   1. **Bone rests** (edit mode): `eb.head *= f; eb.tail *= f` for every
      edit bone.
   2. **Mesh vertices** (object mode, both meshes): `v.co *= f`.
   3. **Animation location F-curves** (every action): for each fcurve whose
      `data_path` ends with `"location"`, multiply keyframe `co[1]`,
      `handle_left[1]`, `handle_right[1]` by `f` (the donor set has 126
      such curves; rotations/scales need no change).

   All object scales stay `(1,1,1)` throughout — nothing to apply. Verify
   with data-level measurements (`v.co.z` min/max), not `object.bound_box`,
   which caches stale values until the depsgraph re-evaluates.

5. **Save** to:

   ```
   art-source/bespoke/<asset_name>/source/<asset_name>.blend
   ```

   `<asset_name>` is `snake_case` (matches VALIDATE's `naming` rule once
   baked to `<asset_name>.glb`). This path is Git LFS (see `.gitattributes`).

## Stage: BAKE

Headless Blender export — deterministic, asserts Blender ≥ 4.5, exports
glTF 2.0 binary with transforms applied, textures embedded, animations
included, feet pivot preserved. Also stamps provenance
(`asset.extras.atlasForge`: Blender version + source `.blend` sha256).

```bash
bash tools/asset-forge/bake.sh <src.blend> <out.glb>
```

`$BLENDER` overrides the Blender binary path (default:
`/Applications/Blender.app/Contents/MacOS/Blender`).

## Stage: VALIDATE

Two layers: the official Khronos `gltf-validator` (structural conformance),
plus this repo's game rules (height, pivot, clips, skeleton, budgets,
naming, license, provenance — see the troubleshooting table below).

```bash
node tools/asset-forge/validate.mjs <out.glb> --kind character
```

Also runs over an entire manifest (this is what CI runs):

```bash
node tools/asset-forge/validate.mjs --manifest game-client/assets/manifest.json
```

Prints `FAIL <rule>: <detail>` / `WARN <rule>: <detail>` lines and exits
non-zero iff there are failures. `bespoke`-tier entries fail hard on game
rules; `seed`-tier entries only warn (the known seed-scale bug is tracked
as an F-002 follow-up, not something CI should redden today).

## Stage: INTAKE (transactional)

Runs VALIDATE first (any failure aborts with zero side effects), then
copies the glb into `game-client/assets/characters/` and writes the
manifest entry atomically, then runs the drift-gate
(`scripts/check_asset_manifest.mjs`). Any failure after validation rolls
back the manifest and removes the staged glb — re-running is always safe.

```bash
node tools/asset-forge/intake.mjs <out.glb> --key <manifest-key> --license "<license text>" [--dry-run]
```

- Add the license entry to `art-source/LICENSES.md` **before** running
  intake — VALIDATE's `license` rule checks the ledger, and intake calls
  VALIDATE first.
- `--dry-run` reports the actions that would be taken (validate, copy,
  manifest write, drift-gate) without touching the filesystem.
- On success, intake prints a reminder:

  > **Commit the Godot `.import` sidecar together with the glb** — otherwise
  > other machines re-import the asset with different settings.

  Godot writes a `<name>.glb.import` file the first time it imports the
  asset; that file is normal git (not LFS — see `.gitattributes`) and must
  land in the same commit as the glb.

## Command block (end-to-end)

```bash
# 1. Author in Blender (see AUTHOR above), save to art-source/bespoke/<name>/source/<name>.blend

# 2. Bake
bash tools/asset-forge/bake.sh art-source/bespoke/<name>/source/<name>.blend /tmp/<name>.glb

# 3. Validate
node tools/asset-forge/validate.mjs /tmp/<name>.glb --kind character

# 4. Add a row to art-source/LICENSES.md BEFORE intake

# 5. Intake (dry-run first if unsure)
node tools/asset-forge/intake.mjs /tmp/<name>.glb --key mob:aggressive --license "CC0 (Kenney Mini Characters, kitbashed)" --dry-run
node tools/asset-forge/intake.mjs /tmp/<name>.glb --key mob:aggressive --license "CC0 (Kenney Mini Characters, kitbashed)"

# 6. Commit the glb + its .glb.import sidecar together, plus the LICENSES.md and manifest.json changes
```

## Troubleshooting (by VALIDATE rule name)

| Rule | What it checks | Typical cause | Fix |
|---|---|---|---|
| `structural` | Khronos glTF-Validator errors | Broken export (bad UVs, invalid accessor, etc.) | Re-export from Blender; check for Blender console errors during BAKE |
| `height` | Bounding-box Y ∈ configured range (character: 1.6–2.0u) | Scale not applied, or applied to the wrong object | Re-check step 4 of AUTHOR — apply scale on the whole kitbash, not just the mesh |
| `pivot` | Feet on ground plane (`\|minY\| ≤ 0.02u`), X/Z centered (`≤ 0.1u`) | Origin not at world origin, or object offset after kitbash edits | Move object origin to feet-center before baking; re-center in Blender |
| `clips` | Every required state (idle/walk/run/attack/death) maps to an existing clip name | Clip renamed or deleted during editing | Never rename clips (AUTHOR rule 3); check `forge.config.json`'s `defaultClipMap` if using a non-standard mapping |
| `skeleton` | Bone-name set matches `rig-reference/kenney-mini.bones.json` exactly | Bones added/removed/renamed, or armature modifier changed | Never touch armature bone names/hierarchy (AUTHOR rule 3); diff against the reference joints file |
| `triangles` | ≤ per-kind budget (character: 10 000) | Sculpt/kitbash added too much geometry | Decimate or simplify mesh; budgets live in `forge.config.json` |
| `textures` | ≤ per-kind max texture size (character: 1024×1024) | New texture exported oversized | Downscale texture before baking |
| `resources` (warning) | External resource (e.g. a texture URI) resolves on disk | Texture file missing next to the glb | Only relevant for non-embedded exports; BAKE embeds textures by default |
| `naming` | Filename is `snake_case`, no spaces, `.glb` | `<asset_name>` used spaces/CamelCase | Rename the `.blend` and re-bake to match `^[a-z0-9_]+\.glb$` |
| `license` | Asset key has a row in `art-source/LICENSES.md` | Ledger entry not added before intake | Add the row (see command block step 4), then re-run |
| `provenance` (warning) | `asset.extras.atlasForge` stamp present | Glb was hand-exported instead of baked via `bake.sh` | Not a hard failure — but prefer `bake.sh` so provenance is traceable |

## Layout

```
tools/asset-forge/
  package.json          # own Node context: @gltf-transform/*, Khronos validator
  forge.config.json     # per-kind budgets, default clip map
  bake.sh / bake_export.py   # headless Blender export + stamping
  validate.mjs          # structural + game rules
  intake.mjs            # transactional intake
  rig-reference/kenney-mini.bones.json
  lib/                  # shared glb/manifest helpers
  tests/                # jest + fixture glbs
```

This package's dependencies are isolated from the `colyseus-server`/`client`
pnpm workspace — a third Node context in the repo, by design.

> **Godot extracted textures are runtime dependencies.** Godot's glb import
> EXTRACTS embedded textures to `<asset>_<name>.png` next to the glb, and the
> imported scene depends on them at runtime (the dependency lives in the binary
> `.scn`, invisible to grep). Commit them together with the glb and `.import`
> sidecar — deleting them as "orphans" breaks the asset in-game while the
> storybook (which reads the raw glb) keeps looking fine.
