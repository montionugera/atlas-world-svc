#!/usr/bin/env python3
"""Lint rule enforcing modular file-size budgets for the Atlas World Studio Web Observatory.

Prevents `scripts/catalog_explorer_web.py` or any modular slice under
`scripts/atlas_world_web/` from growing back into a monolithic 30,000-line file.

Usage:
  python3 scripts/lint_file_size.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# Maximum allowed lines per file in the Studio Web Observatory
MAX_ENTRY_PYTHON_LINES = 2500
MAX_MODULAR_SLICE_LINES = 5000

REQUIRED_FRONTEND_MODULES: tuple[str, ...] = (
    "01_shell_and_styles.html",
    "02_state_and_composable_layers.js",
    "03_engines_ol_and_3d.js",
    "04_studio_overlay_bars_a.js",
    "05_studio_overlay_bars_b.js",
    "06_world_and_submap_atlas.js",
    "07_studio_perspectives_views.js",
    "08_catalog_and_3d_modal_views.js",
)


def check_file_size_budgets(repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    """Check all Studio Web files against modular line-count ceilings."""
    violations: list[str] = []
    checked_files: list[dict[str, Any]] = []

    # 1. Entry script budget (must stay modular, never re-inline 30k lines)
    entry_py = repo_root / "scripts" / "catalog_explorer_web.py"
    if not entry_py.is_file():
        violations.append("Missing entry script: scripts/catalog_explorer_web.py")
    else:
        line_count = len(entry_py.read_text(encoding="utf-8").splitlines())
        checked_files.append(
            {
                "file": "scripts/catalog_explorer_web.py",
                "lines": line_count,
                "max_lines": MAX_ENTRY_PYTHON_LINES,
                "ok": line_count <= MAX_ENTRY_PYTHON_LINES,
            }
        )
        if line_count > MAX_ENTRY_PYTHON_LINES:
            violations.append(
                f"scripts/catalog_explorer_web.py has {line_count} lines "
                f"(exceeds max budget of {MAX_ENTRY_PYTHON_LINES} lines; keep frontend code in scripts/atlas_world_web/frontend/)"
            )

    # 2. All Python & Frontend modules under scripts/atlas_world_web/
    web_pkg_dir = repo_root / "scripts" / "atlas_world_web"
    frontend_dir = web_pkg_dir / "frontend"
    for req_mod in REQUIRED_FRONTEND_MODULES:
        mod_path = frontend_dir / req_mod
        if not mod_path.is_file():
            violations.append(f"Missing required modular frontend file: scripts/atlas_world_web/frontend/{req_mod}")

    if web_pkg_dir.is_dir():
        for path in sorted(web_pkg_dir.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix not in {".py", ".js", ".html", ".css"}:
                continue
            rel = path.relative_to(repo_root).as_posix()
            line_count = len(path.read_text(encoding="utf-8").splitlines())
            checked_files.append(
                {
                    "file": rel,
                    "lines": line_count,
                    "max_lines": MAX_MODULAR_SLICE_LINES,
                    "ok": 0 < line_count <= MAX_MODULAR_SLICE_LINES,
                }
            )
            if line_count == 0:
                violations.append(f"{rel} is empty (0 lines)")
            elif line_count > MAX_MODULAR_SLICE_LINES:
                violations.append(
                    f"{rel} has {line_count} lines "
                    f"(exceeds max modular file budget of {MAX_MODULAR_SLICE_LINES} lines; split into smaller modules)"
                )

    return {
        "ok": len(violations) == 0,
        "max_entry_python_lines": MAX_ENTRY_PYTHON_LINES,
        "max_modular_slice_lines": MAX_MODULAR_SLICE_LINES,
        "checked_count": len(checked_files),
        "checked_files": checked_files,
        "violations": violations,
    }


def main() -> int:
    report = check_file_size_budgets()
    print(json.dumps(report, indent=2))
    if not report["ok"]:
        for v in report["violations"]:
            print(f"❌ FILE SIZE LINT VIOLATION: {v}", file=sys.stderr)
        return 1
    print(
        f"✅ File-size lint passed ({report['checked_count']} modular files checked; "
        f"entry <= {MAX_ENTRY_PYTHON_LINES} lines, slices <= {MAX_MODULAR_SLICE_LINES} lines)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
