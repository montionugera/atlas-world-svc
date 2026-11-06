---
title: "Gate 1 cleanup gaps: serial-mode stop handler, AC4 test stray sleeps, process-group kill for re-parented children"
id: I-253
status: idea
---

# Gate 1 cleanup gaps: serial-mode stop handler, AC4 test stray sleeps, process-group kill for re-parented children

## Problem

Three LOW findings from the F-171 review (`docs/superpowers/ideas.md`), all in Gate 1 (`scripts/precheck.sh`) cleanup:

1. **Serial mode has no stop handler.** The serial plan (`GATE_PARALLEL=0` or the memory guard falling back) runs
   sections in the foreground of the gate shell with no INT/TERM trap, so a TERM never calls `kill_tree` and a
   running section (cargo, node --test, browsers) keeps running after the gate dies.
2. **AC4 test leaks on failure.** `precheck-parallel.test.mjs` AC4 starts two `sleep 300`s; if its assertion fails
   nothing kills them.
3. **Re-parented children escape `kill_tree`.** If a mid-tree process exits before `stop_walk` reaches it, its
   children are re-parented to launchd/init and `pgrep -P` no longer finds them.

## Sketch

1. Run the serial plan through the existing background runner as one group named `serial` (same trap,
   `kill_tree`, result files, fail-closed completeness), instead of a foreground loop.
2. AC4's bash script kills its own `sleep`s in an EXIT trap.
3. Launch each group with job control on (`set -m` around the `&`) so each group subshell leads its own process
   group; `kill_tree` freezes a leader's whole process group (`kill -STOP -- -pgid`) before walking, and TERMs/KILLs
   the group as well as the walked list. Only pids that lead their own group are group-killed (never the gate's pgid).

## Acceptance criteria

- [ ] AC1 — Serial mode (`ATLAS_PARALLEL_FREE_GB_OVERRIDE=1`): TERM to the gate while a section has a child leaves no descendant alive (same shape as the parallel H2 test), and the capped forker (AC3 shape) leaves none alive.
- [ ] AC2 — Serial mode still runs every section in SERIAL_PLAN order, records one result each, and a crashing section yields FAIL for it and its unrun followers (fail-closed, like L7).
- [ ] AC3 — A section that starts a child which immediately orphans a grandchild (`sh -c 'sleep 300 & echo $! > pidfile'` then exits): TERM to the gate kills the orphaned grandchild, in both parallel and serial mode. The test is red on the current code.
- [ ] AC4 — `kill_tree` never signals the gate's own process group: a test runs kill_tree on a non-leader pid and the caller survives.
- [ ] AC5 — The AC4 test of `precheck-parallel.test.mjs` leaves no `sleep` process when its assertion fails (EXIT trap in its script).
- [ ] AC6 — `node --test 'scripts/tests/*.test.mjs'` green; a real `./scripts/precheck.sh --no-install` ends `GATE 1 PASS` in both parallel and `GATE_PARALLEL=0` modes.

## Out of scope

psrw engine; the memory floor (F-171).
