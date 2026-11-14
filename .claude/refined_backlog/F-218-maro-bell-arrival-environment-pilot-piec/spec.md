---
title: "Maro Bell arrival: environment pilot pieces in game and grey box re-blocked for the 1.30 m player"
id: F-218
from_idea: I-303
status: refined
---

# Maro Bell arrival: environment pilot pieces in game and grey box re-blocked for the 1.30 m player

Full design (approved rev 3, owner picks of 2026-11-15 applied):
`docs/superpowers/specs/2026-11-15-i303-maro-bell-arrival-env-design.md`. That file wins where this summary differs.

## Summary

- **Step 0:** copy the 3 gated E2 pilot glbs into `game-client/assets/env/` (Git LFS), with manifest entries, baked
  thumbnails and `art-source/LICENSES.md` rows.
- **Pieces:** put them into `content/maps/maro-bell.json` by manifest key:
  - the gate tower on `gate-west` and `gate-east`, both doors facing -Z;
  - the lantern post on all 14 `lantern-*` blocks;
  - 2 non-blocking barrel props.
- **Client:** NEW optional block field `assetPath` (a manifest key such as `env:maro-gate-tower`) in
  `UnifiedMapDocument.cs`, and a non-static `MapChunkStreamer.SpawnGreyBlock` with toon shading and occluder fade.
  When the key does not resolve, the client falls back to the grey box.
- **Re-block:** heights to the 1.30 m environment canon. The gate becomes 7.1 m, the houses and shrine 6.5 m, the
  lanterns 3.1 m.
- **Gate walls:** the 2 gate blocks shrink to the tower footprint (3.74 x 2.37 at x ±3.87), so only the 2 gate rows of
  `staticObstacles` change. The road and the 4.0 m opening stay the same.
- **Game DB:** add two after-shots.

## Owner decisions (2026-11-15, decision page)

- **Models:** commit to the repo through Git LFS (the models become public).
- **Player size:** keep the player as is. The big town around a small player is deliberate.
- **Where it shows:** a local Godot run; the web panels show the map and the Game DB shots.
- **Gate walls:** resize the 2 gate walls to the towers.
- **Open:** the licence label of the 3 public models (spec open point O1). Nothing containing the glbs is pushed
  before the owner picks it.

## Acceptance criteria

- [ ] `env_gate.py` is GREEN for `r01-4k.glb`, `r04.glb` and `r15.glb`; the 3 glbs are committed as LFS objects
- [ ] `node scripts/check_asset_manifest.mjs` reports no FAILURE for the 3 `env:` entries
- [ ] `maro-bell.test.mjs`, `poc-maro-*.test.mjs` and `canon-names.test.mjs` pass; the `staticObstacles` diff shows only the 2 gate rows
- [ ] `godot-verify.sh ATLAS_VERIFY_MARO_BELL`, `PocMaro10mVerify` and `PlaytestSandboxVerify` pass; headless import is clean
- [ ] Phone and desktop screenshots of the gate arrival, before and after, are read and shown
- [ ] Gate 1 is green and the feature ships into release/1.34; after `deploy-local.sh` on release/1.34, `/api/runtime` shows the commit
