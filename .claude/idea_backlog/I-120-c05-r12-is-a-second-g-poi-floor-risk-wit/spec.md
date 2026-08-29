---
title: "c05 r12 is a second G-POI floor risk with no declaration"
id: I-120
status: idea
---

# c05 r12 is a second G-POI floor risk with no declaration

## Problem

`content/world/fabric/continent-05.json`'s region `c05/r12` is a second 100%-desert, zero-landform-instance region on Thirstwold (Thirstwold's `c05/r06` is the first, and IS declared in `budgets.json poi.supplyLimitedSurveyedRegions`). `c05/r12` is currently REPORTED, not surveyed, so no zone record — and no G-POI check — is owed on it today; verified consistent with `content/world/fabric/continent-05.json` at 786a709. The moment a future survey reaches it, the identical G-POI floor failure that `c05/r06` needed a declaration for will fire with no declaration in place, because `poi.supplyLimitedSurveyedRegions` only lists `c05/r06`.

## Why now

Filed by Task 13 (STATE §28, 2026-08-29): "if the survey ever reaches r12 the same G-POI floor fails with no declaration behind it." A latent instance of the exact defect class I-110 already tracks for the five currently-surveyed shortfalls — worth fixing at the same time as I-110 rather than waiting for r12 to be surveyed and re-discovering it.

## Sketch

(rough shape; not a design yet)
