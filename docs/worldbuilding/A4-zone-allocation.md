# A4 — Zone allocation

**Why this file exists.** `Z6` (`scripts/check_content.mjs`, the "Compared as a SET" block)
requires every zone record's deduped resource-**kind set** to be globally unique against a closed
8-value enum — `crop, timber, ore, fuel, stone, water, forage, salvage` — and every landmark name to
be globally unique across all zones, compared trimmed and case-insensitively. With 40 surveyed
regions and 255 non-empty sets that is a set-packing problem, and discovering a collision on record
37 means rewriting the resources *and* the prose that justifies them. So the allocation is solved
here first, before a word of zone prose is written.

**This table is a generated artifact.** It is derived from `content/world/fabric/continent-NN.json`,
`content/world/premises/continent-NN.json`, `content/world/names/{registers,classifiers,reserved}.json`
and the ten committed `content/zones/zone-*.json` records by `scripts/lib/zone-allocation.mjs`.
Do not hand-edit the rows: change the inputs or the rule and re-run
`node scripts/derive_zone_allocation.mjs --write`. `scripts/tests/zone-allocation.test.mjs` re-derives
the whole table and fails on any drift.

---

## 1. What the allocation keys on

The allocation keys on **the ground itself**, in three steps, none of which is a matter of taste.

**Step 1 — the ground, measured.** Every surveyed region is read out of the fabric with only the
fields the generator wrote: `terrainKind`, `biomeShares`, the `instances[].type` landforms inside it,
and the dominant landform **group** taken off the instance handles (`c06/coastal/h-15392d`), ties
broken alphabetically. One region — `c05/r06`, 100% desert — carries no landform instances at all, so
its group falls back to its dominant biome, which is the only evidence there is.

**Step 2 — the licence.** An affordance table maps each of the eight kinds to the measured evidence
that would let a person carry that kind out of a region: `crop` wants meadow, a river or a spring;
`timber` wants standing wood; `ore` wants rock, karst or an exposure that reaches it; `fuel` wants
peat, ash, lava or bramble; `stone` wants limestone country, bare rock or desert lag; `water` wants
something running, ponded or held in rock; `forage` wants anything that grows untended; `salvage`
wants a wrecking coast or an erg that buries a caravan and gives it back. The table lives in
`scripts/lib/zone-allocation.mjs` as `LICENCE`, one predicate per kind, each naming its own evidence.
**A zone may only be given kinds its own region licenses** — which is what lets Tasks 11–14 justify a
kind in prose without contradicting the ground the zone stands on.

**Step 3 — the packing.** Each region is then given a globally-unique kind set drawn from what it
licenses. Candidates are its licensed two-element subsets first, then three-element, then
one-element; the region solved next is always the one with the fewest remaining candidates, ties
broken by ascending region id, and the search backtracks. Same fabric in, same table out.

Measured composition of the 40 sets: **28 two-element, 11 three-element, 1 one-element**. The
one-element set is `c05/r06` — the only surveyed region whose ground licenses just two kinds, both
of which are already spent by a committed record. A one-element kind set is legal and anticipated:
`Z3` floors `resources` at two **entries**, and `Z6` compares **kinds** as a deduped set, so two
resources of one kind is a one-element set — `Z6`'s own comment says so.

---

## 2. The ten that cannot be derived — read this before Task 11

Ten records were written before the redraw and are canon. **No geography pairs them with surveyed
ground, and none can be invented that would be honest.** Two independent measurements, both
reproducible:

1. **Position.** In the resolved world every pinned civil place carries the fabric region it stands
   in. All six named cluster-1 towns (Cindervast, Embervale, Gildmark, Millcross, Norhollow,
   Rooktide) and every pinned cluster-1 landmark that resolves at all — Ashvale Front, Emberdown,
   Gildmark Head, Hollowmarch, Meltwash Terrace, Millcross Ford, Northern Icefield, Rooktide Reach,
   the Saltmire, the Meltwash, the Eastern Hills, the Expedition Camp — sit on **reported** regions:
   `c02/r11`, `r12`, `r18`, `r19`. `c-lm-thornveil` sits on no owned region at all. Wealdmarch's ten
   **surveyed** regions carry only unnamed generated villages, `c02/s01`…`s10`. The two sets do not
   intersect, and the nearest surveyed region to Millcross is 41.5 km away — near enough to look like
   a join and far enough to be a lie.

   **World-wide the claim is narrower than Task 9's, and measured here in both directions:** of the
   40 hand-pinned canon places in the resolved world, **39 stand on reported ground, one stands on
   no owned region, and exactly one stands on surveyed ground** — `c-lm-brightfall-leap`, in
   `c09/r03`. That one is not a placeholder problem, it is an inheritance: the zone on `c09/r03`
   takes **Brightfall Leap** as a landmark instead of minting a second name for the same ground
   (§4). Cluster 1 is the continent with no such inheritance available, which is the whole of the
   problem below.

2. **Economy.** Nor can the licence rule stand in for geography. Of the ten committed kind sets,
   **`hollowmarch`'s `ore` is licensed by no surveyed region on Wealdmarch at all** — c02's ten
   surveyed regions carry no rock, upland, scree, badland or karst biome and no ore-bearing landform
   — so there is no assignment of the ten committed zones onto Wealdmarch's surveyed ground on which
   every record's resources are something the ground can yield. Under the join Task 9 committed,
   five of the ten rows are licensed and five are not (`ashvale-front`, `cindervast`, `hollowmarch`,
   `millcross-ford`, `thornveil`).

**So these ten rows are marked `PLACEHOLDER` in the `join` column and are exempt from the licence
rule.** Their kind sets and landmark names are transcribed from the shipped files and are canon;
only the `region` join is a placeholder, and it is the alphabetical-against-ascending-region-id
pairing Task 9 committed, preserved byte for byte rather than replaced with a better-looking
fiction. **A Task 11 author must not write a Wealdmarch sentence that depends on the region join** —
there is nothing there to depend on. Task 9 already recorded this: Task 11 Step 1 can verify the
prose, not the join.

Resolving it is an owner decision, not an authoring one. The alternatives, with their costs:

| | what it does | what it costs |
| --- | --- | --- |
| **A. keep the placeholder** | ten rows carry a join with no meaning; nothing false is published, because no committed prose cites a region and no renderer draws one | the 40:1 region-to-record bijection `Z2` enforces is a fiction on a quarter of its rows |
| **B. join the reported ground** | each committed zone takes the region its own pin actually stands in; Wealdmarch's ten surveyed regions get ten NEW records | `Z2` must accept reported-region records and several records per region (`c02/r18` hosts five); ten records beyond the plan's 40 |
| **C. re-survey the canon ground** | flip `c02/r11`, `r12`, `r18`, `r19` to surveyed so the true join is legal | a world regeneration; the surveyed count moves off 40, which moves E-C5, the budgets, the atlas and the render-lock; and it contradicts the honest-frontier claim that this is the only ground anyone walked |
| **D. decouple** | the ten keep their names and drop the region join entirely; Wealdmarch's ten surveyed regions get ten new records under new names | `region` becomes optional, which weakens `Z1`/`Z2` for every record; the canon ten stop being zones |

---

## 3. Rules this table keeps

1. **The ten committed records keep their exact kind sets and landmark names.** Nothing about a
   shipped record changes. Only its `region` join was ever added, and that join is a placeholder.
2. **Every kind comes from `crop, timber, ore, fuel, stone, water, forage, salvage` and nowhere else.**
3. **Every derived row's kinds are licensed by its own region's measured ground** (§1 step 2). The ten
   placeholder rows are exempt and say so.
4. **Two-element sets are spent before three-element sets**, and a one-element set only where no pair
   survives — so the cheap space stays legible for the deferred town-plan zones.
5. **Names come from the landmass's own register.** `registers.json`'s `continentRegister` fixes the
   register per landmass; the classifier comes from the **landform group**, not the dialect, because
   a classifier tells a reader what the place *is*. Minting goes through the Plan D generator
   (`tools/mapforge/lib/name-gen.mjs`), so `reserved.json` is a hard exclusion by construction — a
   re-mint can never put a canon name on different ground. **No zone slug reuses a reserved canon
   name**, which follows directly from §2: no canon place stands on surveyed ground, so no surveyed
   region may borrow its name.
6. **Per-continent counts are the fabric's own**, not a target copied from the plan: Wealdmarch 10,
   Coldreach 6, Stonemoor 7, Thirstwold 7, Reedstrand 3, Driftholt 3, Wracklow 2, Brightfall 1,
   Ashen Spar 1 = 40. Rimewall Cap and the three remaining chains carry **zero** surveyed ground —
   honest frontier, end to end.

## 4. How the 60 new landmark names were minted, so a re-mint reproduces them

Each zone gets a name and two landmarks from three deterministic draws (`sha256` over the stream
`zone:`/`lm1:`/`lm2:` plus the region id), all in the landmass's register. The zone and the first
landmark take the `stem-classifier` form, the second landmark the `of-form`, so no landmass comes out
a column of identical trochees. The classifier **rotates by the region's ordinal on its own
landmass**, which is why six fluvial regions on Coldreach do not all come out `<stem> Ford`.
A candidate is redrawn if it is already used anywhere in the world, if it is reserved, if it carries
a triple letter, if the classifier also appears inside the stem, or if its **stem** comes within 3
phonemes of another stem on the same landmass — confusability is judged on the stem, the way
`G-NAME-SOUND` judges it, because comparing whole titles lets two near-identical stems through on the
strength of words that are not the name.

**Inheritance beats minting.** Where a hand-pinned canon place already stands inside a surveyed
region, the zone takes that place's name as a landmark and mints only the remainder — one region
today, `c09/r03`, which inherits **Brightfall Leap**. The zone slot is never inherited: a zone is the
whole region, not the one thing standing in it. An inherited name is canon and is judged by the
register it was authored in, not re-judged by this table's.

`G-NAME-REGISTER` / `G-NAME-SOUND` / `G-NAME-PROSODY` sweep the resolved world's **place** documents,
not zone landmarks — so the discipline above is kept here by construction and by
`scripts/tests/zone-allocation.test.mjs`, and no gate elsewhere is claiming to enforce it.

---

## 5. The table

`join` = `derived` means the row's kinds are licensed by its own region and its names were minted
from that region's register and landform group. `join` = `PLACEHOLDER` means §2: canon content on a
region join no geography supports.

<!-- BEGIN GENERATED TABLE -->

| zone | continent | region | terrain | kinds | landmarks | join |
| --- | --- | --- | --- | --- | --- | --- |
| ashvale-front | Wealdmarch | c02/r01 | headland | crop, salvage | The grave rows / The abandoned cut lines | PLACEHOLDER |
| cindervast | Wealdmarch | c02/r02 | headland | fuel, salvage | The Giving King statues / The dead gate | PLACEHOLDER |
| emberdown | Wealdmarch | c02/r08 | headland | crop, fuel | The terraced ledges / The adits | PLACEHOLDER |
| gildmark-head | Wealdmarch | c02/r10 | headland | salvage, stone | The mirror tower / The mire's bar | PLACEHOLDER |
| hollowmarch | Wealdmarch | c02/r14 | cloud-forest | ore, timber | The tally boards / The palisade line | PLACEHOLDER |
| meltwash-terrace | Wealdmarch | c02/r16 | headland | forage, water | The expedition camp / The gravel bars | PLACEHOLDER |
| millcross-ford | Wealdmarch | c02/r21 | headland | crop, stone | The cart queue / The mill-wheel housing | PLACEHOLDER |
| northern-icefield | Wealdmarch | c02/r24 | cloud-forest | stone, water | The oath-gate / The crevasse shelf | PLACEHOLDER |
| rooktide-reach | Wealdmarch | c02/r28 | headland | forage, salvage | The barge-cranes / The rook flats | PLACEHOLDER |
| thornveil | Wealdmarch | c02/r30 | headland | timber, water | The heartwood / The crown thickets | PLACEHOLDER |
| fastholt-ford | Coldreach | c03/r06 | tundra-steppe | forage, stone | Halehaven Roads / Reach out of Coldwall | derived |
| wracksound-race | Coldreach | c03/r10 | tundra-steppe | crop, water | Snowwall Reach / Confluence beyond Stormhold | derived |
| snowfast-reach | Coldreach | c03/r12 | headland | forage, timber | Skerrybreak Stack / Ford out of Driftshore | derived |
| snowshore-confluence | Coldreach | c03/r15 | headland | crop, forage | Skerrywall Ford / Race beyond Lodeness | derived |
| skerryholt-ford | Coldreach | c03/r18 | headland | crop, forage, water | Driftspar Race / Reach past Driftsound | derived |
| cairnwall-race | Coldreach | c03/r22 | headland | crop, timber | Driftness Geo / Confluence out of Stormspar | derived |
| clintmoor-head | Stonemoor | c04/r01 | karst-plateau | crop, forage, ore | Paverake Fenster / Geo under Dolinflow | derived |
| grykestone-fenster | Stonemoor | c04/r07 | karst-plateau | crop, ore, stone | Dolinrake Geo / Pot of Grykemoor | derived |
| scarclint-stair | Stonemoor | c04/r12 | karst-plateau | crop, ore | Karnmoor Confluence / Sink under Fenlack | derived |
| slategill-stack | Stonemoor | c04/r15 | karst-plateau | ore, stone, water | Pavemoor Sink / Roads under Shalestone | derived |
| dolingill-sink | Stonemoor | c04/r19 | karst-plateau | ore, stone | Paveclint Mere / Stair under Sinkstone | derived |
| sinkshaft-fenster | Stonemoor | c04/r25 | karst-plateau | crop, ore, water | Stonefell Geo / Pot of Chalkgrike | derived |
| karnstone-geo | Stonemoor | c04/r28 | karst-plateau | crop, ore, salvage | Clintlack Pot / Head through Tarnshaft | derived |
| sabkhwaste-pan | Thirstwold | c05/r06 | sand-sea | stone | Barchanvent Waste / Barchan of the Pumicwater | derived |
| pumicvent-race | Thirstwold | c05/r15 | sand-sea | salvage, water | Emberwater Barchan / Confluence under Thirstburn | derived |
| emberspar-reach | Thirstwold | c05/r17 | sand-sea | crop, salvage, stone | Fumevent Yardang / Ford past Barchanreach | derived |
| searvent-confluence | Thirstwold | c05/r20 | sand-sea | crop, stone, water | Charburn Pan / Race of the Searwaste | derived |
| yardwind-pan | Thirstwold | c05/r21 | sand-sea | ore, water | Cinderwold Saddle / Barchan of the Siroccburn | derived |
| ergwind-waste | Thirstwold | c05/r23 | sand-sea | ore, salvage | Dunewater Horn / Yardang across Fumewold | derived |
| fumeflat-reach | Thirstwold | c05/r28 | sand-sea | crop, salvage, water | Pumicwaste Rake / Ford of the Regflat | derived |
| siltrun-head | Reedstrand | c06/r06 | headland | fuel, water | Marramlow Carr / Geo among Loamlow | derived |
| siltbar-roads | Reedstrand | c06/r07 | headland | fuel, timber | Mereeyot Reach / Stack among Wrackrun | derived |
| quillholm-geo | Reedstrand | c06/r08 | headland | salvage, timber | Wrackfall Quag / Head below Lagoonbar | derived |
| osierspit-head | Driftholt | c07/r01 | headland | crop, forage, stone | Withyshallow Saddle / Geo of the Willowspit | derived |
| willowlobe-roads | Driftholt | c07/r03 | headland | crop, ore, timber | Loamholm Horn / Stack of the Osierreef | derived |
| marramspit-geo | Driftholt | c07/r06 | headland | forage, ore | Reedreef Rake / Head within Loamspit | derived |
| lagoonlobe-head | Wracklow | c08/r06 | headland | forage, fuel | Reedfall Eyot / Geo between Siltreef | derived |
| withybar-roads | Wracklow | c08/r08 | bramble | fuel, stone | Brightspit Skerry / Stack among Reedholm | derived |
| brightrun-head | Brightfall | c09/r03 | cloud-forest | stone, timber | Brightfall Leap / Geo between Sedgestrand | derived |
| emberburn-cone | Ashen Spar | c10/r01 | volcanic-arc | fuel, ore | Searflat Cleft / Tube under Searwaste | derived |

<!-- END GENERATED TABLE -->
