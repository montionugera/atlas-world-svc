# F-222 Maro Bell north E4: Bram lantern house, Tovin shrine, Old Lantern, Great Bell, and northern zone scene hookup (z = 20..-70) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (owner, verbatim):** `"(Recommended) สร้างภาพต้นแบบ ChatGPT + ปั้นโมเดล 3D ใหม่ทั้ง 4 ชิ้น (r17 บ้านร้านโคม Bram, r18 ศาลบันทึก Tovin, r19 โคมโบราณซ่อมเงิน, r20 ระฆังใหญ่ Great Bell — ใช้เครดิต Tripo ~120 เครดิต จากที่มีอยู่ 7,560 เครดิต) แล้วจัดวางโซนเหนือ (z = 20 ถึง -70) ให้ครบทีเดียว"` — finish Slice 2 (`Maro Bell north`, `z = 20..-70`) using the `studio-private` pull mechanism.

**Spec:** `docs/superpowers/specs/2026-11-15-i308-maro-bell-north-e4-scene-hookup-design.md`

## Tasks

- [x] **Task 1: Failing tests + Manifest pull entries + `art-source/LICENSES.md` rows for `r17..r20`.**
  - Update `scripts/tests/maro-bell.test.mjs` to assert:
    - All `43` `env:maro-*` keys (`39` from Slice 1 + `4` from Slice 2: `env:maro-bram-house`, `env:maro-tovin-shrine`, `env:maro-old-lantern`, `env:maro-great-bell`) exist in `game-client/assets/manifest.json`, are `isPullOnly`, `license: "studio-private"`, `render: "model3d"`.
    - `doc.structures` with `assetPath` count is `27` (`2` gates + `14` lanterns + `amber-shop` + `bram-house` + `tovin-shrine` + `old-lantern` + `great-bell` + `6` porcelain ribs `porcelain-rib-01..06`).
    - `doc.props` includes northern props (`z < 20`) across all kit/foliage/clutter/prop categories (`r05` wall faces, `r07` curbs, `r08` low stone walls, `r09` fences, `r11` trees, `r12` bushes, `r13` grass clumps, `r14` rocks, `r15` street props), all with `blocksMovement: false` and clear of `road-main`.
    - `staticObstacles` count (`42`) and rectangles are unchanged.
  - Add the 4 pull-only entries (`tag: "maro-north-e4-1115"`) to `game-client/assets/manifest.json` and 4 ledger rows to `art-source/LICENSES.md`.
- [x] **Task 2: Dress `content/maps/maro-bell.json` (`z = 20..-70`) and wire northern checks & camera shots in `MaroBellVerify.cs`.**
  - Bind `assetPath` on the 7 northern structures (`bram-house`, `tovin-shrine`, `old-lantern`, `great-bell`, `porcelain-rib-01..03`) and populate northern non-blocking `props[]` (`z = 20..-70`, `1`-space indent, `staticObstacles` untouched).
  - Update `MaroBellVerify.cs` for `27` `assetPath` structures, northern prop assertions, MultiMesh GPU instance count (`>= 80`), and 4 northern camera shots (`maro-bell-bram-house.png`, `maro-bell-old-lantern.png`, `maro-bell-tovin-shrine.png`, `maro-bell-great-bell-terrace.png`).
- [x] **Task 3: Pull cache, run Godot & Node & Rust verification, render local owner shots, review, and ship.**
  - Run `node scripts/studio-pull.mjs` (`45` pull-only entries total).
  - Run `node scripts/check_asset_manifest.mjs` (local and `ATLAS_SKIP_STUDIO=1`), `node --test scripts/tests/maro-bell.test.mjs`, `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL`, windowed `ATLAS_RENDER_MARO_BELL`, `scripts/precheck.sh --no-install`, and `(cd server-rs && cargo test)`.
  - Run independent `code-reviewer` review, fix any findings, update `README.md`, and run `psrw ship` + `scripts/deploy-local.sh`.
