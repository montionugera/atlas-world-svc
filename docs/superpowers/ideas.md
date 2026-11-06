# Ideas (off-goal findings — one line each, never chased inline)

- [RESOLVED 2026-10-30] Two world models SSOT: Documented ownership in `content/world/README.md`. `content/studio` is canonical SSOT (3 Continents, 6 Races, 63 Zones); `content/world` is lower-level GIS polygon substrate.
- [RESOLVED 2026-10-30] `MAXION_WORLD_TILES` / `MAXION_MONSTERS`: Extracted from monolithic `INDEX_HTML` into `08_catalog_and_3d_modal_views.js` with contract parity.
- [RESOLVED 2026-10-30] The `bestiary` tab: Surfaced in NAV_GROUPS with 116 fauna count badge.
- [RESOLVED 2026-10-30] `resolve_thumb_file`: Added strict audit mode (`allow_fallback=False` / `?strict=1`) returning true 404 for missing thumbnails.
- Star-Heart Tower (14F) has no overland 3D landmark; adding one to ATLAS_OVERLAND_LANDMARK_ANCHORS breaks the 2D/3D landmark parity gate (landmark_count 13 vs table 14) — needs the 2D renderer to draw it too.
- atlas-web: `atlasSetParams` accepts any `patch.tab` from content links without an allowlist (02_state_and_composable_layers.js).
- atlas-web: Concept Arts `show()` keeps the old item if Back lands on another `id` while the lightbox is open.
- atlas-web: zone-bgm rebuilds `getNodesLookup()` on every sync and its class MutationObserver watches the whole body; memoise if it ever shows in a profile.
- atlas-web: `applyNameMap` token map still rewrites lowercase "porta"/"mink"/"electro" in any future prose; replace at source via `name-map.json`.
- Atlas web shell header: lint finds it wraps to 2 rows at 1280, 28/44px uneven controls and 39px tap targets on phone (found on the concept-art check, 2026-10-31).
- Follow-up to F-167: t_deep_validation_slice keeps 3 filler boss strings, outside the gate's scope.
- Follow-up to F-167: floor, room and warp strings plus other atlas sections still say "Baium", another game's boss name.
- test_wave_ux8_unified_spatial_engine_ol2d_map3d_and_glb_exporter fails on release/1.19: CustomEvent is missing in its vm harness (seen during F-167).
- Follow-up to F-167: Ignisazar (demon), Caelia (angel) and Nocturne have no fitting race key and read as "Undead · MVP"; decide on demon or celestial race keys.
- Follow-up to F-167: world_boss_spawn_radar names the Chronometer Foundry boss "Aethelgard", which is the Architect's own name; the chain says Aethel-Prime.
- F-167 review leftovers: Tool-Participle Animal is 43 of 89 tagged names; shape filter stays on with zero tagged rows and the disabled toggle can't clear it; #atlasShapeLive keeps old text after leaving the tab; spec says the pass updates boss_hierarchy_chains but it only checks them and updates the radar.
- I-246 follow-up: atlas-world page gives no on-page warning when it is behind the release (after `ship --no-deploy` or `promote --direct`); needs a served marker of the release head, which a pod cannot read from git, so it takes a psrw change or a new moving part. `verify-atlas-web.sh` reports the gap by hand until then.
- F-168 follow-up: 115 map thumbnails have no baked file (82 in Map Sheets, 33 in Connected Map Directory, mostly `monster-*.webp`); the release page shows a placeholder, the edit host still shows a substituted image. Bake them or fix the keys.
- DONE in F-173 (1.24): (2026-11-05, F-171 review LOW) precheck serial path has no INT/TERM trap, so a TERM there skips kill_tree (AC3 covers parallel only); AC4 test orphans its `sleep 300`s if the assertion fails; kill_tree still misses grandchildren re-parented when a mid-tree pid exits before it is stopped.
- F-174 finding (2026-11-06): `scripts/godot-verify.sh ATLAS_VERIFY_VERTICAL_SLICE` fails on SmartCameraOccluder tree-canopy fade; pre-existing (reproduced at base fe07dc540), not wired into Gate 1, so nothing catches it.
F-174 backlog (2026-11-06): NotifyHit only fires for hits the local player deals (VerticalSliceRoot.cs ~1582); remaining deferred minors are listed in the F-174 final review (pending hit/attack survive death, WeaponSocket.Equipped dangles after failed Instantiate, FindPlayer duplicated in 3 C# files, precheck in-section skip branch untested, perl timeout fallback lacks kill escalation, studio-pull null-200 reported as unreachable).
