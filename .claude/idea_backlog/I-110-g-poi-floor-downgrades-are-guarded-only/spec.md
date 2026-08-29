---
title: "G-POI floor downgrades are guarded only by a hardcoded warning count"
id: I-110
status: idea
---

# G-POI floor downgrades are guarded only by a hardcoded warning count

## Problem

`content/world/budgets.json`'s `poi.supplyLimitedSurveyedRegions` downgrades five G-POI floor shortfalls to WARN — verified live at 786a709 (`c05/r06` 0/12, `c05/r20` 10/12, `c07/r06` 10/12, `c08/r06` 9/12, `c08/r08` 11/12; `check_content.mjs --only=spine` currently prints exactly these five WARNs). The only regression tripwire on someone ADDING a sixth declaration is the literal `const SPINE_WARNINGS = 8` at `scripts/tests/edges-schema.test.mjs:382` — a silencing commit that adds a declaration would bump the warning count and update this same literal in the same diff, with no independent signal that a new region just got exempted from the floor.

## Why now

One of the three items STATE §28 named most embarrassing if shipped unaudited ("the POI warning-literal tripwire"). Filed originally in the review of `bc393a4` (2026-08-28), still true today — the count (8) and the five regions are byte-identical to the original filing.

## Sketch

(rough shape; not a design yet)
