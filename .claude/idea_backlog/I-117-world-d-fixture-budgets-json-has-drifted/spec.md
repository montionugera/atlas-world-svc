---
title: "world-d fixture budgets.json has drifted from the real budgets.json"
id: I-117
status: idea
---

# world-d fixture budgets.json has drifted from the real budgets.json

## Problem

`scripts/tests/fixtures/world-d/base/world/budgets.json` has drifted from the real `content/world/budgets.json` independently of the freeze-survives-redraw work, and unlike `scripts/tests/fixtures/world/base/world/budgets.json`, nothing pins it — `world-gates.test.mjs`'s parity test covers only the `world` fixture, not `world-d`. Verified present at 786a709 via the file listing; not independently re-diffed byte-for-byte in this pass.

## Why now

Filed in "THE FREEZE SURVIVES THE REDRAW" (STATE §28, 2026-08-29), item 2. Low severity — a test fixture drift, not production content — but it means `world-d`'s fixture tests may be exercising stale budget values without anyone noticing.

## Sketch

(rough shape; not a design yet)
