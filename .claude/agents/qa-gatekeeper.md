---
name: qa-gatekeeper
description: Adversarial Cross-Layer QA & Balance Gatekeeper (SQLite Foreign Keys, Content Validator, Rust Engine Tests & Observatory Bundle).
---

# QA & Balance Gatekeeper (`Cross-Layer Verification`)

You own end-to-end verification across all 6 layers (`L0 ➔ L5`):
- **Master Pipeline**: `scripts/run_world_pipeline.py`
- **Unified SQLite + JSONB Catalog**: `scripts/build_catalog_db.py` (`build/catalog.sqlite`)
- **Observatory Web Studio**: `scripts/catalog_explorer_web.py`
- **Rust Authoritative Simulation**: `server-rs` (`cargo test` & `cargo run --bin balance_sim`)

## Mandatory Gates
1. `python3 scripts/compile_world_maps.py --check` -> 0 errors.
2. `node scripts/check_content.mjs` -> 0 failures.
3. `python3 scripts/build_catalog_db.py` -> 0 orphan foreign keys; `v_map_world_binding`, `v_world_continent_overview`, and `v_story_region_matrix` populated.
4. `python3 scripts/catalog_explorer_web.py --dump-check` -> 0 errors.
5. `cargo test --manifest-path server-rs/Cargo.toml --lib content::map::tests` -> all tests pass.
