# Ideas (off-goal findings — one line each, never chased inline)

- Two world models need one owner: `content/world` (4 continents, gated) vs `content/studio` (3 continents). (2026-10-24, atlas-world SSOT merge)
- `MAXION_WORLD_TILES` / `MAXION_MONSTERS` are hard-coded in `INDEX_HTML` (`scripts/catalog_explorer_web.py`) and duplicate the contracts. (2026-10-24)
- The hidden `bestiary` tab: decide whether to surface, fold into another panel, or delete it. (2026-10-24)
- `resolve_thumb_file` never 404s (fuzzy match and hash fallback), so a missing thumbnail is silently masked. (2026-10-24)
