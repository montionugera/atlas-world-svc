---
title: "Gate 1 parallel follow-ups from F-170 review: test-seam guard, kill_tree STOP-walk race, swap-aware memory guard (6 GB floor kept every real run serial)"
id: F-171
status: refined
from_idea: I-251
---

# Gate 1 parallel follow-ups from F-170 review

## Problem

F-170 (faster ship gates, promoted in 1.21) made Gate 1 (`scripts/precheck.sh`) run its sections in
parallel groups. Three gaps in that runner were left open:

1. **Test seam can pass a real ship.** `ATLAS_PRECHECK_TEST_MODE=1` + `ATLAS_PRECHECK_TEST_PLAN=<file>`
   swaps the real plan for stub sections and skips install/contracts. psrw decides Gate 1 by **exit
   code only** (`ship_current_work_to_release.py:74`) and the gate cache records that result. If both
   variables leak into a ship's environment, stubs exit 0 and the feature ships, with
   `RESULT: GATE 1 PASS` printed, having run no real section.
2. **`kill_tree` race.** `kill_tree` snapshots the descendant tree with `pgrep -P`, then sends TERM.
   A process that forks after its parent was listed but before TERM lands is never in the snapshot
   and survives (orphaned to launchd, still holding CPU/RAM or ports).
3. **Memory guard never lets parallel run.** `parallel_memory_ok` requires
   `free+inactive+speculative >= ATLAS_PARALLEL_MIN_FREE_GB` (default 6, a guess). Every real gate
   read 4.1-5.2 GB on this 36 GB Mac, so every real run fell back to serial and the parallel path
   has never run in a real gate. The floor was never measured against what a parallel run uses.

## Sketch

1. Test mode never exits 0: a fully passing test-mode run prints
   `RESULT: TEST MODE PASS — not a Gate 1 result` and exits **3**. It never prints `GATE 1 PASS`.
   Failures still exit 1.
2. `kill_tree` freezes before it lists: walk top-down, `kill -STOP` each pid before reading its
   children, so a listed pid cannot fork; then TERM + CONT everything, wait 1 s, KILL the rest.
3. Memory guard calibrated from a measured parallel run (research.md); floor = measured extra
   footprint of parallel over serial + margin, default replaced by that number.

## Acceptance criteria

- [x] AC1 — With `ATLAS_PRECHECK_TEST_MODE=1` and a valid plan whose sections all pass, precheck exits
      3 (not 0) and stdout does not contain `GATE 1 PASS`; it contains `TEST MODE PASS`.
- [x] AC2 — Same with a failing section: exit 1, no `GATE 1 PASS`.
- [x] AC3 — A section that spawns a new background child every ~20 ms in a loop, then gets TERM sent to
      the gate: within 3 s every pid that section ever wrote to its pidfile is dead (test
      fails on the current snapshot-then-TERM `kill_tree` in at least 1 of 5 runs, or a mutation
      proves it: removing the STOP step turns the test red).
- [x] AC4 — `kill_tree` still returns 0 and leaves no process stopped (no `T` state survivor) when a
      pid in the tree has already exited.
- [x] AC5 — research.md records a measured parallel Gate 1 run on this machine: peak summed RSS, min available GB, swap used, wall time vs the serial sum (DONE 2026-11-05).
- [x] AC6 — The default `ATLAS_PARALLEL_MIN_FREE_GB` becomes 3 (1.5 x the 2.0 GB measured drop in research.md; formula in a comment next to the default), and a real `./scripts/precheck.sh` run with ~4-5 GB available takes the parallel path (`group … started` in the log) and ends `GATE 1 PASS`.

- [x] AC7 — Existing `scripts/tests/precheck-parallel.test.mjs` cases still pass (updated for exit 3),
      and `node --test scripts/tests/*.test.mjs` is green.

## Out of scope

Changing psrw itself; nextest; `ATLAS_CARGO_JOBS` (stays 2).
