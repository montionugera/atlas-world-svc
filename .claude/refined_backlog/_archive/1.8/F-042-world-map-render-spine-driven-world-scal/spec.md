---
title: "World map render: spine-driven world-scale map (F-041 tier spine has no renderer; cluster1-world.svg is region-scale)"
id: F-042
status: refined
from_idea: I-090
---

# World map render: spine-driven world-scale map

## Problem

The owner's I-089 complaint — "currently it is like a region map not world map" — was answered by F-041 with a data model only. Rendering was explicitly deferred (F-041 spec §6): the only committed map is still the 150×190 km basin sheet, drawn from the generated `cluster1-geography.json` mirror rather than the authoritative spine, and no world-scale (2000×2000 km `n-atlas`) sheet exists at all.

## Why now

The spine shipped on release/1.8 with every coordinate a renderer needs on one shared km grid. Rendering from the spine also unblocks the deferred Phase-7 mirror retirement.

## Sketch

See the canonical approved design: `docs/superpowers/specs/2026-08-12-world-map-render-design.md` (2026-08-12, owner-approved). Summary: extract a shared drafting library from `tools/mapforge/render-map.mjs`; add spine-driven `render-sheet.mjs`; deliver two static sheets (new world/atlas sheet + continent sheet re-rendered from spine, byte-identical); CI drift gate `check_map_render.mjs`; rsvg-convert-only rasters. Region/town sheets, interactive viewer, and mirror retirement are out of scope.
