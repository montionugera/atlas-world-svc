---
title: "Freeze reasons are never verified true and reasons is unguarded"
id: I-113
status: idea
---

# Freeze reasons are never verified true and reasons is unguarded

## Problem

Two related gaps in `content/spine/freeze-reasons.json`'s enforcement, verified live at 786a709: (1) `gSpineFrozen` (`scripts/check_content.mjs`, both arms) only checks that a reason is PRESENT and sentence-shaped (>=40 chars, >=8 words, a full stop) — nothing verifies a freeze reason is actually TRUE, e.g. that the named node really is ancestor-closed or immovable for the stated reason. (2) Both `gSpineFrozen` and `generate-world.mjs`'s step 4b call `Object.keys(freezeReasons.reasons)` directly (`check_content.mjs:2953`) with no guard that `reasons` is a plain object — a committed file whose `reasons` is an array or string would misbehave rather than fail cleanly.

## Why now

Filed by Task 7 (freeze reasons must be sentence-shaped, item 3) and by "THE FREEZE SURVIVES THE REDRAW" task (item 1), both in STATE §28, 2026-08-29. Neither is a regression — the schema-shaped guard and the truthfulness check were never built — but both are open holes in a mechanism that is now the single authority read by three machines (the gate, the generator, and promotion).

## Sketch

(rough shape; not a design yet)
