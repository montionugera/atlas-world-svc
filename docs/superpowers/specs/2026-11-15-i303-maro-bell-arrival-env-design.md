---
title: "I-303 Maro Bell arrival: environment pilot pieces in game, grey box re-blocked for the 1.30 m canon"
id: I-303
date: 2026-11-15
status: approved rev 3 (owner picks applied 2026-11-15)
---

# I-303 Maro Bell arrival: environment pilot pieces in game

## Goal (owner, verbatim)

"Ok" to: run E3 as a ps-release-workflow feature in the game repo: bring the 3 E2 pilot models + recipes into the game, re-block the Maro Bell grey box for the 1.30 m
player, ship into release 1.34, local deploy so it shows in the app.

## Problem

- `content/maps/maro-bell.json` is 49 grey `kind: block` structures, `props` empty, built for a 1.05 m player.
- The owner made the ChatGPT Maro Bell board canon for town sizes ("All A", 2026-11-14): player 1.30 m, doors >= 3.0 m, one-storey house 6-7 m, gate tower 7.1 m, lantern
  post 3.1 m, barrel 0.75 m.
- The env lane (asset-studio workspace) gated 3 pilot pieces. The client cannot draw a glb on a block, only `props`.

## Decisions (owner, 2026-11-15)

Made on the decision page; tile text verbatim.

1. **Models** = "Commit to the repo (Git LFS)": "Simpler pipeline, but the models become public in the repo." Chosen knowingly. Not the Asset Studio pull. (Was D-A.)
2. **Player size** = "Keep the player as is, for now": "The town reads about 38% too big around her. Scaling her is a separate feature later." (= B1, was D-B.)
3. **Where you see it** = "Local Godot run": "You see them in the game client on this Mac. The web panels show the map and Game DB shots." (Was D-C.)
4. **Gate walls** = "Resize the 2 gate walls to the towers": "Small server change. The road and the 4 m opening stay the same."
5. **Approve** = "Approve and build".

## Scope (in; Out below)

0. **Step 0: put the 3 glbs in the repo as LFS files** (no Asset Studio upload, no pull). Copy from the lane (read-only source) `env/pilot/r01/r01-4k.glb`, `r04/r04.glb`,
   `r15/r15.glb` to `game-client/assets/env/maro_gate_tower.glb`, `maro_lantern_post.glb`, `maro_barrel.glb` (names new; `env/barrel.glb` already exists). Then run the
   Godot import, bake the thumbnails and add the ledger rows (Files table). Acceptance: AC0.
1. Three pilot glbs, each `env_gate.py` GREEN in the lane: gate tower `r01-4k.glb` (3.74 x 2.37 x 7.10, 3,919 tris; owner accepted the ~2.85 m door and 7.1 m tower),
   lantern post `r04.glb` (collision 0.5 x 0.5, 3.1 h) and barrel `r15.glb` (0.62 x 0.62, 0.75 h). All have floor-centre pivots and face -Z. The current gate-tower mesh
   is the multiview remake: **one door, front (-Z) only**. Sizes on disk: 293 KB, 66.8 KB, 73.8 KB.
2. One new optional block field `assetPath` (manifest key): glb drawn, footprint from `size`. No `assetOffset` (pick 4 makes the footprint match the art, so there is
   nothing to offset).
3. Height re-block of the arrival structures to the canon, and the 2 gate blocks resized to the tower art (tables below).
4. Two after-shots in the Game DB (same shape as the existing grey-box entries; see F-216 below). Route: `MaroBellVerify.Render` (`ATLAS_RENDER_MARO_BELL=<dir>`, `MaroBellVerify.cs:90, 390`) streams the grey-box root into its own viewport and saves `maro-bell-top-down.png` and `maro-bell-eye-gate.png` (1280x720) with no server; it needs a windowed run, not headless (header comment, 16-17).
5. Ship into release 1.34 through the psrw feature flow, then `scripts/deploy-local.sh`.

Out: the other 13 recipe rows (r02, r03, r05-r16), any player body or height change (B1), road width (D2), the bell tower or landmark, lights and perf (E4), a Godot web
export (pick 3).

## Design

### Files (game repo; all exist unless marked NEW)

| File | Change |
|---|---|
| `content/maps/maro-bell.json` | `gate-west`/`gate-east` x, size and `assetPath`; other `size.y` changes (table); `assetPath` on 14 lantern blocks; 2 barrel `props`; 2 `staticObstacles` rows |
| `game-client/src/World/UnifiedMapDocument.cs` | `UnifiedMapStructureVolume` (class at 126; `Hover` 139, `Solid` 141) gets optional `AssetPath` (null) |
| `game-client/src/World/MapChunkStreamer.cs` | `SpawnGreyBlock` (818) **drops `static`** (it needs the instance `_sceneCache`, line 36, and `_occluder`). New branch below. `SpawnSinglePropIntoChunk` (1088) uses the same key resolver when `AssetPath` does not start with `res://` |
| `game-client/src/Content/AssetRegistry.cs` | read only: `Resolve(key, out tier)` (70) returns a capsule with `ResolveTier.Capsule` on a miss. Default manifest is `res://assets/manifest.json` (23) |
| `game-client/src/World/MaroBellPocController.cs` | workshop lantern light (672, y 2.2), `LanternGlowHead` sphere (689-692, y 2.2) and label height move up to the 3.1 m post's lamp. The label is set in the shared `AttachLanternLabel` (382; `Position` y 2.65 at 396), also used for the old-lantern and time-wound labels (283, 318, 876, 951, 997), so add a label-height parameter (default 2.65) and pass the new height only from the workshop-lantern calls (274, 697); the other lanterns stay put |
| `game-client/src/World/MaroBellVerify.cs` | block-top assert (below) **and edit line 73**: it asserts `Block_<id>` has a `BoxMesh` for every block, which the glb branch breaks for the 16 blocks with an `assetPath` (2 gates + 14 lanterns). New rule: a block with `assetPath` must have a child `Glb_<id>` (node name pinned here) under `Structure_<id>` and no `Block_<id>` BoxMesh; a block without `assetPath` keeps the BoxMesh check. `AssetRegistry` is an autoload (`project.godot:21`) so the glb resolves in the probe. Read the rest of the file for other `Block_` lookups (the only one found is line 73); read first for any pinned block heights |
| `game-client/assets/env/maro_gate_tower.glb`, `maro_lantern_post.glb`, `maro_barrel.glb` NEW | LFS (`.gitattributes:7` `*.glb`; each machine needs `git lfs install` once, `.gitattributes:2`) |
| `game-client/assets/env/<name>.glb.import` NEW x3, plus the extracted `<name>_*.jpg` and `.jpg.import` | Godot sidecars are committed for committed glbs (`git ls-files game-client/assets/env` shows `barrel.glb.import`, `crate_Atlas.png`, `crate_Atlas.png.import`; `.gitattributes` header says `.import` stays in normal git). Each lane glb has 1 embedded jpeg; the import extracts it (`gltf/embedded_image_handling=1`, `env/barrel.glb.import:44`); jpg under `game-client/assets/**` is LFS. Generated by `"$GODOT" --headless --path game-client --import`, then committed. The extracted file's name and type are read from the run |
| `game-client/assets/manifest.json` | 3 committed entries (below) |
| `game-client/assets/.thumbs/<thumbFilename>.webp` NEW x3 + `.thumbs/index.json` rows | baked by `node scripts/bake_thumbnails.mjs --only env/maro_` (headless Blender, default `/Applications/Blender.app`, `bake_thumbnails.mjs:65`; `--only` matches the source path). webp is normal git (`git check-attr filter` is unspecified there) |
| `art-source/LICENSES.md` | 3 ledger rows (file says every baked asset gets one, lines 3-4; `scripts/tests/precheck-pipeline-char.test.mjs:46` lists it as a gate path) |
| `scripts/tests/maro-bell.test.mjs` | new checks (below) |
| `content/concept-art/index.json` + `images/`, `thumbs/` | NEW entries `maro-bell-env-pilot-eye-gate`, `maro-bell-env-pilot-top-down` (webp, <= 800 KB, <= 2800 px) |

No `.gitignore` change. `game-client/studio-cache/` (`.gitignore:144`) stays ignored and is not used by these 3.

New block branch in `SpawnGreyBlock`: if `AssetPath` is set, resolve it with `AssetRegistry.Instance?.Resolve(...)` (cached in `_sceneCache`). On a resolved scene,
instance it, named `Glb_<id>` (the BoxMesh `Block_<id>` is not created for that block), at local `(0, Hover, 0)` with `RotY`, then call `EntityView.ApplyAnimeToonShading(instance, EntityKind.Npc)` and `_occluder?.RegisterPropRoot(instance,
max(size.x, size.z) / 2, 1)`, as the prop path does (1104-1107). Without the occluder call the 7.1 m tower blocks the camera with no fade. A null `Instance`, a `Capsule`
tier or an empty `AssetPath` draws the BoxMesh as today. The label stays at `top + 0.35`.

Recipes and prompts stay in the asset-studio workspace. The public game repo gets sizes and keys in the map, the glbs, and a `source` text in the manifest (no absolute or
private path).

### Asset keys and manifest entries

- The map stores **manifest keys only**: `env:maro-gate-tower`, `env:maro-lantern-post`, `env:maro-barrel`. A key missing from `manifest.json` falls back to the grey box
  (blocks) or draws nothing (barrel props, which have no collision).
- **Which manifest:** `manifest.json`, because the client binds only that file (`AssetRegistry.cs:23`; no client code reads `catalog-manifest.json`). It is the
  codegen-keyed, `driftGated: true` source (`check_asset_manifest.mjs:14, 228`).
- **Entry shape** (committed, no `pull` block), copied from `player` in `manifest.json` (`scene`, `source`, `license`, `tier`, `kind`) plus `render`, as `env:barrel` does
  in `catalog-manifest.json:522-529`: `{ "scene": "res://assets/env/maro_gate_tower.glb", "render": "model3d", "kind": "environment", "source": "<text>", "license": "<see
  O1>", "tier": "bespoke" }`. Barrel uses `kind: "prop"`. No `anims`.
- Rules in `scripts/check_asset_manifest.mjs` that apply:
  - (A) a driftGated entry must be Godot-loadable: `model3d` is (`render-spec.json`, `sceneLoadable: true`).
  - (B) `scene` is `res://`, a non-empty file, extension in the `model3d` `exts` (`:~455-490`). An LFS pointer file is non-empty, so a checkout without `git lfs pull`
    passes (B) and fails in `scripts/lib/anim-clips.mjs:16`; CI uses `lfs: true` (`.github/workflows/ci.yml:23`).
  - (C) `model3d` requires `license` and `source` non-empty; `kindDefaultRender` has no default for these kinds, so each entry sets `"render": "model3d"`. (T) `kind`
    needs a taxonomy section: `environment`, `prop` (`content/asset-taxonomy.json:27-32`).
  - (I) `scripts/lib/license-policy.mjs`: allowed `CC0`, `CC-BY-4.0`, `CC-BY-3.0` (line 12); `studio-private` only with a `pull` block (27-37); CC-BY also needs `source`
    and `author`.
  - (U) the thumbnail rule applies (the pull exemption at `:629` does not): per `scene`, `.thumbs/<thumbFilename>.webp` plus a `.thumbs/index.json` row whose `srcHash`
    matches the glb bytes (`:608-666`); rebake on any glb change. CI only hashes (no Blender).
  - (G) keyspaces are disjoint; `env:maro-*` is new. Codegen: `env:` is not reserved (`render-spec.json:125`) and the keys are not in `content/generated/asset-keys.json`,
    so one non-fatal UNKNOWN warning per key (as `npc:maro_folk_girl` today). Check: no new FAILURE, no codegen drift.
  - No sha256 check exists for a committed entry (only `pull.sha256`); integrity is the LFS oid. The PR text records `sha256sum` of the 3 files next to the lane
    originals.
- **Open point O1 (license value):** no committed owner-generated (Tripo/ChatGPT) asset exists yet, and current policy text says such art is not CC0:
  `scripts/lib/license-policy.mjs:27-28` ("an owner-generated Asset Studio asset is not CC0 ... never committed to this public repo"); the only owner Tripo asset in
  `art-source/LICENSES.md:718` is `studio-private` (private, pull-only). The `player` entry is **not** a precedent: its scene `characters/player_knight.glb` is a market
  KayKit Adventurers Knight asset under CC0 (`art-source/LICENSES.md:23`). The gate cannot catch a wrong pick: `license-policy.mjs:30-45` passes CC0 on an entry with no
  `pull` block. The owner picks: (a) `CC0`, which overrides the F-174 wording and adds a comment update at `license-policy.mjs:27-28`; or (b) a new allowed value in
  `ALLOWED` (`license-policy.mjs:12`) plus tests. The 3 `art-source/LICENSES.md` rows take the same value as the 3 manifest entries. Until then the entries carry a
  placeholder the gate will reject, so the build cannot ship around it.

### Placement in `maro-bell.json`

- **Gate tower (pick 4):** both gates keep `z 76`, `rotY 0`, `assetPath: env:maro-gate-tower`, and take the art footprint (3.74 x 2.37, the lane's gate numbers). The art
  inner face is at x ±2.0 (as r01: pair spacing 7.74 m, "4.0 m opening"), so:

  | Block | x | size (x, y, z) | footprint x | footprint z |
  |---|---|---|---|---|
  | gate-west | -3.87 (was -4.5) | 3.74, 7.1, 2.37 (was 5, 5, 3) | -5.74 .. -2.00 | 74.815 .. 77.185 |
  | gate-east | +3.87 (was +4.5) | 3.74, 7.1, 2.37 | +2.00 .. +5.74 | 74.815 .. 77.185 |

  Mesh centred on the block: no `assetOffset`. Measured here on `r01-4k.glb` accessor bounds: x -1.885 .. 1.887,
  z -1.17 .. 1.20 (3.77 wide against the lane's 3.74, so tests use +-0.05). `radius` (2.5) is left as is; the `block` path
  never reads it (`UnifiedMapDocument.cs:972-978`). The road (x +-2.0 half width, `road-main` width 4.0) and the opening
  do not move. No invisible wall remains: block = art, +-0.05 m.
- **Gap check (asked for):** can a player now walk round the outside of a tower and leave the town? **Yes, and they already can today, so nothing new opens.** Neighbours
  of the gates in `maro-bell.json`: `valley-wall-west/east` (x -38 / 38, size 4, so solid from |x| 36 to 40, full length), `porcelain-rib-06` (34.5, 70), and the
  `height-post-*` row at z 66. Today the towers occupy |x| 2..7 only, so |x| 7..36 at z 76 is open ground (29 m on each side); after the change it is |x| 5.74..36. The
  gate is a freestanding portal, not a seal, and no test pins it as one. South of it is a 2.815 m strip (80 - 77.185) to the map edge (z 80); whether the server clamps there is not
  checked. A sealed gate would be a new feature (fence blocks). Recorded, not closed.
- **Facing:** both keep `rotY 0`, so both doors face -Z toward the town (no mirror). The block root ignores
  `rotY` today (~463); the glb instance applies it.
- **Lantern post:** all 14 `lantern-*` blocks get `assetPath: env:maro-lantern-post`. The art (0.5) is wider than the block (0.3), so a body can clip up to 0.1 m into the
  post. That is accepted, the same as small hand penetration. Lantern footprints are not widened, so those obstacles stay unchanged.
- **Barrel:** there is no barrel block. Add 2 NEW `props` (`barrel-gate-01`, `barrel-gate-02`, `assetPath: env:maro-barrel`) beside the gate, off the road clear margin
  (road 4.0 + margin 1.0, so |x| >= 3.5 near z 72) and clear of the new tower footprint (|x| > 5.74 at z 74.8-77.2, or z < 74). Set `blocksMovement: false`, so there is
  no server obstacle and nothing for the parity test to see.
- `old-lantern` (3.5, -38) is a story object and keeps its grey box.

### Re-block numbers

| Item | Now (1.05 m) | After (CANON) | Source |
|---|---|---|---|
| road-main width | 4.0 | 4.0 (unchanged) | D2 open; recipes keep the grey-box footprint |
| gate opening | 4.0 (inner block edges at x ±2.0) | 4.0 (unchanged; inner faces still ±2.0) | r01 "4.0 m opening" |
| gate-west/east | x ∓4.5, 5 x 5 x 3 | x ∓3.87, 3.74 x **7.1** x 2.37 | CANON gate tower 7.1 m, matches glb |
| amber-shop, bram-house | 7 x 5 x 6 | 7 x **6.5** x 6 | CANON house 6-7 m (mid) |
| tovin-shrine | 8 x 5 x 7 | 8 x **6.5** x 7 | same band (ASSUMED a one-storey building) |
| lantern-01..14 | 0.3 x 2.5 x 0.3 | 0.3 x **3.1** x 0.3 | CANON lantern post 3.1 m |
| door | none in the grey box | none (r02 oil shop with its 3.0 x 1.8 door is out of scope) | CANON |
| stays grey | | `height-post-*` (pinned by the F-183 race table), `npc-spot-*`, valley walls, cliffs, `porcelain-rib-*`, `great-bell`, `old-lantern`, terrace | |

Block tops are not walkable: `TerrainElevation.SampleHeight` (`TerrainElevation.cs:380`) raises the floor only for `crystal_cave` and `watchtower`.

### Collision and `staticObstacles` (pick 4)

- `staticObstacles` is **hand-written in the map JSON**, not generated: `compile_world_maps.py` only emits other maps, and `scripts/tests/maro-bell.test.mjs:50-61` pins
  each solid block to one obstacle (< 0.051 m, `rectOf` at lines 14-19 with centre 40 / 80). So the two gate rows are edited by hand and the existing parity test is the
  proof.
- Server coordinates are map-centre + metres (centre 40, 80). **Only these two rows change** (the other 40 stay byte-identical):

  | id | min_x | max_x | min_y | max_y |
  |---|---|---|---|---|
  | gate-west | 34.26 (was 33.0) | 38.0 (was 38.0) | 154.815 (was 154.5) | 157.185 (was 157.5) |
  | gate-east | 42.0 (was 42.0) | 45.74 (was 47.0) | 154.815 | 157.185 |

- **Server code:** zero changes. `server-rs/src/content/map.rs:359` reads `staticObstacles`; the map JSON is compiled in by `include_str!` (`world_regions.rs:13`), so the
  server image must rebuild (`deploy-local.sh` does it). The Rust test `loads_maro_bell_grey_box_map_with_authored_spawn` (`map.rs:758-767`) pins no gate value and stays
  green; the count of 42 is pinned by the JS parity test (obstacle count = solid blocks), not by Rust.
- **Client:** block collision comes from the footprint (`UnifiedMapDocument.cs:972-978`), so the client follows the new `size`/`x` with no code change; glbs and barrels
  add no collider. An unresolved glb falls back to the grey box, so a missing file never leaves a walk-through hole.
- Road and spawn tests still pass by arithmetic: inner faces stay at server x 38 / 42 (`maro-bell.test.mjs:85-87` inflates by 2.0 and uses strict `<`), the spawn (40,
  151) is outside z 154.8 (`:78`).

### New tests

- `maro-bell.test.mjs`:
  - block heights match the table; every `assetPath` is a key with a `manifest.json` entry whose `scene` file exists; no map string contains `studio-cache` or `res://`;
  - gate blocks: `|x| - size.x / 2` = 2.0 (+-0.01), `size` = 3.74 x 7.1 x 2.37 (+-0.01), `rotY` 0, z 76, no `assetOffset` key; the two obstacle rows equal the table above
    (+-0.001);
  - lantern-06: `Lantern06WorldPos` in `MaroBellPocController.cs:28` (-0.8, 0, 23.7) equals the `lantern-06` block x/z (+-0.01) at y 0 (the glb floor pivot), the workshop
    light y sits inside the lamp (2.5-3.1; exact cage height read from `r04.glb` in step 0) and the label y is >= 3.1 + 0.2.
- `MaroBellVerify.cs` (Godot): for every block with `assetPath`, `SampleHeight(x, z, doc, top + 0.1)` equals `SampleBaseTerrainHeight(x, z, doc)` (+-0.01), so standing on
  a 7.1 m tower top is impossible.

## Scale (decided: B1)

- The environment is built at the 1.30 m canon; the player stays the Maro Folk Girl (0.94 m) or `player_knight.glb` (1.05 m), loaded unscaled in `VerticalSliceRoot.cs`
  (~255-275). Bands [0.90, 1.20]: `atelier/asset-forge/forge.config.json:4`, `UnifiedMapDocument.cs:59`; `EntityView.ResolveChibiScaleFactor` is tuned to 1.05 m.
- A 3.0 m door is about 3.2 times the girl's height (canon figure: 2.3), a measured ratio. The big town around the small player is deliberate (owner 2026-11-07, as
  quoted by ChatGPT 2026-11-15: "btw world size should 4x bigger (Town size / Player size) to support multiplayer"; art direction "Tiny Human, Massive World"). Every
  after-shot carries the flag **"B1: player unchanged (~1 m), big town is intended"**. Scaling the player is a later feature (overlaps F-198/F-199). No band, player or NPC
  scale changes here.

## Acceptance criteria

0. The 3 glbs are in `game-client/assets/env/` as LFS files: `git lfs ls-files` lists them, `git check-attr filter` says `lfs`, `sha256sum` equals the lane originals,
   `.glb.import` and extracted-texture sidecars are tracked, and `git ls-files` shows nothing new under `game-client/studio-cache/`.
1. Lane `tools/env_gate.py` is GREEN for `r01-4k.glb`, `r04.glb`, `r15.glb` (gate JSONs attached).
2. `node scripts/check_asset_manifest.mjs` has no FAILURE: licenses valid (O1 closed), thumbs present and fresh for the 3 `scene` paths, UNKNOWN warnings for the 3 `env:`
   keys expected.
3. `node --test scripts/tests/maro-bell.test.mjs` passes with the required ids, the 12 height posts unchanged, obstacle parity and the new tests above.
   `scripts/tests/poc-maro-*.test.mjs` and `canon-names.test.mjs` pass.
4. `git diff` of `staticObstacles` shows **only** the 2 gate rows, with exactly the values in the table above (no other row changes by a byte).
5. `godot-verify.sh ATLAS_VERIFY_MARO_BELL` passes on the pinned mono Godot build (with the new block-top assert and the updated line-73 rule: `Glb_<id>` for the 16 `assetPath` blocks, BoxMesh for the rest), and `PocMaro10mVerify` and `PlaytestSandboxVerify`
   pass, with no import errors for the 3 glbs.
6. `cargo test` in `server-rs` is green (`map.rs:758` loads maro-bell with the edited gates); the JS parity test confirms the 42 obstacles.
7. The 2 Game DB shots come from `MaroBellVerify.Render` (scope 4). This item is the phone and desktop look: screenshots from a local Godot run at the gate, phone 390x844 and desktop 1280x800, before and after. `deploy-local.sh` builds no Godot client and `shoot.mjs` only
   captures web pages, so the capture is (from the repo root):

   ```sh
   GODOT=~/Applications/godot-mono-4.7.2/Godot_mono.app/Contents/MacOS/Godot
   "$GODOT" --headless --path game-client --import
   dotnet build game-client/GameClient.csproj --nologo -v q
   ATLAS_MAP_ID=maro-bell ATLAS_CAPTURE_SCREENSHOT=1 ATLAS_SCREENSHOT_DELAY=5 ATLAS_QUIT_AFTER_SCREENSHOT=1 \
     "$GODOT" --path game-client --resolution 390x844 && cp /tmp/atlas_actual_render.png after-phone.png
   # repeat with --resolution 1280x800 -> after-desktop.png
   ```

   Capture hook: `game-client/src/VerticalSliceRoot.cs:571-585`. Not checked: whether it needs the local server room up
   and whether the arrival camera frames the gate (if not, frame by hand in `run_playtest.sh` and say so). The images
   are read and shown to the owner: both towers with doors on the town side, 14 lanterns, 2 barrels, no grey box behind
   an art piece, and the B1 flag.
8. Gate 1 (`scripts/precheck.sh`) is green and `psrw ship` merges into release/1.34. Gate 1 still runs the studio pull (`precheck.sh:519-524, 543`) because
   `npc:maro_folk_girl` is a pull entry; Asset Studio must be up as for any `game-client/` change (`PIPELINE_CHAR_PATHS`, `precheck.sh:193`). The 3 new entries add
   nothing to pull.
9. After ship, `scripts/deploy-local.sh` is run **from the `_release` worktree on release/1.34**: the web image only rebuilds on the release branch
   (`deploy-local.sh:81-87`). Then `/api/runtime` reports that commit and the 2 new Game DB entries render in the concept-art view (in whatever form F-216 leaves it, see
   below). The glbs show in the local Godot run (pick 3), not in a served web build.

## Risks, blast radius, reversibility

- **Blast radius:** `maro-bell.json` feeds the server room, the POC tests, the F-183 probe and `MaroBellVerify`. Height and gate edits could trip any test that pins
  `size` or the gate rows, so read `MaroBellVerify.cs`, `PocMaro10mVerify.cs` and `poc-maro-*.test.mjs` first (`grep gate` over `PocMaro10mVerify.cs`,
  `MaroBellVerify.cs`, `MaroBellPocController.cs` and `poc-maro-*.test.mjs` found no gate-size pin). Dropping `static` from `SpawnGreyBlock` changes no caller (line 472
  is in an instance method); the new branch is dead when `assetPath` is absent, so other maps are unchanged.
- **Public repo (owner accepted, pick 1):** the 3 glbs, their textures and thumbnails become public in the repo and in git history. Deleting them later removes them from
  the tip only. Prompts, recipes and the lane stay private; the license wording is O1.
- **LFS:** the repo is LFS-tracked for `*.glb` and already holds 689 committed glbs there (`git ls-files '*.glb' | wc -l`). The server image whitelists
  `content/**` only (`.dockerignore`), so it needs no glb. The web image does carry the files: it is built from `git archive` (`scripts/build-atlas-web-image.sh:11`,
  `Dockerfile.atlas-web:2`), `Dockerfile.atlas-web.dockerignore:9` whitelists `game-client/assets/**`, and `Dockerfile.atlas-web:11` runs `scripts/check_atlas_web_image.py`,
  which fails the build on any file under 200 B (an LFS pointer; `check_atlas_web_image.py:68-71`). So the local deploy needs the 3 LFS objects present locally. Whether
  `git archive` writes pointers or payloads is not verified; it is the same for every existing glb. CI fetches LFS (`ci.yml:23`).
- **Assumptions:** the toon pass keeps glb textures (R-A6); the lamp cage sits at 2.5-3.1 m (step 0); the lane glb pivots are floor-centre (measured x/z bounds above
  agree to 0.02 m). **Reversibility:** high in code; drop the new field, props, manifest entries, files, `size`/gate edits. History is not reversible (see Public repo).
  **Blind spots:** the `AtlasWorld.pck` export is not traced (pick 3: the local Godot run is the target).

## Overlap with in-flight work

- **F-216 (Game DB from the studio world, claimed by another session):** rebuilds the Game DB and explorer and replaces the concept-art tab's search. Scope item 4 and AC9
  depend on it. **Ship order:** if F-216 ships into 1.34 first, I-303 rebases and adds the 2 entries in F-216's format. If it has not shipped when I-303 is ready, I-303
  adds them to today's `content/concept-art/index.json` (F-216 does not delete `content/` files), checks the current panel, and F-216 carries them over. I-303 never edits
  explorer code.
- **F-198 (player outline, claimed):** touches `VerticalSliceRoot.cs`, `PlaytestSandboxRoot.cs` and the toon/outline shader path. I-303 edits neither file; watch the
  outline shader on env glbs in the screenshots.
- **F-199 (player floats, open):** targets `VerticalSliceRoot` and `TerrainElevation`. I-303 stays off both; if F-199 lands first, re-run the block-top assert after the
  rebase.
- **F-215:** shipped. **Shared:** `_catalog.json` and `.release.json` conflict as usual; rebase at ship.

## Open points

- **O1 License value** for the 3 committed owner-generated entries (see "Asset keys and manifest entries"). Needs the owner (or a one-line gate change). It blocks AC2,
  not the rest of the build.
  The owner is asked on the decision page https://claude.ai/artifact/1i4SoVVpbr3kDf2fRi58TY, card "5 · Licence": own = public, rights kept = option (b), a new allowed value;
  cc0 = option (a); studio = return to the Asset Studio pull. The build proceeds with the licence value as the LAST task, and nothing containing the glbs is pushed before the pick.
