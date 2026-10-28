"""Modular frontend loader for the Atlas World Studio Web Observatory.

Assembles `INDEX_HTML` from modular HTML/CSS/JS slices under
`scripts/atlas_world_web/frontend/` so no single file exceeds the modular
file-size lint budget.
"""
from __future__ import annotations

from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"

FRONTEND_MODULE_FILES: tuple[str, ...] = (
    "01_shell_and_styles.html",
    "02_state_and_composable_layers.js",
    "02b_cartography_pipeline.js",
    "03_engines_ol_and_3d.js",
    "04_studio_overlay_bars_a.js",
    "05_studio_overlay_bars_b.js",
    "06_world_and_submap_atlas.js",
    "07_studio_perspectives_views.js",
    "08_catalog_and_3d_modal_views.js",
)


def load_modular_index_html() -> str:
    """Concatenate the modular frontend slices in canonical order."""
    parts: list[str] = []
    seen: set[str] = set()
    for rel_name in FRONTEND_MODULE_FILES:
        part_path = FRONTEND_DIR / rel_name
        if part_path.is_file():
            parts.append(part_path.read_text(encoding="utf-8"))
            seen.add(rel_name)
    for extra_path in sorted(FRONTEND_DIR.glob("[0-9][0-9]*")):
        if extra_path.is_file() and extra_path.name not in seen:
            parts.append(extra_path.read_text(encoding="utf-8"))
    return "".join(parts)
