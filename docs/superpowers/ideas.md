# Ideas (off-goal findings — one line each, never chased inline)

- [RESOLVED 2026-10-30] Two world models SSOT: Documented ownership in `content/world/README.md`. `content/studio` is canonical SSOT (3 Continents, 6 Races, 63 Zones); `content/world` is lower-level GIS polygon substrate.
- [RESOLVED 2026-10-30] `MAXION_WORLD_TILES` / `MAXION_MONSTERS`: Extracted from monolithic `INDEX_HTML` into `08_catalog_and_3d_modal_views.js` with contract parity.
- [RESOLVED 2026-10-30] The `bestiary` tab: Surfaced in NAV_GROUPS with 116 fauna count badge.
- [RESOLVED 2026-10-30] `resolve_thumb_file`: Added strict audit mode (`allow_fallback=False` / `?strict=1`) returning true 404 for missing thumbnails.
- Star-Heart Tower (14F) has no overland 3D landmark; adding one to ATLAS_OVERLAND_LANDMARK_ANCHORS breaks the 2D/3D landmark parity gate (landmark_count 13 vs table 14) — needs the 2D renderer to draw it too.
