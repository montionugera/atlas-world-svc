# Ideas (off-goal findings — one line each, never chased inline)

- Two world models need one owner: `content/world` (4 continents, gated) vs `content/studio` (3 continents). (2026-10-24, atlas-world SSOT merge)
- `MAXION_WORLD_TILES` / `MAXION_MONSTERS` are hard-coded in `INDEX_HTML` (`scripts/catalog_explorer_web.py`) and duplicate the contracts. (2026-10-24)
- [RESOLVED 2026-10-30] The `bestiary` tab: Surfaced in NAV_GROUPS with 116 fauna count badge.
- `resolve_thumb_file` never 404s (fuzzy match and hash fallback), so a missing thumbnail is silently masked. (2026-10-24)
- Star-Heart Tower (14F) has no overland 3D landmark; adding one to ATLAS_OVERLAND_LANDMARK_ANCHORS breaks the 2D/3D landmark parity gate (landmark_count 13 vs table 14) — needs the 2D renderer to draw it too.
