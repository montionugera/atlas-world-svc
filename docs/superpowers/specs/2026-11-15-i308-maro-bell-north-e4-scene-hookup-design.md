---
title: "I-308 Maro Bell north E4: Bram lantern house, Tovin shrine, Old Lantern, Great Bell, and northern zone scene hookup (z = 20..-70)"
id: I-308
date: 2026-11-15
status: approved (owner decision 2026-11-15: generate r17..r20 in Tripo and dress Maro Bell north z = 20..-70 end-to-end)
---

# I-308 Maro Bell north E4: northern slice scene hookup (`z = 20..-70`)

## Goal (owner, verbatim)

1. Original objective (2026-11-14): `"Can we have work on doing Game Environment in parallel ?"`, `"เริ่ม"`.
2. Owner Slice 2 choice (2026-11-15): `"(Recommended) Maro Bell โซนเหนือ (z = 20 ถึง -70: ลานเมือง, ร้าน Bram, หอระฆังใหญ่ Great Bell) — แต่งส่วนที่เหลือของเมือง Maro Bell ให้ครบ โดยใช้ของเดิม 39 ชิ้น + ปั้นตึกสำคัญเพิ่มอีก ~4 ชิ้น"`.
3. Owner Go-Ahead (2026-11-15): `"(Recommended) สร้างภาพต้นแบบ ChatGPT + ปั้นโมเดล 3D ใหม่ทั้ง 4 ชิ้น (r17 บ้านร้านโคม Bram, r18 ศาลบันทึก Tovin, r19 โคมโบราณซ่อมเงิน, r20 ระฆังใหญ่ Great Bell — ใช้เครดิต Tripo ~120 เครดิต จากที่มีอยู่ 7,560 เครดิต) แล้วจัดวางโซนเหนือ (z = 20 ถึง -70) ให้ครบทีเดียว"` and `"Private"` (`studio-private` pull-only pattern).

## Problem

- F-218 (E3) and F-221 (E4 Slice 1) dressed the southern arrival corridor (`z = 76..20`, `20` `assetPath` structures and `180` non-blocking props across `39` `env:maro-*` manifest keys).
- The northern half of Maro Bell (`z = 20..-70`: town plaza, Bram's lantern house at `z = -24`, the Old Lantern at `z = -38`, Tovin's shrine at `z = -50`, the three northern porcelain ribs at `z = 0, -25, -50`, and the Great Bell terrace at `z = -66`) still renders grey-box placeholder blocks for its 7 northern structures and lacks northern valley wall faces, road curbs, low walls, fences, trees, bushes, MultiMesh grass clumps, rocks, and street props.
- The 4 new Slice 2 hero GLBs (`r17` `env:maro-bram-house`, `r18` `env:maro-tovin-shrine`, `r19` `env:maro-old-lantern`, `r20` `env:maro-great-bell`) have been generated, cleaned, verified (`env_gate.py` GREEN on all 4), and uploaded to Asset Studio (`rights=restricted`, tag `maro-north-e4-1115`). They now need to be registered as `studio-private` pull entries and hooked up into `content/maps/maro-bell.json` and `MaroBellVerify.cs`.

## Architecture & Scope

1. **Asset Studio `studio-private` Pull Manifest (`4` new entries, tag `maro-north-e4-1115`, `43` `env:maro-*` keys total):**
   - `r17`: `env:maro-bram-house` (`environment`, Asset Studio `01a1df2b-effd-7bab-90b9-7168a7276169`, `sha256: 1ae78676462fda046193564db98fedb00255fde49c58105f909b087b1fb07bdc`)
   - `r18`: `env:maro-tovin-shrine` (`environment`, Asset Studio `01a1df2b-f024-7a70-925a-46725343ea94`, `sha256: 668943f9cf30b6b1a2970fad9c91f51508b59d3ac9c4625f25b8323d8ffb1ec1`)
   - `r19`: `env:maro-old-lantern` (`environment`, Asset Studio `01a1df2b-f043-732c-a684-ca9c85b7aa89`, `sha256: 4ac2e71bce756ea256fd66acf2fb54e3cc2a4ea834353e621bb32476558be7ea`)
   - `r20`: `env:maro-great-bell` (`environment`, Asset Studio `01a1df2b-f066-7089-b006-e2be0a0a0554`, `sha256: 6265eb36580c73d32a617054473c918f4170094217a06f1b456c9eded8d84a21c` -> exact `6265eb36580c73d32a617054473c98f4170094217a06f1b456c9eded8d84a21c`)
   - Register all 4 as `studio-private` pull-only entries in `game-client/assets/manifest.json` and `art-source/LICENSES.md`. Zero `.glb`, `.import`, texture, thumb, or render files committed to the public repo.

2. **Dressing `content/maps/maro-bell.json` (`z = 20..-70` Northern Slice, Zero `staticObstacles` Changes):**
   - **Structure `assetPath` bindings (`7` new structure bindings -> `27` total `assetPath` structures; footprints and `staticObstacles` untouched):**
     - `bram-house` (`x: -9, z: -24`): `assetPath: "env:maro-bram-house"`, `rotY: 1.5708` (door faces `+X` toward `road-main` and `npc-spot-bram`).
     - `tovin-shrine` (`x: 10, z: -50`): `assetPath: "env:maro-tovin-shrine"`, `rotY: -1.5708` (door faces `-X` toward `road-main` and `npc-spot-tovin`).
     - `old-lantern` (`x: 3.5, z: -38`): `assetPath: "env:maro-old-lantern"`, `rotY: 0`.
     - `great-bell` (`x: 0, z: -66`, `hover: 10`, `solid: false`): `assetPath: "env:maro-great-bell"`, `rotY: 0`.
     - `porcelain-rib-01` (`x: -34.5, z: -50`, `rotY: 1.5708`), `porcelain-rib-02` (`x: 34.5, z: -25`, `rotY: -1.5708`), `porcelain-rib-03` (`x: -34.5, z: 0`, `rotY: 1.5708`): `assetPath: "env:maro-porcelain-rib"`.
   - **Northern non-blocking `props[]` (`z = 20..-70`, `blocksMovement: false`, outside the `road-main` corridor and clear of solid structure footprints):**
     - Valley wall faces (`r05`, continuing north along `x = ±34.0` from `z = 16` to `z = -61`, facing inward).
     - Road curbs (`r07`, lining `road-main` from `z = 18` to `z = -60`), low stone walls (`r08`), timber fences (`r09`) framing the plaza, Bram's yard, and Tovin's shrine precinct.
     - Orchard apricot & broadleaf trees (`r11`), bushes (`r12`), MultiMesh grass/clover/ember-daisy clumps (`r13`), rocks (`r14`), and street props (`r15`: benches, flower pots, crates, oil jars, sign boards, and Bram's shop awning).

3. **Scene Verification & Northern Camera Shots (`scripts/tests/maro-bell.test.mjs`, `MaroBellVerify.cs`):**
   - `scripts/tests/maro-bell.test.mjs`:
     - Verify `43` `env:maro-*` keys registered as `studio-private` pull-only entries.
     - Verify `27` `assetPath` structures (`2` gates + `14` lanterns + `amber-shop` + `bram-house` + `tovin-shrine` + `old-lantern` + `great-bell` + `6` porcelain ribs `porcelain-rib-01..06`).
     - Verify northern props (`z < 20`) cover all kit/foliage/clutter/prop categories without encroaching `road-main` or blocking movement, and `staticObstacles` remains `42` entries byte-identical to F-218/F-221.
   - `MaroBellVerify.cs`:
     - Update `glbBlocks.Count == 27` assertion and verify `Glb_bram-house`, `Glb_tovin-shrine`, `Glb_old-lantern`, `Glb_great-bell`, and `Glb_porcelain-rib-01..03`.
     - Verify northern non-blocking props resolve and MultiMesh grass instance count reflects both southern and northern slices (`>= 80` GPU instances).
     - Add northern camera renders in `MaroBellVerify.Render` (`maro-bell-bram-house.png`, `maro-bell-old-lantern.png`, `maro-bell-tovin-shrine.png`, `maro-bell-great-bell-terrace.png`) saved to gitignored `game-client/studio-cache/renders/`.

## Acceptance criteria

- [ ] **AC0 (Private hygiene):** All 4 new Slice 2 GLBs registered from Asset Studio (`rights=restricted`, tag `maro-north-e4-1115`), `pull.sha256` matches lane sha256; 0 `.glb`, LFS pointers, `.import`, thumbs, or renders tracked in git.
- [ ] **AC1 (Manifest & ledger):** `node scripts/check_asset_manifest.mjs` passes with 0 FAILURE both locally (warm cache) and with `ATLAS_SKIP_STUDIO=1` (CI mode).
- [ ] **AC2 (Obstacle parity):** `staticObstacles` in `content/maps/maro-bell.json` is byte-identical to `release/1.34` (`42` entries).
- [ ] **AC3 (Scene gates & northern renders):** `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` passes, confirms all 27 structure GLBs + northern props + MultiMesh grass batching, and windowed `ATLAS_RENDER_MARO_BELL` renders the northern showcase shots cleanly.
- [ ] **AC4 (Full test & Gate 1):** `node --test scripts/tests/maro-bell.test.mjs`, `scripts/precheck.sh --no-install`, and `(cd server-rs && cargo test)` pass; feature ships cleanly into `release/1.34` and deploys locally.
