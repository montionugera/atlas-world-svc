# Implementation Plan: F-055 (E-001 Slice 1) TypeScript Baseline & Golden Deterministic Trace

**Worktree:** `/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/F-055-1`  
**Branch:** `feat/F-055`  
**Goal:** Establish an authoritative 1,000-tick deterministic simulation trace (`golden_sim_trace_1000.json`) driven by `SimClock` and seeded PRNG as the immutable behavioral test oracle for the Rust `server-rs` port.

---

## Task 1: Seeded PRNG and Deterministic Simulation Harness
- **File:** `colyseus-server/src/tests/harness/DeterministicSimHarness.ts`
- **Action:**
  - Implemented Mulberry32 PRNG with fixed seed `0x1337C0DE`.
  - Built test environment with `SimClock` (fixed 50 ms step per tick).
  - Mocked `Date.now()` and `performance.now()` clamped to `SimClock` so all AI and combat sub-systems execute with 100% determinism.
  - Setup 10 synthetic player bots and 50 mobs at deterministic spawn positions.
  - Steered bots deterministically with margin avoidance.
- **Verify:** ✅ Passes 1,000 ticks without NaN or unhandled errors.

## Task 2: Golden Simulation Trace Generator & JSON Fixture
- **File:** `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json` & generator script
- **Action:**
  - Captured tick-level state snapshots at tick intervals (0, 100, 200, ..., 1000) and consecutive ticks (990–1000).
  - For each recorded entity, recorded `id`, `type`, `x`, `y`, `vx`, `vy`, `health`, `isAlive`, `behavior`, `targetId`.
  - Saved to `colyseus-server/src/tests/fixtures/golden_sim_trace_1000.json` (176.4 KB, 21 snapshots).
- **Verify:** ✅ Fixture generated and verified with 1,000 ticks of simulation data.

## Task 3: Deterministic Parity Regression Suite
- **File:** `colyseus-server/src/tests/sim-trace-determinism.test.ts`
- **Action:**
  - Authored Jest test that re-executes the harness from seed `0x1337C0DE`.
  - Asserts that every recorded tick in `golden_sim_trace_1000.json` matches the freshly simulated state with zero divergence.
- **Verify:** ✅ `PASS src/tests/sim-trace-determinism.test.ts` (100% pass across all 21 snapshots, exact bit-level parity).

## Task 4: Full Quality Gate Verification & Documentation
- **Action:** Updated `README.md` with testing quality gates and deterministic simulation oracle details. Ran `./scripts/precheck.sh --no-install`.
- **Verify:** ✅ GATE 1 PASS — all contracts, tests, linter, formatting, and content gates clean.
