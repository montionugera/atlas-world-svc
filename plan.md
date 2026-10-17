# Implementation Plan: F-064 (E-002 Slice 5) Complete colyseus-server Decommissioning & Pure Rust Cutover

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-064-complete-colyseus-server-decommissioning`  
**Branch:** `feat/F-064`  
**Epic:** `E-002` (Complete game logic parity and full colyseus-server decommissioning)  
**Goal:** Physically delete `colyseus-server`, relocate generated content artifacts, remove `colyseus-server` from `pnpm-workspace.yaml`, update `scripts/precheck.sh` and `scripts/integration.sh` to cement `server-rs` as the sole authoritative server, and verify Gate 1 and Gate 2 pass 100% cleanly on Rust.

---

## Task 1: Preserve Shared Content Artifacts & Update Tooling Paths
- Move/copy `colyseus-server/generated/` artifacts (`asset-keys.json`, `mob-types.json`, `spawn-areas.json`) to `content/generated/`.
- Update references in `scripts/`:
  - `scripts/check_content.mjs`
  - `scripts/check_asset_manifest.mjs`
  - `scripts/lib/season1.mjs`
  - `scripts/lib/spawn-pairing.mjs`
  - `scripts/lib/bestiary-sheet.mjs`
  - `scripts/check_spine_emit.mjs`
  - `scripts/tests/node-pin.test.mjs`
  - `scripts/tests/spine-gates.test.mjs`
  - `scripts/tests/town-millcross.test.mjs`
  - `scripts/tests/season1.test.mjs`
  - `scripts/tests/spine.test.mjs`
  - `scripts/gen_combat_model.mjs`
  - `scripts/deploy-local.sh`
- Verify that `node --test scripts/tests/*.test.mjs` and content validation passes.

---

## Task 2: Physical Removal of colyseus-server & Manifest Cleanup
- Execute `git rm -rf colyseus-server`.
- Update `pnpm-workspace.yaml` to remove `colyseus-server`.
- Update root `package.json` to remove any legacy `colyseus-server` script entries.
- Run `pnpm install` to update workspace lockfile without `colyseus-server`.

---

## Task 3: Update Gate 1 (precheck.sh) & Gate 2 (integration.sh)
- In `scripts/precheck.sh`:
  - Remove legacy server suites (`server_typecheck`, `server_tests`, `server_coverage`, `server_e2e`, `server_format`).
  - Keep and enhance `server-rs: cargo clippy & test` (including formatting and check).
- In `scripts/integration.sh`:
  - Replace `server_build`, `server_tests`, `server_format` with `server-rs: cargo build --release` and `cargo test --release`.
- Update `scripts/deploy-local.sh`:
  - Build and deploy `server-rs/Dockerfile` as the authoritative game server.

---

## Task 4: Gate 1 and Gate 2 Verification
- Run `./scripts/precheck.sh --no-install`.
- Run `./scripts/integration.sh --no-install`.
- Ensure 100% of suites pass cleanly with zero legacy code remaining.

---

## Task 5: Commit, Ship & Promote Release 1.11
- Commit all changes to `feat/F-064`.
- Ship to `release/1.11` via `psrw ship --no-deploy`.
- Run `psrw promote` to promote Release 1.11 to `main`.
