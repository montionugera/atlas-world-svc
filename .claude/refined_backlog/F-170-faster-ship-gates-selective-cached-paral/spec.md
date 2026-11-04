---
title: "Faster ship gates: selective, cached, parallel Gate 1 and faster Gate 2"
id: F-170
status: refined
from_idea: I-250
---

# Faster ship gates: selective, cached, parallel Gate 1 and faster Gate 2

## Problem

`psrw ship` runs Gate 1 (`scripts/precheck.sh`) twice: in the feature worktree, then
in `_release` on the merged result. Measured from 10 ship logs (F-164..F-169, 2026-11-01..03):

| Section | Warm | Cold / bad | Share of a typical ship |
|---|---|---|---|
| server-rs (fmt, clippy, test) | 15-19 s | 470-580 s, almost always the `_release` run | ~60% |
| explorer probes (F-156) | ~130 s | 1054 s per run on F-169 (passed) | ~27% |
| everything else | < 2 min total | | ~13% |

A typical ship blocks ~15 min; F-169 blocked 49 min.

Causes:
1. `RUST_RELEVANT_RE` matches all of `content/`, but server-rs `include_str!`s only 16
   content files plus `contracts/content/*`. Content-only features pay ~8 min of Rust.
2. In `_release` the selectors diff against `origin/main` (the whole release) or hit
   `HEAD == base` and fail closed, so the second run never skips anything.
3. `.release.json` has no `gate_cache`, although psrw `lib/gate_cache.py` (opt-in,
   tree-hash keyed, PASS-only) exists. When release has not moved since the feature
   synced, the merged tree equals the feature tree and the second run is a repeat.
4. `ATLAS_MAX_WORKERS=2` on a 14-core / 36 GB Mac; 57 `server-rs/tests/*.rs` files are
   57 separately linked test binaries; `cargo-nextest` is installed but unused.
5. All sections run serially; CPU-bound Rust and IO-bound Chrome probes could overlap.
6. Explorer probes use fixed `sleep()`s and a fresh Chrome per scenario; cost grows with
   every added check.
7. Gate 2 `geometry_lock` recomputes 138 independent pairs single-threaded (~536 s).

## Why now

Every ship pays this; agent lanes sit blocked on it. The `[gate-timing]` baseline exists now.

## Sketch

- Phase 0 — measure: `cargo build --timings` on a cold target, per-scenario probe timers,
  peak RSS at workers 2/4/6.
- Phase 1 — selective + cached: narrow `RUST_RELEVANT_RE` to the real embed set (derived
  from `include_str!`/`include_bytes!` in source, guarded by a test); in `_release`, when
  HEAD is the psrw merge commit (`merge <feature> into release/<v>`), use `HEAD^1` as the
  diff base for all three selectors (rust, storybook smoke, explorer probes); enable
  `gate_cache` in `.release.json`. No psrw engine change.
- Phase 2 — explorer probes: run the two probe scripts concurrently; replace fixed sleeps
  with condition waits; reuse one Chrome per viewport where state allows.
- Phase 3 — parallel groups in precheck.sh: independent groups run concurrently, each
  group's log buffered and printed whole; `GATE_PARALLEL=0` restores serial order.
- Phase 4 — Rust: consolidate integration tests into one binary; run tests with nextest
  when present (fallback cargo test); raise default worker cap to the measured safe value.
- Phase 5 — Gate 2: parallelise `check_geometry_lock.mjs --check` over worker threads.

## Acceptance criteria

- [ ] AC1 A change only under `docs/` or a non-embedded `content/` path SKIPs the server-rs section; a change to any embedded file (e.g. `content/bestiary/bestiary.json`, `contracts/content/items.json`) or `server-rs/**` RUNs it. A test enumerates embed paths from source and fails if the regex misses one.
- [ ] AC2 In `_release` on a psrw merge commit, the three selectors diff against `HEAD^1`; on any other HEAD shape they keep the current fail-closed behaviour. Tested with a throwaway git repo.
- [ ] AC3 `.release.json` enables `gate_cache`; a second precheck on an identical clean tree is a cache HIT (shown in psrw output).
- [ ] AC4 Explorer probes: same assertions (count and names unchanged, none removed or loosened), wall time measured before/after; target <= 60 s locally.
- [ ] AC5 precheck.sh runs independent groups concurrently; any failing group fails the gate with exit 1; summary lists every section; `GATE_PARALLEL=0` gives the old serial run; total wall time measured before/after.
- [ ] AC6 server-rs integration tests compile into one binary (or a measured-justified few); `cargo test` count of passing tests is unchanged; cold `clippy + test` wall time measured before/after.
- [ ] AC7 Worker-cap default changed only with a measured peak-RSS table in research.md.
- [ ] AC8 `check_geometry_lock.mjs --check` produces byte-identical verdicts/output to the serial version, faster wall time measured.
- [ ] AC9 No gate is weakened: no assertion deleted, loosened, or skipped except by the documented change-detection rules, each failing closed.
- [ ] AC10 Full Gate 1 (`PRECHECK_FULL=1`) and Gate 2 pass on the finished branch.
