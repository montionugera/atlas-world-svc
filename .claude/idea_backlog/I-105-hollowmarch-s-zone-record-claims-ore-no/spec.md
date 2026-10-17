---
title: "Hollowmarch's zone record claims ore no c02 region licenses"
id: I-105
status: idea
---

# Hollowmarch's zone record claims ore no c02 region licenses

## Problem

`content/zones/zone-hollowmarch.json` carries kind set `{ore, timber}`. Measured against the redrawn fabric: c02 (Wealdmarch) has zero regions — surveyed OR reported — that license `ore` (no rock/upland/scree/badland/karst biome, no ore-bearing landform, checked across all 30 c02 regions). This is one of the five legacy Wealdmarch rows Task 10/11 marked `PLACEHOLDER` and exempted from the licence rule. Task 15 (F-051 completion Task 1) investigated fixing it, found that reassigning the kind set reshuffles four already-shipped derived zones' kind sets (`galeness-reach`, `sedgebar-roads`, `wrackeyot-geo`, `alderlow-head`), reverted both files, and the owner ruled (2026-08-29, progress.md): "FILE it as a REAL DEFECT for Task 6's backlog triage... a pre-existing defect the redraw exposed, not one this task created."

## Why now

Explicit owner ruling requires this be filed now rather than silently fixed. `docs/worldbuilding/A4-zone-allocation.md` §2 already documents three options (leave placeholder-exempt / accept the 4-record ripple / freeze the four as additional `taken` inputs) — none chosen yet.

## Sketch

(rough shape; not a design yet)
