# Ideas (off-goal findings — one line each, never chased inline)

- Two world models need one owner: `content/world` (4 continents, gated) vs `content/studio` (3 continents). (2026-10-24, atlas-world SSOT merge)
- [RESOLVED 2026-10-30] `MAXION_WORLD_TILES` / `MAXION_MONSTERS`: Extracted from monolithic `INDEX_HTML` into `08_catalog_and_3d_modal_views.js` with contract parity.
- [RESOLVED 2026-10-30] The `bestiary` tab: Surfaced in NAV_GROUPS with 116 fauna count badge.
- [RESOLVED 2026-10-30] `resolve_thumb_file`: Added strict audit mode (`allow_fallback=False` / `?strict=1`) returning true 404 for missing thumbnails.
- Star-Heart Tower (14F) has no overland 3D landmark; adding one to ATLAS_OVERLAND_LANDMARK_ANCHORS breaks the 2D/3D landmark parity gate (landmark_count 13 vs table 14) — needs the 2D renderer to draw it too.
