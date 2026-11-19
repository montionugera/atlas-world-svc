---
title: "Short menu: sidebar from 31 tabs to 11 entries with sub-view pills (game DB slice S2)"
id: F-219
status: refined
from_idea: I-304
---

# Short menu: sidebar from 31 tabs to 11 entries with sub-view pills (game DB slice S2)

This is slice S2 of the owner-approved game DB spec
(`.claude/refined_backlog/F-216-game-db-from-the-studio-world-slim-catal/spec.md`, approved 2026-11-15,
sections "Slices", "Sidebar after S2", requirements R10, R10a, R11, R11f, acceptance A11, A14, A15).
S1 (one search box, record pages) shipped as F-216 in release 1.34. Nothing here is new scope; this file
restates the S2 part so it can be built as its own feature.

## Problem

The explorer sidebar lists 31 tabs in 7 groups, with labels that carry table names and step numbers
("Monster Detail (mob_db)", "Review Gate Inbox (Step 3)"). Owner, 2026-11-15, on a screenshot of the
release app: "menu still alot".

## Why now

S1 made every record findable from one search box. The long menu is now the main thing that makes the
game DB hard to use, and the owner asked for it next.

## Sketch

The sidebar shows 11 entries. Each entry groups the existing tabs; the existing tab ids stay as they are
and become sub-view pills in the sub-view bar (`#subViewBar`). Because the ids do not change, every old
`?tab=<id>` link keeps opening the same content, now with its entry highlighted and its pill selected.

| # | Entry | Sub-views (existing tab ids, pill order) |
|---|---|---|
| 1 | Home | home (new: search prompt and record counts by kind; replaces `overview`) |
| 2 | World | studio, world, maps, map-sheets |
| 3 | Monsters | mobs, bestiary |
| 4 | Items and cards | gear |
| 5 | Jobs and skills | jobs |
| 6 | Quests and dungeons | quests, dungeons |
| 7 | Lore and canon | lore, races |
| 8 | Art | concept-arts, art |
| 9 | Assets and audio | assets, audio, coverage |
| 10 | Tools | sql, combat-lab, docs, elements, siege, enchant, brushes, map-builder, forge, review |
| 11 | Archive (old concept) | story |

- `sim` (a page that only prints a cargo command) is removed; `?tab=sim` and `?tab=overview` open Home.
- `review` stays reachable under Tools until slice S4 removes it (the approved table does not place it).
- `story` keeps its own second row of pills (Nodes, Reader, Graph, Undertow) under the entry pills.
- Deferred (decided while planning, 2026-11-15): removing the concept-art tab's own search box. It filters by zone, prompt and tag; the top-bar search indexes only title and caption, so removing it now would lose those. It goes once the record index covers those fields.
- "Legacy world data" under Archive is slice S3 (it moves old-concept data there); not in this slice.

## Requirements

- R10. The sidebar shall show the 11 entries above with those labels and no table names or step numbers.
- R10a. Where an entry has more than one sub-view, the sub-view bar shall show one pill per sub-view,
  with the open one marked selected.
- R11. When a URL carries an old `?tab=<id>` value, or the user follows an "Open in <entry>" link on a
  record page, the explorer shall open the entry that holds that sub-view with that sub-view selected.
- R11f. If the value belonged to a removed tab (`sim`, `overview`) or is unknown, then it shall open Home.
- R12. When Home is open, it shall show the number of records per kind, and each count shall open the
  entry that holds that kind.
- R13. The "Open in" link on a record page shall name the entry ("Open in World"), not the old tab label.

## Acceptance criteria

- [ ] A1 (R10): `#sidebarNav` has exactly 11 entries with the labels in the table; no label contains "(", "_db" or "Step".
- [ ] A2 (R10a, R11): `/?tab=bestiary` opens Monsters with the bestiary pill selected; `/?tab=map-sheets` opens World with map-sheets selected; `/?tab=story&view=reader` opens Archive with the Reader pill selected.
- [ ] A3 (R11f): `/?tab=sim`, `/?tab=overview` and `/?tab=nope` open Home.
- [ ] A4 (R10a): every existing tab id except `sim` and `overview` is reachable by a real click on an entry and then a pill (browser test walks all of them and checks the content area is not empty).
- [ ] A5 (R12): Home shows a count for continent, district and node equal to `select count(*) from records where kind=?`; a real click on the district count opens World.
- [ ] A6 (R13): `/?r=continent:continent-01-hearthbloom-basin` shows "Open in World", and a real click on it opens World with the studio pill selected.
- [ ] A8: at 390x844 the nav drawer shows all 11 entries without scrolling past two screens, and the pills row scrolls sideways instead of wrapping over content; phone and desktop (1280x800) screenshots of Home, World and Archive are taken with `ui-visual-verify`, looked at, and shown to the owner with a direct link on the edit host.
- [ ] A10 (top bar, found after S1 shipped): on the real hostnames (`atlas-edit.joymify.local.com`, `atlas-world.joymify.local.com`) at 1024, 1280 and 1440 px wide, no top-bar control overlaps another, and at least 200 px of the search box is visible at 1280 px. Measured 2026-11-15 on S1: at 1280 px the "Drop Rate" select covers the right half of the search box because the "Editable · <hostname>" chip is longer than on `127.0.0.1`, where S1 was checked.
- [ ] A9: Gate 1 (`./scripts/precheck.sh`) passes, including `panel-parity.test.mjs`, `atlas_phone_touch_audit.mjs`, `atlas_ux_probe.py` and `atlas_records_probe.mjs`.

## Assumptions

- ASSUMED: `review` goes under Tools until S4; the approved table lists it only as "removed in S4". Reversible: yes (one table row).
- ASSUMED: tab ids stay unchanged in URLs (`?tab=bestiary` stays the canonical link for that sub-view); no new `?entry=` parameter. Reversible: yes.
- ASSUMED: entry labels carry no emoji, since the owner asked for plain labels. Reversible: yes.
