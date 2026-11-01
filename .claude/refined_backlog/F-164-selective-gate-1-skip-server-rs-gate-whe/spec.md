---
title: "Selective Gate 1: skip server-rs gate when no rust-relevant path changed"
id: F-164
status: refined
from_idea: I-243
---

# Selective Gate 1: skip server-rs gate when no rust-relevant path changed

## Problem

`scripts/precheck.sh` (Gate 1) ran `cargo fmt/clippy/test` on server-rs for every ship, even docs/wiki-only changes. That compile is the heaviest section and caused Mac memory pressure and lag (2026-11-01).

## Why now

Owner decision (2026-11-01): verification must be selective by what changed; full gates stay for merges, wave integration and shipping.

## Sketch

Already implemented as commit 04da6babf on `hotfix/precheck-selective`: `rust_relevant_change()` diffs against merge-base(origin/main) plus working tree; runs `rust_gates` only if a path matches `^(server-rs/|contracts/content|content/|client/react-client/src/protocol|scripts/precheck\.sh)`; otherwise records a visible SKIP. Fails safe to running; `PRECHECK_FULL=1` forces it. Gate 1's second run in `_release` sees the merged superset diff.

## Acceptance criteria

- [ ] A docs-only change makes Gate 1 print a SKIP line for the server-rs section and not invoke cargo.
- [ ] A change under `server-rs/` (or any other listed path) still runs the server-rs section.
- [ ] If the diff vs origin/main cannot be computed, the section runs.
- [ ] `PRECHECK_FULL=1` runs the section regardless of the diff.
- [ ] `bash -n scripts/precheck.sh` passes and the Gate 1 summary shows SKIP distinctly from PASS/FAIL.
