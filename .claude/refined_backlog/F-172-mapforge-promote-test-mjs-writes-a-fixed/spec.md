---
title: "mapforge promote.test.mjs writes a fixed tmpdir filename (outside-the-draft.json) and flakes when two runs overlap"
id: F-172
status: refined
from_idea: I-252
---

# mapforge promote.test.mjs writes a fixed tmpdir filename (outside-the-draft.json) and flakes when two runs overlap

## Problem

`atelier/mapforge/tests/promote.test.mjs:692` ("a manifest key that escapes the run dir is REFUSED") writes
`join(run, "..", "outside-the-draft.json")`. `run` comes from `copyRun()` = `mkdtemp($TMPDIR/mf-runcopy-)`, so `..`
is the shared `$TMPDIR` and the filename is fixed: two overlapping test runs (parallel Gate 1, two sessions)
write, hash and delete the same file, and one sees the other's bytes or a missing file. The file is also only
removed on the pass path, so a failing run leaves it behind.

## Sketch

Name the outside file after the run dir (`outside-the-draft-<basename(run)>.json`) so it is unique per run but
still outside it, and remove it in `t.after` so it goes on failure too.

## Acceptance criteria

- [x] AC1 — The test's outside file path contains the run dir's unique basename; no fixed `outside-the-draft.json` is written to `$TMPDIR`.
- [x] AC2 — The file is removed even when the test's assertion fails (cleanup registered via `t.after`, not after the assertion).
- [x] AC3 — The test still proves the refusal: with the "resolves OUTSIDE the run dir" check removed from promote, the test goes red.
- [x] AC4 — Two concurrent runs of `node --test atelier/mapforge/tests/promote.test.mjs` both pass, and the mapforge suite is green.
