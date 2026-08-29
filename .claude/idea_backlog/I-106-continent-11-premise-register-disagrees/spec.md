---
title: "continent-11 premise register disagrees with names registers.json"
id: I-106
status: idea
---

# continent-11 premise register disagrees with names registers.json

## Problem

`content/world/premises/continent-11.json:23` declares `"register": "reedspeech"` while `content/world/names/registers.json`'s `continentRegister` map says `"c11": "moorstone"`. Verified live at 786a709 — both files still disagree. Quillreef (c11) has zero surveyed regions, so nothing in the current pipeline reads the premise's `register` field and the disagreement is dormant, not yet gated by any test.

## Why now

Filed by Task 10 (STATE §28, 2026-08-29), not chased since. Dormant only because Quillreef has no surveyed ground yet — the day it does, `zone-allocation.mjs`'s name minting will need to pick one of the two registers, and nothing reconciles them today.

## Sketch

(rough shape; not a design yet)
