# F-041 Phase 1 — boundary changes (owner review)

The spine transcription paid the two cluster-1 authoring debts under the HC-6
rewrite licence. Byte-compare proves spine and geography agree; it cannot prove
the redrawn world is the intended one — that is this document's job.

## Redrawn boundaries (before → after, 0.25 km grid)

| # | Boundary | Edge moved | km² transferred | Zone area before → after |
|---|---|---|---|---|
| 1 | hollowmarch ∩ ashvale-front | Hollowmarch's west lobe ceded to the front (the contested flat is now the front's ground) | 363.6 | 944 → 359 |
| 2 | emberdown ∩ ashvale-front | Emberdown's north-east shoulder pulled south of the front's lip | 169.6 (2.9 remains, under the 3.7 tolerance) | 974 → 742 |
| 3 | gildmark-head ∩ the-saltmire | Gildmark Head's south tip pulled north of the mire bar (also un-beaches its old seaward vertex) | 110.4 | 898 → 690 |
| 4 | rooktide-reach ∩ the-saltmire | Reach's south edge now hugs the bar; Rooktide town keeps 0.5 km of ground | 88.3 | 1240 → 998.5 |
| 5 | meltwash-terrace ∩ hollowmarch | Terrace west edge / march east edge separated | 50.3 | 676 → 626 |
| 6 | millcross-ford ∩ rooktide-reach | Reach's north edge moved ~3.5 km south | 19.3 | (ford unchanged) |
| 7 | meltwash-terrace ∩ thornveil | Terrace south-east corner clipped | 6.4 | — |
| 8 | meltwash-terrace ∩ millcross-ford | Terrace south vertex lifted 2 km | 3.7 | — |

## Continent outline change (not a region∩region boundary)

Rows 1-8 above are boundaries *between* two child regions. This one is
different in kind: `n-cluster1`'s own outer polygon — the continent outline,
i.e. the land-sea edge — was also redrawn in the same commit
(`4cf8727`, `content/spine/nodes/n-cluster1.json`).

| Edge moved | Before | After | Effect |
|---|---|---|---|
| South-west corner, between y=173 and y=181 | `[0, 181]` | `[14, 177]`, `[0, 173]` | Coast pulled ~8 km east/north over that stretch; continent shrinks by 111 km² (26,128 → 26,017 km² total, per `derived.areaParentUnits2`) |

The new outline vertex `[14, 177]` is shared with the `west-coast` coastline
feature in `content/maps/cluster1-geography.json` (its polygon also carries
`[14, 177]` at two points) — the two are drawn coincident by design, not by
coincidence.

This edge was not in the region∩region diff above because it isn't a claim
transferred between two named regions; it's the outline the whole cluster is
drawn against. Flagging it here so the owner ack below covers it too.

## Unclaimed ground

- Before: 49.5% of the 150×190 sheet claimed by no child.
- After: the sea strip (≈2,042 km²) is `n-westsea`'s polygon; cluster-1's land is
  26,017 km², 53.4% covered by the 12 regions, and the remaining 46.6% is now a
  positive claim in `n-cluster1.interstitial` (meadow 34 / forest 20 / marsh 12 /
  rock 12 / upland 10 / river 6 / bramble 6).
- Doubly-claimed ground: 2.85% → 0.01%.

Town and camp positions: unchanged — every town `at` and frozen `absoluteAnchor`
is byte-identical before and after the redraws (the boundary work moves region
edges only).

Renderings: `coverage-before.svg` / `coverage-after.svg` (green claimed once,
red claimed twice, dark unclaimed).

**Owner ack required before Phase 1 closes** — reply "ack" or name the boundary
to re-draw.

## Owner ack

**Acked 2026-08-12** by the owner, wording: "ack" — given in response to the
F-042 (world map render) ship report, covering the 8 region∩region redraws and
the continent-outline change listed above. No boundary named for re-draw.
Phase 1 is closed.
