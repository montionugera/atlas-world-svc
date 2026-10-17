---
title: "Design spec and fabric disagree on which continent owns the inland sea"
id: I-109
status: idea
---

# Design spec and fabric disagree on which continent owns the inland sea

## Problem

`docs/superpowers/specs/2026-08-16-world-fill-generated-land-bound-places-design.md:450,489` still assigns the interior water: "Wealdmarch 1,100 (the inland sea)" and "Stonemoor 300 (flooded dolines and a polje lake)". Measured against the redrawn fabric at 786a709: the one `inland-sea-basin` landform in the world (`lf-c04-r25-0254`, 30.28 km², glyph `g-lake`) is on `content/world/fabric/continent-04.json` — Stonemoor, not Wealdmarch. `zone-stonemoor`'s own zone record (`clintlack-fenster`) already calls this feature "enclosed water the sea does not reach" without using the word "sea", to avoid contradicting the design doc.

## Why now

Filed by Task 12 (STATE §28, 2026-08-29): "the fabric wins and the prose is scoped to avoid the word 'sea', but the two documents disagree." The design doc's own generation targets (65,600 km² gross land, 1.00 pp interior water) are still cited elsewhere as authoritative even though this one assignment is stale.

## Sketch

(rough shape; not a design yet)
