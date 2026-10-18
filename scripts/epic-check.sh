#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[epic-check] Verifying E-010: Systematic Top-Down World and Map Studio (World History and Concept -> Continent -> District -> Town or Hunting Area)"

python3 scripts/validate_studio_hierarchy.py --check
python3 scripts/compile_world_maps.py --check
python3 scripts/catalog_explorer_web.py --dump-check
python3 -m unittest tests/test_validate_studio_hierarchy.py
python3 -m unittest tests/test_studio_web_perspectives.py

rm -rf tests/__pycache__
git checkout -- scripts/__pycache__/ 2>/dev/null || true

echo "[epic-check] PASS — All E-010 assertions verified."
