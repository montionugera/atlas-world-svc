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
