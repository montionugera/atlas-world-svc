---
title: "canon-legs.json's feature field is never read for correctness"
id: I-111
status: idea
---

# canon-legs.json's feature field is never read for correctness

## Problem

`content/spine/canon-legs.json`'s per-endpoint shape is `{pinned, feature}`, but `scripts/check_canon_legs.mjs`'s malformed-entry guard (line ~76) tests only `!entry.from?.pinned || !entry.to?.pinned` — `.feature` is never read anywhere in the checker or in `check_content.mjs`'s G-CANON-LEG rule. Verified by code read at 786a709: the distance check resolves `entry.from.pinned` / `entry.to.pinned` and compares against `e.attrs.straightKm` within a tolerance fraction; `.feature` is decorative documentation only.

## Why now

Filed as "accepted residual" during Plan E (STATE §28 line 3227): a within-±8% feature swap on either leg endpoint passes both gates silently; geometry beyond ±8% still reds regardless of what `.feature` says. Low severity — the load-bearing check (distance) is sound — but the field reads as validated when it is not, and nobody has decided whether that is acceptable long-term.

## Sketch

(rough shape; not a design yet)
