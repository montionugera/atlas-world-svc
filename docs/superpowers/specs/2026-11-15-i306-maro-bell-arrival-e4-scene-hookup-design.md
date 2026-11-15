---
title: "I-306 Maro Bell arrival E4: full slice scene hookup, Asset Studio private pull entries, and live camera perf"
id: I-306
date: 2026-11-15
status: approved (owner decision 2026-11-15: keep current apricot trees at 0 credits and run E4 scene hookup via Asset Studio studio-private)
---

# I-306 Maro Bell arrival E4: full slice scene hookup

## Goal (owner, verbatim)

1. Original objective (2026-11-14): `"Can we have work on doing Game Environment in parallel ?"`, `"เริ่ม"` -> Phase E4: `"Fill the slice: remaining pieces, foliage, textures, lights | scene gates + perf numbers at the live camera | one reviewer; owner: walkable scene + pictures"`.
2. Owner decision (2026-11-15): `"ใช้ต้นแอปริคอตชุดปัจจุบัน (0 เครดิต) แล้วไปทำ E4 Scene Hookup ในเกมต่อเลย (อัปโหลดเข้า Asset Studio แบบ Private + วางใน maro-bell.json)"` and `"Private"` (F-218 rev 4 `studio-private` pattern).

## Problem

- F-218 (E3) hooked up the 3 pilot pieces (`env:maro-gate-tower`, `env:maro-lantern-post`, `env:maro-barrel`) and re-blocked `content/maps/maro-bell.json` for the 1.30 m canon.
- The remaining 13 recipe rows (`r02`, `r03`, `r05..r14`, remaining `r15` props, `r16` ground textures) are now built and gate-verified in the environment lane (`36` additional GLBs across kit pieces, hero structures, foliage cards, rocks, street props, and tiling texture carriers).
- `MapChunkStreamer.ResolvePrototypeMesh` currently calls `ResourceLoader.Exists(assetPath)` directly rather than `ResolveAssetScene(assetPath)`, so MultiMesh-batched clutter (`*grass*`) using manifest keys (`env:maro-grass-*`) would fail to resolve its prototype mesh without routing through `ResolveAssetScene`.
- `MaroBellVerify` needs E4 scene gates (all arrival `assetPath` structures and props resolve, road clear width `>= 3.5 m` along `road-main`, `staticObstacles` byte-identical to F-218, and live camera performance monitor readout for draw calls, visible primitives, and frame time).

## Architecture & Scope

1. **Asset Studio Upload & `studio-private` Pull Manifest (`36` new entries, tag `f221-maro-env-e4-1115`):**
   - Upload the 36 remaining slice GLBs to Asset Studio (`clientId=atlas-world`, `rights=restricted`, `kind=environment` or `prop`):
     - `r02`: `env:maro-oil-shop` (`environment`)
     - `r03`: `env:maro-porcelain-rib` (`environment`)
     - `r05`: `env:maro-wall-face-a`, `env:maro-wall-face-b`, `env:maro-wall-face-c` (`environment`)
     - `r06`: `env:maro-road-cobble` (`environment`, texture carrier)
     - `r07`: `env:maro-curb-straight`, `env:maro-curb-corner` (`environment`)
     - `r08`: `env:maro-wall-straight`, `env:maro-wall-end`, `env:maro-wall-corner` (`environment`)
     - `r09`: `env:maro-fence-panel`, `env:maro-fence-post` (`environment`)
     - `r10`: `env:maro-trim-sheet` (`environment`, texture carrier)
     - `r11`: `env:maro-apricot-tree-a`, `env:maro-apricot-tree-b`, `env:maro-broadleaf-tree-a`, `env:maro-broadleaf-tree-b` (`environment`)
     - `r12`: `env:maro-bush-a`, `env:maro-bush-b`, `env:maro-bush-c` (`prop`)
     - `r13`: `env:maro-grass-clump-a`, `env:maro-grass-clump-b`, `env:maro-grass-clover-clump`, `env:maro-grass-ember-daisy-clump` (`prop`, MultiMesh batched)
     - `r14`: `env:maro-rock-small`, `env:maro-rock-medium`, `env:maro-rock-large` (`prop`)
     - `r15`: `env:maro-oil-jar`, `env:maro-crate`, `env:maro-sign-board`, `env:maro-bench`, `env:maro-flower-pot`, `env:maro-shop-awning` (`prop`)
     - `r16`: `env:maro-ground-meadow`, `env:maro-ground-dirt-edge` (`environment`, texture carriers)
   - Register all 36 as `studio-private` pull-only entries in `game-client/assets/manifest.json` and `art-source/LICENSES.md`. Zero `.glb`, `.import`, texture, thumb, or render files committed to the public repo.

2. **Dressing `content/maps/maro-bell.json` (`z = 76..20` Arrival Slice, Zero `staticObstacles` Changes):**
   - **Structure `assetPath` bindings (footprints and `staticObstacles` untouched):**
     - `amber-shop` (`x: 6, z: 28`): `assetPath: "env:maro-oil-shop"`, `rotY: -1.5708` (door faces `-X` toward `road-main`).
     - `porcelain-rib-04` (`x: 34.5, z: 25`), `porcelain-rib-05` (`x: -34.5, z: 50`), `porcelain-rib-06` (`x: 34.5, z: 70`): `assetPath: "env:maro-porcelain-rib"`.
   - **Non-blocking `props[]` (`blocksMovement: false`, outside the `road-main` 4.0 m + 1.0 m clear corridor and clear of solid structure footprints):**
     - Valley wall faces (`r05`, 16 modules along `x = ±35.8`, `z = 72..22`, facing inward; grey `valley-wall-west/east` remain as collision).
     - Road curbs (`r07`, lining `road-main` from `z = 74` to `z = 20`), low stone walls (`r08`), timber fences (`r09`).
     - Orchard apricot & broadleaf trees (`r11`, 10 trees), bushes (`r12`, 24 bushes), MultiMesh grass/clover/ember-daisy clumps (`r13`, 48 clumps), rocks (`r14`, 12 rocks), and street props (`r15`: oil jars, crates, sign boards, benches, flower pots, and Amber's shop awning).

3. **Client MultiMesh Key Resolution & Scene Verification (`MapChunkStreamer.cs`, `MaroBellVerify.cs`):**
   - `MapChunkStreamer.ResolvePrototypeMesh`: route through `ResolveAssetScene(assetPath)` so `env:maro-grass-*` manifest keys resolve for GPU `MultiMeshInstance3D` batching, and sanitize `:` in generated `MultiMeshInstance3D` node names.
   - `MaroBellVerify`:
     - Verify all 20 `assetPath` structures (`2` gates + `14` lanterns + `amber-shop` + `3` arrival porcelain ribs) spawn `Glb_<id>`.
     - Verify `MultiMeshInstance3D` batches (`ActiveMultiMeshBatchCount > 0` and `ActiveGpuInstanceCount >= 40`) and non-blocking E4 props spawn cleanly.
     - Verify `staticObstacles` count (`42`) and values are unchanged vs F-218.
     - Sample `Performance.Singleton` monitors (`RenderTotalDrawCallsInFrame`, `RenderTotalPrimitivesInFrame`, `TimeProcess`) at the live camera (`z = 71` looking north toward the arrival slice) and print `[MaroBellVerify] PERF draw_calls=... primitives=... frame_ms=...`.
     - Apply the pulled `env:maro-ground-meadow` and `env:maro-road-cobble` textures in `MaroBellVerify.Render` when present in `studio-cache`, and save an additional live-camera arrival shot (`maro-bell-live-camera.png`) to the gitignored `game-client/studio-cache/renders/` folder.

## Acceptance Criteria

- **AC0 (Private hygiene):** All 36 new GLBs uploaded to Asset Studio (`rights=restricted`), `pull.sha256` matches lane sha256; 0 `.glb`, LFS pointers, `.import`, thumbs, or renders tracked in git.
- **AC1 (Manifest & ledger):** `node scripts/check_asset_manifest.mjs` passes with 0 FAILURE both locally (warm cache) and with `ATLAS_SKIP_STUDIO=1` (CI mode).
- **AC2 (Obstacle parity):** `staticObstacles` in `content/maps/maro-bell.json` is byte-identical to `release/1.34` (F-218).
- **AC3 (Scene gates & perf):** `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` passes, logs live-camera perf metrics (`draw_calls`, `primitives`, `frame_ms`), and confirms MultiMesh grass batching + all 20 structure GLBs.
- **AC4 (Full test & Gate 1):** `node --test scripts/tests/maro-bell.test.mjs`, `scripts/precheck.sh --no-install`, and `(cd server-rs && cargo test)` pass; feature ships cleanly into `release/1.34`.
