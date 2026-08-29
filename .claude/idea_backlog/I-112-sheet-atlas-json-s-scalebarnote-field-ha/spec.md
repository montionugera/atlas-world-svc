---
title: "sheet-atlas.json's scaleBarNote field has no live reader"
id: I-112
status: idea
---

# sheet-atlas.json's scaleBarNote field has no live reader

## Problem

`content/spine/sheet-atlas.json:6`'s `scaleBarNote` field has exactly one reader in the whole codebase: `tools/mapforge/lib/basin-sheet.mjs:711`. Verified live at 786a709 via grep. `basin-sheet.mjs` was retired from the `SHEETS` registry by ruling 8 (Task 6's Plan E work) and is now permanently dormant — see I-118. So `sheet-atlas.json`'s `scaleBarNote` is written but never rendered by anything on the shipped path.

## Why now

Filed during the class-9 re-key review (STATE §28, 2026-08-27): "pre-existing dead field; surveyNote was removed above only because THIS diff retired its reader." `scaleBarNote` never got the same treatment. Minor dead-content housekeeping, bundled with I-118's dead-code decision.

## Sketch

(rough shape; not a design yet)
