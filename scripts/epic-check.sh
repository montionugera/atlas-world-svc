#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[epic-check] Verifying E-010 & Autonomous Product Owner Studio Pipeline (World History and Concept -> Continent -> District -> Town or Hunting Area)"

python3 scripts/run_world_pipeline.py --fast --auto-tune

rm -rf tests/__pycache__
git checkout -- scripts/__pycache__/ 2>/dev/null || true

echo "[epic-check] PASS — All E-010 and Product Owner Self-Evaluation assertions verified."
