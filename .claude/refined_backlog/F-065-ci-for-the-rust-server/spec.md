---
title: "CI for the Rust server"
id: F-065
status: refined
from_idea: I-163
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
- **The compiler version is not pinned.** There is no `rust-toolchain.toml`. The developer machine has Rust 1.95.0; `server-rs/Dockerfile:2` builds on 1.85. Clippy's lint set changes between versions, so an unpinned CI would drift.

## Goal

Every pull request gets a `server-rs` check that fails when formatting, lints or tests fail, and the `CI` check goes green again with no reference to the deleted server. Slices merge locally into `release/1.12`, so verifying the workflow needs a pull request from the feature branch into `release/1.12`, which requires pushing both branches to GitHub; pushing needs the owner's approval.

## Design

### 1. Audit un-skipped content gates

Run each un-skipped gate locally and record in this spec which are red. Red gates found are filed as separate ideas, not fixed here.

### 2. New workflow `.github/workflows/server-rs.yml`

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
- **No `flatc` step.** FlatBuffers generated code is committed at `server-rs/src/protocol/generated/game_protocol_generated.rs` and included by `server-rs/src/protocol/mod.rs:2`; there is no `build.rs`.
- **No services.** Integration tests bind `127.0.0.1:0` and read repository fixtures; `nakama_persistence.rs` needs no running Nakama.

### 3. New file `server-rs/rust-toolchain.toml`

```toml
[toolchain]
channel = "1.95.0"
components = ["rustfmt", "clippy"]
profile = "minimal"
```

This is the single place the version lives, so a developer's `cargo` and CI use the same compiler. The Dockerfile copies named paths only, so the image build is unaffected.

### 4. Remove the deleted server from the workflows

- **`ci.yml`:** rename job id to `content-gates` and name to `content and tooling gates`. Delete the three no-op steps (`:66-73`) and the failing codegen step (`:81-85` which ran `gen-asset-keys.sh` and `gen-mob-types.sh`). The asset manifest gate still works because it reads committed `content/generated/asset-keys.json` (`scripts/check_asset_manifest.mjs:106`), and `scripts/check_content.mjs:142` reads committed `content/generated/mob-types.json`, so removing the step that runs `gen-mob-types.sh` is safe. Reword comments at `:75-80` and `:36` (the comment at `:36` must lose the word "colyseus" for the grep criterion to pass). Keep every other step.
- **`contracts.yml`:** delete four dead path filters (`:9-12`) and no-op step (`:54`).
- Tests that read `ci.yml` as text (`scripts/tests/node-pin.test.mjs`, `geometry-lock.test.mjs`, `classify-test-run.test.mjs`) match on step content, not job id. Re-run after editing.

## Acceptance criteria

- [ ] `.github/workflows/server-rs.yml` exists, triggers on `pull_request` with no `paths:` filter, and runs `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` and `cargo test --locked` in `server-rs`.
- [ ] `grep -rn colyseus .github/workflows` prints nothing and exits 1 (today it prints 13 lines).
- [ ] On a pull request from the feature branch into `release/1.12`, the new `server-rs` check is green, and the `CI` workflow no longer fails at the deleted codegen step (needs GitHub; not checkable locally).
- [ ] A throwaway pull request that breaks one `server-rs` test makes the `server-rs` check conclude `failure`; the pull request is closed without merging and its run URL is recorded in the ship notes (needs GitHub; not checkable locally).
- [ ] In `server-rs`, `cargo clippy --locked --all-targets -- -D warnings` exits 0 (already green; guarded from now on).
- [ ] `server-rs/rust-toolchain.toml` pins an exact version, and `server-rs.yml` contains no Rust version number of its own.
- [ ] A second run of the `server-rs` workflow on the same branch logs a cache restore in the `Swatinem/rust-cache` step (needs GitHub; not checkable locally).

## Out of scope / follow-up

- **The client test suite is not in CI.** No workflow mentions `client/react-client`; it runs only locally (`scripts/precheck.sh:135`). File as a separate idea.
- **Branch protection.** `main` is unprotected; making `server-rs` a required check is an owner decision.
- Red gates found in the un-skipped CI steps are filed as separate ideas, not fixed here.
- `.husky/pre-commit:4` still runs `cd colyseus-server && npx lint-staged`, and `docker-compose.yml:2-6` still builds the deleted server.
- Nothing regenerates `content/generated/asset-keys.json` now that its generator is gone; the gate checks a frozen snapshot.
- No check that the committed FlatBuffers code matches `schemas/game_protocol.fbs`.
- `server-rs/tests/trace_replay.rs:10-11` still lists two `colyseus-server` fixture paths; `.release.json` and `scripts/tests/node-pin.test.mjs` still describe `colyseus-server/Dockerfile`.
- Aligning `server-rs/Dockerfile` (Rust 1.85) with pinned 1.95.0, and adding `--locked` to `scripts/precheck.sh:112`.

## Risks

- **Removing the failing step un-skips about 20 gates that have not run in CI since the server was deleted.** Any of them may now be red for its own reason. Running them locally first isolates which need separate idea filing.
- **Slow first build.** `server-rs/Cargo.toml` sets the dev profile to `opt-level = 1`, with 3 for dependencies only, and Bevy plus Rapier are large. A cold run may take 10 to 20 minutes; if it nears the 30-minute limit, raise the limit before touching the profile.
- **`rustup toolchain install` with no argument needs rustup 1.28 or newer** on the runner. If older, use `rustup show`, which installs the pinned toolchain on older versions.
- **A test writes into the tree.** `server-rs/tests/protocol_roundtrip.rs:79-82` rewrites tracked file `contracts/src/protocol/fixtures/snapshot_test.bin`. Harmless in CI, but not checked for drift.
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

# 4. on the pull request: server-rs green and CI past deleted codegen step (needs owner push approval)
gh pr checks <pr-number>

# 5. red proof: break one assertion on a throwaway branch, open a PR, expect failure
gh pr checks <throwaway-pr-number>      # server-rs must show "fail"
gh pr close <throwaway-pr-number> --delete-branch

# 6. cache: re-run and read the cache step
gh run rerun <run-id> && gh run view <run-id> --log | grep -i "cache restored"
```
