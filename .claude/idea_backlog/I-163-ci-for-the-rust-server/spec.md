---
title: "CI for the Rust server"
id: I-163
status: idea
---

# CI for the Rust server

Slice 1 of epic E-006 ("Safe to open to outside players"); no dependency, goes first. "CI" means GitHub Actions, the checks that run on every pull request. Evidence read on `release/1.12` at `fac2acf9`, 2026-10-11.

## Problem

Nothing in CI compiles, lints or tests the Rust game server (`server-rs`), and the main CI workflow is red on every run.

- **No workflow runs `cargo`.** The three workflows are `ci.yml`, `contracts.yml` and `nakama.yml`; none mentions `cargo` or `server-rs`.
- **The only job in `ci.yml` is named for a deleted server.** `.github/workflows/ci.yml:14-15` declares job `colyseus-server`. The `colyseus-server/` directory no longer exists (`git ls-files colyseus-server` returns 0 files).
- **Three steps pass while checking nothing.** `ci.yml:67`, `:70` and `:73` run `pnpm --filter atlas-world-colyseus-server ...`. No such package exists, so pnpm prints "No projects matched the filters" and exits 0 (seen in the log of run 37867885573).
- **One step fails, so every later gate is skipped.** `ci.yml:83-84` runs `bash colyseus-server/scripts/codegen/gen-asset-keys.sh`, a file that is gone. The last four `CI` runs on `main` (2026-10-08 and 2026-10-09) all concluded `failure` at this step. About 20 content and map gates after it (`ci.yml:87-316`) have therefore not run in CI since.
- **`contracts.yml` has the same dead references.** Four path filters at `contracts.yml:9-12` point into `colyseus-server/`, and `contracts.yml:54` is another silent no-op filter step.
- **The Rust checks exist only on a developer's machine.** `scripts/precheck.sh:112` runs `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`. A pull request that skips the local script meets no Rust check at all.
- **Clippy (the Rust linter) is reported not clean.** Two `too_many_arguments` warnings are reported at `server-rs/src/net/ws.rs:251` (`accept_loop`, 8 parameters) and `server-rs/src/systems/live.rs:168` (`live_bot_ai_system`, 8 parameters). With `-D warnings` these are errors, so the local script would also fail.
- **The compiler version is not pinned.** There is no `rust-toolchain.toml`. The developer machine has Rust 1.95.0; `server-rs/Dockerfile:2` builds on 1.85. Clippy's lint set changes between versions, so an unpinned CI would drift.

## Goal

Every pull request gets a `server-rs` check that fails when formatting, lints or tests fail, and the `CI` check goes green again with no reference to the deleted server.

## Design

### 1. New workflow `.github/workflows/server-rs.yml`

- **Triggers:** `pull_request` with no `paths:` filter (so the check always reports, and can later be made a required check), plus `push` to `main`.
- **Concurrency:** group `server-rs-${{ github.ref }}`, `cancel-in-progress: true`, matching the other workflows.
- **One job**, id `server-rs`, name `server-rs (fmt · clippy · test)`, `runs-on: ubuntu-latest`, `timeout-minutes: 30`, `defaults.run.working-directory: server-rs`.
- **Steps, in order:**
  1. `actions/checkout@v4` without Git LFS (large-file storage). No file under `server-rs/` or `contracts/src/protocol/fixtures/` matches an LFS pattern in `.gitattributes`.
  2. `rustup toolchain install` — installs the version named in `server-rs/rust-toolchain.toml`.
  3. `Swatinem/rust-cache@v2` with `workspaces: server-rs`. It keys the cache on the compiler version and `Cargo.lock`.
  4. `cargo fmt --check`
  5. `cargo clippy --locked --all-targets -- -D warnings`
  6. `cargo test --locked`
- `--locked` makes the run fail if `Cargo.lock` is out of date instead of silently resolving new versions.
- **No `flatc` step.** `flatc` is the FlatBuffers schema compiler. The generated code is committed at `server-rs/src/protocol/generated/game_protocol_generated.rs` and included by `server-rs/src/protocol/mod.rs:2`; there is no `build.rs`. The build needs no code generation.
- **No services.** The integration tests bind `127.0.0.1:0` and read fixtures inside the repository; `nakama_persistence.rs` needs no running Nakama.

### 2. New file `server-rs/rust-toolchain.toml`

```toml
[toolchain]
channel = "1.95.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

This is the single place the version lives, so a developer's `cargo` and CI use the same compiler. The Dockerfile copies named paths only, so the image build is unaffected.

### 3. Make clippy clean, and deny warnings

CI denies warnings, the same bar `scripts/precheck.sh:112` already sets. Add `#[allow(clippy::too_many_arguments)]` above the two functions. This is the convention the code already uses (`server-rs/src/spatial/grid.rs:81`, `net/ws.rs:339`, `protocol/mod.rs:261`). `live_bot_ai_system` is an ECS (entity-component-system) function whose parameters are the resources it reads, and bundling `accept_loop`'s arguments into a struct is a refactor that later slices of this epic will touch anyway.

### 4. Remove the deleted server from the workflows

- **`ci.yml`:** rename the job id to `content-gates` and its name to `content and tooling gates`. Delete the three no-op steps (`:66-73`) and the failing codegen step (`:81-84`). Reword the comments at `:36` and `:75-80`. Keep every other step. The asset manifest gate still works because it reads the committed `content/generated/asset-keys.json` (`scripts/check_asset_manifest.mjs:106`).
- **`contracts.yml`:** delete the four dead path filters (`:9-12`) and the no-op step (`:54`).
- The tests that read `ci.yml` as text (`scripts/tests/node-pin.test.mjs`, `geometry-lock.test.mjs`, `classify-test-run.test.mjs`) match on step content, not on the job id. Re-run them after the edit.

## Acceptance criteria

- [ ] `.github/workflows/server-rs.yml` exists, triggers on `pull_request` with no `paths:` filter, and runs `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` and `cargo test --locked` in `server-rs`.
- [ ] `grep -rn colyseus .github/workflows` prints nothing and exits 1 (today it prints 13 lines).
- [ ] On this slice's pull request, the `server-rs` check and the `CI` check both conclude `success` (today `server-rs` does not exist and `CI` concludes `failure`).
- [ ] A throwaway pull request that breaks one `server-rs` test makes the `server-rs` check conclude `failure`; the pull request is closed without merging and its run URL is recorded in the ship notes.
- [ ] In `server-rs`, `cargo clippy --locked --all-targets -- -D warnings` exits 0 (reported to fail today on the two `too_many_arguments` warnings).
- [ ] `server-rs/rust-toolchain.toml` pins an exact version, and `server-rs.yml` contains no Rust version number of its own.
- [ ] A second run of the `server-rs` workflow on the same branch logs a cache restore in the `Swatinem/rust-cache` step.

## Out of scope / follow-up

- **The client test suite is not in CI.** No workflow mentions `client/react-client`; it runs only locally (`scripts/precheck.sh:135`). File as a separate idea.
- **Branch protection.** `main` is unprotected (the GitHub API answers "Branch not protected"), so a red check warns but does not block a merge. Making `server-rs` a required check is an owner decision.
- `.husky/pre-commit:4` still runs `cd colyseus-server && npx lint-staged`, and `docker-compose.yml:2-6` still builds the deleted server.
- Nothing regenerates `content/generated/asset-keys.json` now that its generator is gone; the gate checks a frozen snapshot.
- No check that the committed FlatBuffers code matches `schemas/game_protocol.fbs`.
- `server-rs/tests/trace_replay.rs:10-11` still lists two `colyseus-server` fixture paths (one absolute, on a developer machine); `.release.json` and `scripts/tests/node-pin.test.mjs` still describe `colyseus-server/Dockerfile`.
- Aligning `server-rs/Dockerfile` (Rust 1.85) with the pinned 1.95.0, and adding `--locked` to `scripts/precheck.sh:112`.

## Risks

- **Removing the failing step un-skips about 20 gates that have not run in CI since the server was deleted.** Any of them may now be red for its own reason. Run them locally first; a gate that fails for a reason unrelated to this slice is reported and filed, not fixed here.
- **Slow first build.** `server-rs/Cargo.toml` sets `opt-level = 3` for dependencies in the dev profile, and Bevy plus Rapier are large. A cold run may take 10 to 20 minutes. If it nears the 30-minute limit, raise the limit before touching the profile.
- **`rustup toolchain install` with no argument needs rustup 1.28 or newer** on the runner. If the runner's rustup is older, use `rustup show`, which installs the pinned toolchain on older versions.
- **A test writes into the tree.** `server-rs/tests/protocol_roundtrip.rs:79-82` rewrites the tracked file `contracts/src/protocol/fixtures/snapshot_test.bin`. Harmless in CI, but it is not checked for drift.
- **The `rust-toolchain.toml` file makes every developer's `cargo` download 1.95.0** on first use inside `server-rs`.

## How to verify

```bash
# 1. local: the same three commands CI runs
cd server-rs && cargo fmt --check \
  && cargo clippy --locked --all-targets -- -D warnings \
  && cargo test --locked; echo "exit=$?"

# 2. no reference to the deleted server (expect no output, exit 1)
grep -rn colyseus .github/workflows; echo "exit=$?"

# 3. tests that read ci.yml still pass
node --test scripts/tests/node-pin.test.mjs scripts/tests/geometry-lock.test.mjs \
  scripts/tests/classify-test-run.test.mjs

# 4. on the pull request: both checks green
gh pr checks <pr-number>

# 5. red proof: break one assertion on a throwaway branch, open a PR, expect failure
gh pr checks <throwaway-pr-number>      # server-rs must show "fail"
gh pr close <throwaway-pr-number> --delete-branch

# 6. cache: re-run and read the cache step
gh run rerun <run-id> && gh run view <run-id> --log | grep -i "cache restored"
```
