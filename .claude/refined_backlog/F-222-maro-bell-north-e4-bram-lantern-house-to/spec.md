---
title: "I-308 Maro Bell north E4: Bram lantern house, Tovin shrine, Old Lantern, Great Bell, and northern zone scene hookup (z = 20..-70)"
id: I-308
date: 2026-11-15
status: approved (owner decision 2026-11-15: generate r17..r20 in Tripo and dress Maro Bell north z = 20..-70 end-to-end)
---

# F-222 Maro Bell north E4: northern slice scene hookup (`z = 20..-70`)

Canonical spec: `docs/superpowers/specs/2026-11-15-i308-maro-bell-north-e4-scene-hookup-design.md`

## Acceptance criteria

- [ ] **AC0 (Private hygiene):** All 4 new Slice 2 GLBs registered from Asset Studio (`rights=restricted`, tag `maro-north-e4-1115`), `pull.sha256` matches lane sha256; 0 `.glb`, LFS pointers, `.import`, thumbs, or renders tracked in git.
- [ ] **AC1 (Manifest & ledger):** `node scripts/check_asset_manifest.mjs` passes with 0 FAILURE both locally (warm cache) and with `ATLAS_SKIP_STUDIO=1` (CI mode).
- [ ] **AC2 (Obstacle parity):** `staticObstacles` in `content/maps/maro-bell.json` is byte-identical to `release/1.34` (`42` entries).
- [ ] **AC3 (Scene gates & northern renders):** `scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'` passes, confirms all 27 structure GLBs + northern props + MultiMesh grass batching, and windowed `ATLAS_RENDER_MARO_BELL` renders the northern showcase shots cleanly.
- [ ] **AC4 (Full test & Gate 1):** `node --test scripts/tests/maro-bell.test.mjs`, `scripts/precheck.sh --no-install`, and `(cd server-rs && cargo test)` pass; feature ships cleanly into `release/1.34` and deploys locally.
