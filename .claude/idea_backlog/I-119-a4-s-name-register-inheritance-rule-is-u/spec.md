---
title: "A4's name-register inheritance rule is unenforced in code"
id: I-119
status: idea
---

# A4's name-register inheritance rule is unenforced in code

## Problem

`docs/worldbuilding/A4-zone-allocation.md` §4 states a rule ("an inherited name is judged by the register it was authored in") for names a derived zone inherits from a hand-pinned canon place (the "inheritance beats minting" mechanism — e.g. `c09/r03` inheriting `Brightfall Leap`). Verified by code read at 786a709: `scripts/lib/zone-allocation.mjs`'s naming path and `scripts/lib/resolve.mjs`'s `G-NAME-REGISTER` gate both operate on MINTED names; neither reads or enforces a register check against an INHERITED name's own authored register. Also filed alongside: cross-landmass morpheme repetition is unruled (`withybar-roads` on c08 beside the drawn `Withyshallow Saddle` on c07) — `G-NAME-SOUND`'s repetition ceiling is scoped per-landmass by design, so a repeated morpheme across two landmasses is invisible to it.

## Why now

Both filed by Task 10 (STATE §28, 2026-08-29), unfixed since. Neither is a regression — both gaps have existed since the naming gates were built — but A4 §4's own prose asserts a rule the code does not check.

## Sketch

(rough shape; not a design yet)
