---
title: "No gate binds a minted zone landmark to the drawn world's own name"
id: I-115
status: idea
---

# No gate binds a minted zone landmark to the drawn world's own name

## Problem

Two related, code-confirmed gaps, both live at 786a709: (1) Nothing binds a zone-minted landmark (`content/zones/*.json#landmarks`) to the specific landform instance it stands on — neither `instances[]` nor `landmarks[]` carries an instance-to-landmark id, so a zone landmark and a drawn/generated landmark can describe the same feature under two different names with no detection (concrete collisions found and left unenforced in Tasks 11-14, e.g. "Ford past Sabkhpan" vs the drawn "Ford beyond Sabkhcone"). (2) `G-NAME-SOUND` (`scripts/lib/resolve.mjs:166-178`) filters its `docs` list to `d.provenance?.authored !== "hand"` and compares generator-authored RESOLVED-WORLD documents against each other only — it never reads `content/zones/*.json`'s minted landmark names at all, so a minted zone landmark can be phonetically indistinguishable from a drawn landmark and no gate will ever catch it.

## Why now

Filed and re-confirmed across Tasks 11, 13 and 14 with five concrete near-collision examples (STATE §28). `drawnPlaceNames` (zone-allocation.mjs) does bar a minted zone landmark from reusing a WHOLE drawn name, but nothing checks near-misses (phoneme distance) or instance-level identity.

## Sketch

(rough shape; not a design yet)
