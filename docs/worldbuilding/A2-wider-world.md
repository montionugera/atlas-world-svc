# A2 — The wider world (the compiled mariners' chart)

**Level:** L2 · **Role:** Cartographer (charter §2.1) · **Date:** 2026-08-15
**Provenance:** F-043 · `DR-006-swf-scope.md` option 3, exercised deliberately — every collision
named and fixed in the same change (§6).
**Single source:** every lore line below is **copied from its spine node**
(`content/spine/nodes/*.json`) or its lane edge (`content/spine/edges.json`). This sheet cites; it
never re-invents. Where a node says nothing, this sheet says nothing.

<div class="callout info">
<strong>Scope of this document.</strong> The atlas sheet: what the wider world's chart contains —
the named coasts, seas, chains and cap, the two lanes, and exactly how much of it anyone can vouch
for. The basin survey (<code>A1-geography-cluster1.md</code>) is a <em>different artifact</em> and
is unchanged: its parchment still ends at a hard edge, its two doors are still the only two doors.
</div>

---

## 1. What this sheet is — reported, not surveyed

This chart is compiled at Gildmark from shipmasters' logs sworn at the harbor. That provenance is
the whole epistemology, so it is stated before any name is:

- **A hatched coast means a master's sworn log** — a coastline taken from the deck of a ship,
  entered at Gildmark, and drawn as reported. It does not mean anyone stood on it.
- **Interiors are blank.** No log claims ground past any shore on this sheet. What stands behind
  a charted coast is not known, not named beyond the chart's own region words, and not peopled.
- **Reported ≠ surveyed.** Every mark here is another crew's word. Where the marks disagree, the
  chart keeps the hatching and the doubt.
- **Unnamed marks stay unnamed.** The outlying isles of the three chains carry no names
  (`attrs.name: null` on their features) — they exist only by mariners' report, and an unnamed
  mark on a chart is the honest register for that.
- **Nobody from the basin has walked any of this.** The one harbor on this sheet any reporting
  master has actually tied up in is Tallowquay; everything else is wharf-talk and log-lines.

## 2. The two lanes

| Lane | From → to | Season | Passage | Standing |
| --- | --- | --- | --- | --- |
| `e-lane-coldreach` | Gildmark → **Tallowquay** (`f-port-tallowquay`, Coldreach) | the trade wind | 6 days | **The same once-a-year trade-wind voyage as `e-sea-lane`**, its far end now charted: the merchantmen that reach Gildmark on the trade wind are the ones that tied up at Tallowquay first. Not a second service. |
| `e-lane-stonemoor-foreign` | Tallowquay → **Netstead** (`f-port-netstead`, Stonemoor) | reported year-round | 4 days | A foreign-to-foreign coastal lane; no Gildmark keel has run it. "Mariners say it runs the year round — no log from Gildmark confirms the claim." |

## 3. The continents

**Coldreach** (`n-coldreach`) — *"Six days out on the trade wind, masters log a cold grey coast
under one long spine of rock; no log claims what stands behind it."* Its port, **Tallowquay**, is
the trade-wind lane's far terminus.

- **the Coldreach Shore** (`n-coldreach-shore`) — *"The shore the lane raises first — charted as a
  run of headlands taken from the deck, nothing landed."*
- **the Peatrun Coast** (`n-peatrun-coast`) — *"The far run of coast where the Peatrun stains the
  sea brown a mile out, or so the wreck-reports swear."*
- **the Coldreach Interior** (`n-coldreach-interior`) — *"No crew claims to have gone inland past
  the spine; the interior is blank chart and sailors' guessing."*

**Stonemoor** (`n-stonemoor`) — *"A second continent set down from wharf-talk at Tallowquay: a
moor-backed coast four days along a foreign lane, nothing sworn beyond the shore."* Its reported
port is **Netstead**.

- **the Stonemoor Shore** (`n-stonemoor-shore`) — *"The stretch the foreign lane is said to
  follow; every mark on it is another crew's word."*
- **the Slateflow Coast** (`n-slateflow-coast`) — *"A coast reported grey to the tideline where
  the Slateflow comes out; no chart of it was drawn ashore."*
- **the Stonemoor Interior** (`n-stonemoor-interior`) — *"Unsurveyed by any keel-borne account;
  the moor's far side is not even rumor."*

## 4. The chains, the seas, the cap

**Three island chains**, each a handful of marks:

- **Driftholt** (`n-driftholt`) — *"A chain named for the wooded holt that drifts in and out of
  fog-sight; only the main isle is fixed on any chart."*
- **Reedstrand** (`n-reedstrand`) — *"Mariners swear to a low strand walled in reed-beds; three of
  its isles are marks on a chart and no more."*
- **Brightfall** (`n-brightfall`) — *"Named for white water reported falling off its seaward
  rocks; one isle charted, the rest claimed."*

**Three seas**, named from the logs:

- **The Keelbreak Sea** (`n-keelbreak`) — *"The western water, named in wreck-ledgers: more keels
  opened there than in every other sea the logs keep."*
- **The Galereach Sea** (`n-galereach`) — *"The middle water the trade wind crosses; its gales are
  the one entry every log agrees on."*
- **The Tarnmark Sea** (`n-tarnmark`) — *"The eastern water past Stonemoor, dark and still by
  every account, where the charts run out."*

**One cap**, shutting the north:

- **the Rimewall Cap** (`n-rimewall-cap`) — *"Every master who has run far enough north reports
  the same white wall shutting the horizon; none reports an end to it."* A reported ice edge,
  never a coastline; the basin survey's northern parchment edge (A1 §7.2) is unchanged by it.

## 5. What this changes, and what it does not

**V8 survives** (`A0-current-world.md` §2.1): **Gildmark remains the basin's only port and the
land's only door to the sea.** Both harbors on this sheet are foreign harbors on foreign coasts —
they give the sister towns nothing: no ship, no wharf, no second door. "Whoever controls the door
to the sea controls the price of the whole land" is exactly as true with the far shore named as it
was when the far shore was one sentence.

The pass behind Cindervast stays shut. Cluster 1's two doors (A1 §4.4) are still its only two
doors — the sea door simply points at a named place now.

## 6. DR-006 provenance note

This sheet exercises **`DR-006-swf-scope.md` option 3** (everything on the table, no silent
drift): the wider world's names touch shipped narrative, so the amendment names its collisions and
ships every fix in the same change. Files amended in this change:

- `docs/worldbuilding/A2-wider-world.md` — created (this sheet).
- `docs/worldbuilding/A1-geography-cluster1.md` — annotations only: the two-doors list (§4.4), the
  §7.2 withheld entries (ice edge, sea beyond a day's sail), and the A1-ART-01 hard-edge sentence.
- `docs/worldbuilding/A0-current-world.md` — G18 marked partially resolved; §5.2 item 2 annotated.
  **V8 is not amended** — it survives, see §5.
- `docs/story/undertow/core-story.md` — one additive Thai sentence at the end of the
  door-to-the-sea paragraph (shipped-narrative amendment under option 3); no existing clause
  changed.
- `content/story/canon.md` — new §4 bullets for the named landmasses, seas and cap, plus a §6.2
  rulings row.
