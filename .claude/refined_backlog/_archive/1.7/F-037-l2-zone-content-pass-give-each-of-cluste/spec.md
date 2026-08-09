---
title: "L2 zone content pass: give each of cluster 1's ten zones its hazards, harvestable resources, landmarks and the reason a player goes there"
id: F-037
from_idea: I-060
status: refined
wave: 6
order: 1
sequence_why: "widen L2: zone content across all zones"
design: docs/superpowers/specs/2026-08-08-l2-zone-content-design.md
plan: docs/superpowers/plans/2026-08-08-l2-zone-content.md
---

# L2 zone content pass — the ten grounds

<div class="callout danger">

**The canonical design is `docs/superpowers/specs/2026-08-08-l2-zone-content-design.md`
and the plan is `docs/superpowers/plans/2026-08-08-l2-zone-content.md`.**
Read that, not this. This file is the backlog entry; the design carries the SWF §3 artifact
contract sections, the Z1–Z7 gate rules, the gate self-check and the full deliverable list.

**The original title of this idea was wrong and has been corrected.** It read *"… the Systems
Designer's three-zones-per-band model needs alternates, cluster 1 currently ships one route with
no branches."* `A1-geography-cluster1.md` §4.4 had already ruled on that: cluster 1 ships one
route with no alternates, stated as a **known deficiency**, with the alternates assigned to
**cluster 2** and their three sites already named. The owner settled it on 2026-08-08 as design
decision **D1** — deepen the existing ten; design the alternates on paper only, never mint them
as zones.

</div>

## Problem

Cluster 1's ten zones exist as **geometry and nothing else**. Each carries exactly eight fields in
`content/maps/cluster1-geography.json` — `id, name, order, levelBand, terrainKind, town, labelAt,
polygon`. There is no data anywhere in the repo describing what threatens a player in a zone, what
they can take out of it, what they will remember seeing, or why they walked in.

Three concrete consequences, each verified against the repo:

1. **The `zones` budget line cannot be scored at all.** `content/season-1-budget.json` sets
   `target: 10` and carries a `blockedBy`. Separately and more fundamentally,
   `scripts/lib/season1.mjs` exports measures for mob bases, bestiary designs, quests and two art
   classes — **and nothing for zones.** Lifting the blocker would change nothing, because no
   function exists to count anything.
2. **Terrain cannot differentiate the ten.** `terrainKind` holds only seven distinct values across
   ten zones: `river-country` covers **Meltwash Terrace, Millcross Ford and Rooktide Reach**, and
   `rim` covers **Emberdown and Hollowmarch**. Five of ten zones share a label with a neighbour, so
   content derived from terrain alone yields five near-duplicate zones.
3. **Hazards have a runtime home; resources and landmarks have none.** `map.schema.json`'s
   `zoneHazards` is a closed seven-value enum consumed by `ZoneEffectManager`. No schema anywhere
   in the repo describes a harvestable resource or a landmark.

## Why now

Wave 6 is the widening wave, and this is its order-1 lane. Two reasons it goes first:

- **It is the only unblocked path to a scorable `zones` line.** Of the three blocked budget lines,
  this is the one whose blocker is an artifact gap rather than an engineering gap —
  `spawn-entries` waits on the `MobTypeConfig` variant axis and `world-state-systems` waits on
  buried-ground design, neither of which authoring can resolve.
- **The landmarks are already written and will rot otherwise.** `A1-geography-cluster1.md` §6
  wrote a first-sight landmark for all six towns and `A2-ecology-thornveil.md` supplied Thornveil's.
  Every one of the ten zones already has at least two landmarks in canon. Capturing them as data
  now is transcription; capturing them after more content derives from them is reconciliation.

Wave 6's other two lanes are unavailable or later: **I-061** (biome art) and **I-050** (town art
regeneration) are both hard-blocked — `tailscale status` reports the GPU host **offline, last seen
2026-08-06** — and **I-063** (dungeons) is L3, downstream of this.

## Sketch

The **F-029 pattern**, reused: a schema, one data file per zone, a strict gate, and a single shared
derivation doc.

- `content/zones/zone-<id>.json` × 10 — `zone`, `reasonToGo`, `hazards[]`, `resources[]`,
  `landmarks[]`.
- Hazards are authored in **fiction vocabulary** with an **optional** `effect` binding to one of the
  seven runtime types. The gate **warns** on an unmapped hazard rather than failing — because the
  Ashvale Front's defining hazard is *no water, no cover* (`A1:198`), an absence the engine cannot
  express and the world will not give up.
- `checkZoneContent()` with rules **Z1–Z7**. **Z2** (every zone has exactly one record) is F-029's
  G4 analogue and makes coverage provable by gate. **Z6** (no shared landmark name, no identical
  resource-kind set) is what stops the three river-country zones passing while reading identically.
- `zones(root)` in `scripts/lib/season1.mjs`, and the budget line's premise **rewritten rather than
  deleted** — this design sidesteps the keyspace blocker by keying on the geography zone id, so the
  X12 rename (I-056 item 4) stays separately owed.
- `docs/worldbuilding/A2-zones-cluster1.md` — **A2, not A3**; SWF §2 reserves `A3` for L3, which is
  [[I-063]]'s slot.

Related: [[I-063]], [[I-061]], [[I-050]], [[I-056]].
