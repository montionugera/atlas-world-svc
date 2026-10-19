---
title: "Observatory 4-Perspective Big-Picture Diagrams and Universal 3D WebP Thumbnail Resolver"
id: F-151
status: refined
from_idea: I-230
---

# Observatory 4-Perspective Big-Picture Diagrams and Universal 3D WebP Thumbnail Resolver

## Problem

The World Studio Observatory (`scripts/catalog_explorer_web.py`) lacked dedicated visual big-picture architectural/topological SVG diagrams across the 4 top-down perspectives (`World History and Concept`, `Continent`, `District`, and `Town or Hunting Area`), and `/thumbs/` requests for semantic 3D asset paths (`/thumbs/nature/...`, `/thumbs/creatures/...`, `/thumbs/loot/...`, `/thumbs/cards/...`) were not resolving to baked `.webp` thumbnails in `game-client/assets/.thumbs/`. Additionally, sidebar directory badges and `.lineage-map-card__preview` CSS bounds needed to reflect live Studio + runtime map totals (`33D · 94 Maps`, `119 Tiles`, `119 Maps`, `130 Mobs`).

## Why now

All 33 Districts and 94 Studio Maps are now promoted in `content/studio/districts/`, requiring immediate visual inspection of world timeline/scar lineage, inter-continent routes, district overland/dungeon cutaways, 4000m×4000m leaf blueprints, and 100% resolved 3D `.webp` thumbnails across the Web Observatory (`:8788`) and Native macOS app.

## Sketch

1. Add universal 3D `.webp` thumbnail resolution (`resolve_thumb_file`) in `scripts/catalog_explorer_web.py` indexing all `.glb` assets and `.webp` thumbnails in `game-client/assets/.thumbs/` across semantic paths and category pools (`creatures`, `characters`, `nature`, `buildings`, `dungeon`, `loot`, `weapons`).
2. Add 4 interactive big-picture SVG diagram renderers (`renderWhcBigPictureSvg`, `renderContinentBigPictureSvg`, `renderDistrictBigPictureSvg`, `renderTownOrHuntingAreaBigPictureSvg`) in `scripts/catalog_explorer_web.py`.
3. Unify Connected Map Directory and sidebar counts and add unit test coverage in `tests/test_studio_web_perspectives.py`.

## Acceptance criteria

- [ ] `resolve_thumb_file` in `scripts/catalog_explorer_web.py` resolves direct SHA256 hashes, `res://assets/<subpath>.glb` paths, and `/thumbs/<category>/<id>.webp` URLs (`creatures`, `loot`, `cards`, `nature`, `buildings`, `dungeon`, `weapons`) to valid `.webp` files in `game-client/assets/.thumbs/`.
- [ ] All 4 perspective views render their dedicated interactive Big-Picture SVG diagrams (`renderWhcBigPictureSvg`, `renderContinentBigPictureSvg`, `renderDistrictBigPictureSvg`, `renderTownOrHuntingAreaBigPictureSvg`).
- [ ] `python3 -m unittest tests/test_studio_web_perspectives.py` passes all 5 tests covering the 4 perspectives, big-picture SVG diagrams, and 3D `.webp` thumbnail resolution.
