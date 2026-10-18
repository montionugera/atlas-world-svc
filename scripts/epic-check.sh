#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[epic-check] Verifying E-004 (One Continuous Open World: AOI, Sleeping Regions, World State Store, Restart Persistence, Border Ghosts, Authority Handoff)"
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/Users/pasitnusso/workspace/repos/atlas-world-svc/server-rs/target}"
cargo test --manifest-path server-rs/Cargo.toml \
  --test sleeping_regions_test \
  --test world_state_store_test \
  --test region_restart_persistence_test \
  --test border_ghosts_test \
  --test authority_handoff_test

echo "[epic-check] Verifying E-010 & Autonomous Product Owner Studio Pipeline (World History and Concept -> Continent -> District -> Town or Hunting Area)"

python3 scripts/run_world_pipeline.py --fast --auto-tune

rm -rf tests/__pycache__
git checkout -- scripts/__pycache__/ 2>/dev/null || true

echo "[epic-check] PASS — All E-004, E-010, and Product Owner Self-Evaluation assertions verified."
