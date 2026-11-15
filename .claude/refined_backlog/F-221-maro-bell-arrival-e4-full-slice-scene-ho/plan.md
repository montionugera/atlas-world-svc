# F-221 Maro Bell arrival E4: full slice scene hookup, Asset Studio private pull entries, and live camera perf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (owner, verbatim):** `"ใช้ต้นแอปริคอตชุดปัจจุบัน (0 เครดิต) แล้วไปทำ E4 Scene Hookup ในเกมต่อเลย (อัปโหลดเข้า Asset Studio แบบ Private + วางใน maro-bell.json)"` — finish Phase E4 of the environment route (`Maro Bell arrival`, `z = 76..20`) using the `studio-private` pull mechanism established in F-218 rev 4.

**Spec:** `docs/superpowers/specs/2026-11-15-i306-maro-bell-arrival-e4-scene-hookup-design.md`

## Tasks

- [ ] **Task 1: Upload the 36 new E4 GLBs to Asset Studio (`rights=restricted`, tag `f221-maro-env-e4-1115`).**
  - Verify `http://asset-studio.joymify.local.com/v1/health` returns `200`.
  - Upload all 36 E4 GLBs from `env/maro-arrival-manifest.json` (excluding `gate-tower-4k`, `gate-tower-10k`, `lantern-post`, `barrel`), read back each Asset Studio record, and verify `sha256` matches the lane `sha256` and `rights == "restricted"`.
- [ ] **Task 2: Failing tests + Manifest pull entries + `art-source/LICENSES.md` rows.**
  - Update `scripts/tests/maro-bell.test.mjs` to assert:
    - All 39 `env:maro-*` keys (3 from F-218 + 36 from F-221) exist in `game-client/assets/manifest.json`, are `isPullOnly`, `license: "studio-private"`, `render: "model3d"`.
    - `doc.structures` with `assetPath` count is `20` (`2` gates + `14` lanterns + `amber-shop` + `3` arrival porcelain ribs `porcelain-rib-04..06`).
    - `doc.props` includes all E4 arrival categories (`r05` wall faces, `r07` curbs, `r08` low stone walls, `r09` fences, `r11` apricot/broadleaf trees, `r12` bushes, `r13` grass clumps, `r14` rocks, `r15` street props), all with `blocksMovement: false` and clear of the `road-main` corridor (`clearMargin` respected).
    - `staticObstacles` count (`42`) and rectangles are unchanged from F-218.
  - Add the 36 pull-only entries to `game-client/assets/manifest.json` and 36 ledger rows to `art-source/LICENSES.md`.
- [ ] **Task 3: Dress `content/maps/maro-bell.json` (`z = 76..20`) and wire MultiMesh key resolution in `MapChunkStreamer.cs` + scene/perf checks in `MaroBellVerify.cs`.**
  - Update `MapChunkStreamer.ResolvePrototypeMesh` to resolve via `ResolveAssetScene(assetPath)` so `env:maro-grass-*` keys batch into `MultiMeshInstance3D` nodes.
  - Dress `content/maps/maro-bell.json` (`1`-space indent, `staticObstacles` untouched).
  - Update `MaroBellVerify.cs` for 20 `assetPath` structures, MultiMesh batch count / instance count assertions, live camera performance monitor logging (`draw_calls`, `primitives`, `frame_ms`), pulled road/ground texture application in `Render`, and `maro-bell-live-camera.png` output.
- [ ] **Task 4: Pull cache, run Godot & Node & Rust verification, render local owner shots, review, and ship.**
  - Run `node scripts/studio-pull.mjs` (`41` pull-only entries total).
  - Run `node scripts/check_asset_manifest.mjs` (local and `ATLAS_SKIP_STUDIO=1`), `node --test scripts/tests/maro-bell.test.mjs`, `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL`, windowed `ATLAS_RENDER_MARO_BELL`, `scripts/precheck.sh --no-install`, and `(cd server-rs && cargo test)`.
  - Run independent `code-reviewer` + C# review, fix any findings, update `README.md`, and run `psrw ship` + `scripts/deploy-local.sh`.
