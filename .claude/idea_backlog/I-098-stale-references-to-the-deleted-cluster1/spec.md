---
title: "Stale references to the deleted cluster1-geography mirror and render-map.mjs survive in schema prose, three comments, and the basin sheet's drawn bytes"
id: I-098
status: idea
---

# Stale references to what Plan A deleted

F-046 (World Fill Plan A) deleted `content/maps/cluster1-geography.json` and
`tools/mapforge/render-map.mjs` in commit `9cd227c`. Its proof test sweeps **executable readers
only** — correctly, since prose cannot open a file. That leaves three classes of stale reference
behind, each with a different owner. **None of them may be fixed in Plan A**, which shipped with
a closed, enumerated list of five changed files under `content/`.

## 1. Committed schema prose points at a deleted authority — belongs to Plan D

`content/schemas/zone-content.schema.json:4` and `content/schemas/town-plan.schema.json:5`
both still tell an author that `content/maps/cluster1-geography.json` *"stays the authority on
where a zone/town is and is never written back to"*. That file no longer exists.

Verify: `git grep -n 'cluster1-geography' -- content/schemas/` → two hits, both `description`
strings. `ls content/maps/` → only `.gitkeep` and `atlas-frontier.md`.

Deferred because editing either file would have added a **sixth** entry to Plan A's closed
content diff. Plan D already edits this area (it removes `loadPlaces`' mirror fallback and
migrates the three fixture roots), so it is the natural home.

## 2. Three comments describe deleted code as present — cheap, no content risk

- `scripts/check_spine_emit.mjs:107` — says the frontier guard mirrors "the n-cluster1 geography
  push above". That push was deleted in the same commit.
- `tools/mapforge/lib/draft.mjs:9` and `:170` — point the reader at
  `tools/mapforge/tests/parity.test.mjs` and assert "parity.test.mjs pins that" for
  byte-identical output. The file is deleted, so the **stated coverage claim is now false**; the
  guarantee moved to `check_render_lock.mjs`.
- `scripts/integration.sh:105` — still calls `mapforge_tests` the "unit + parity test suite".

This is the same defect class that recurred four times inside F-046: **a comment asserting a
guarantee the code beside it no longer provides.** Worth fixing precisely because the next reader
will believe it.

## 3. `render-map.mjs` is named inside the committed SVG's DRAWN BYTES — belongs to Plan B Task 12

`tools/mapforge/lib/basin-sheet.mjs:143` and `:729` write the tool's name into the sheet's
`<desc>` and footer. Those strings are rendered into
`game-client/assets/art/maps/cluster1-world.svg`, so correcting them **moves pixels**.

Plan B Task 12 is the one commit in the whole programme permitted to re-baseline
`content/world/render-lock.json` and the two committed SVGs. It must carry this, or the shipped
chart keeps crediting a tool that no longer exists.

## Why now

Cheap, and each item is a small lie the next author will act on. Class 2 can go any time; class 1
rides with Plan D; class 3 rides with Plan B Task 12 or not at all.
