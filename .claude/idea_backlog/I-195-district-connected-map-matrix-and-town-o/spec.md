---
title: "District Connected Map Matrix and Town or Hunting Area plus Monster Detail Inspector"
id: I-195
status: idea
epic: E-010
---

# District Connected Map Matrix and Town or Hunting Area plus Monster Detail Inspector

## Summary

Wire the Level 3 (**District**) and Level 4 (**Town or Hunting Area**) perspectives in `scripts/catalog_explorer_web.py` directly to `content/studio/` and `content/maps/_manifest.runtime.json`, combining the Maxion WorldMap (`rolth.maxion.gg/WorldMap`) vertical Level-Band monster pinning sidebar, Lineage (`lineage.pmfun.com/list/map`) connected two-dimensional map tile matrix with `North / South / East / West / Dungeon / Fog of Lore` portal bridges, and the `rolth.maxion.gg/Monster/1035` detail inspector.

## Acceptance criteria

- [ ] Selecting the **District** perspective (`#perspective=district&district=<id>`) renders the District's orthogonal two-dimensional connected map grid (`grid_nodes` and `portal_edges`) alongside the vertical Level-Band tabs (`Levels 1 to 20`, `Levels 21 to 40`, `Levels 41 to 60`, `Levels 61 to 80`, `Levels 81 to 100`) and clickable Monster Portrait cards that pin spawn badges and counts onto matching tiles.
- [ ] Each tile on the **District** matrix displays its distinct terrain preview thumbnail, status badge (`Canon`, `Draft`, or `Mystery / Fog of Lore`), level range, resident monster pills, and `North / South / East / West / Dungeon` neighbor connections (including locked `Fog of Lore` boundary portals with in-world rumors).
- [ ] Selecting the **Town or Hunting Area** perspective (`#perspective=town-or-hunting-area&map=<id>&monster=<id>`) renders the leaf node's topographic and portal blueprint (`North / South / East / West / Dungeon / Exit`), three-dimensional `.glb` asset kit bindings with 90 to 120 centimeter scale verification, and the embedded `Monster/1035` detail sheet (`192×192` portrait, four property pills, four stat boxes `Level / Health Points / Hit and Flee / Base and Job Experience`, `2×5` Elemental Modifiers grid, and Item and Monster Card Drop percentage badges).
