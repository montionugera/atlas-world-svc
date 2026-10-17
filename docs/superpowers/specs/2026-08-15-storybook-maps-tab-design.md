# Storybook Maps Tab (I-094) — Design

**Date:** 2026-08-15
**Status:** Approved (owner intent 2026-08-15: "yes we should able to observe every artifact / please note as project rules")
**Origin:** F-043 shipped the complete world chart; the owner asked to see it in the storybook and it wasn't there. New standing rule: **every produced artifact must be observable in a review surface, not just committed.**

## 1. Goal

Add a **Maps** section to the asset-storybook (`tools/asset-storybook/index.html`) that displays every mapforge sheet — today `cluster1-world` (the basin survey) and `atlas-world` (the compiled mariners' chart) — with pan/zoom, and make the observability rule *enforceable*: a test pins that every sheet in mapforge's `SHEETS` registry is listed in the storybook's maps index.

## 2. Scope

- **`tools/asset-storybook/maps-index.json`** (new, committed): one row per sheet — `{id, title, svg, png, note}` — paths relative to how the storybook already serves repo assets (follow the existing `audio-index.json` pattern and the Dockerfile's copy list; if `game-client/assets/art/maps/` isn't in the nginx image, extend the Dockerfile the same way existing asset dirs are included).
- **Maps section in `index.html`**: nav entry + a grid of sheet cards (title + note); clicking a card opens the SVG in an inline viewer with wheel-zoom and drag-pan (vanilla JS, no new dependencies — matches the storybook's existing zero-framework style). A "open PNG" link per sheet for the raster.
- **Parity test** (`tools/asset-storybook/tests/maps-index.test.mjs`): imports `SHEETS` from `tools/mapforge/render-sheet.mjs` and asserts (a) every registry sheet id appears in `maps-index.json`, (b) every indexed `svg`/`png` path exists on disk. This is the every-artifact-observable rule as a red-green gate for maps — a future third sheet that isn't indexed fails the storybook suite (which precheck already runs).
- **CLAUDE.md**: one line under Conventions recording the standing rule.

## 3. Out of scope

Serving other artifact classes (reports, panel verdicts — future ideas under the same rule); minimap/runtime use; SVG editing; deploy changes beyond the Dockerfile copy list.

## 4. Acceptance criteria

1. Storybook page shows a Maps section listing both sheets; the atlas chart opens, pans, zooms.
2. `maps-index.json` ↔ `SHEETS` parity test exists, red-then-green proven (remove an index row → suite fails).
3. `node --test tools/asset-storybook/tests/*.test.mjs` green (precheck step 11 covers it); full precheck 13/13.
4. CLAUDE.md carries the observability rule.
5. Works in the nginx image: the Dockerfile serves the maps files (verify the image build copies them, or document the local-dev path if the storybook is also usable via file://).
