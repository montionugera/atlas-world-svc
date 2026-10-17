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
and the **ten legacy** `content/zones/zone-*.json` records — the ones named for reserved canon places
— by `scripts/lib/zone-allocation.mjs`. `content/zones/` also holds records written **for derived
rows** (six as of Task 11); those are checked against this table and never fed into it.
Do not hand-edit the rows: change the inputs or the rule and re-run
`node scripts/derive_zone_allocation.mjs --write`. `scripts/tests/zone-allocation.test.mjs` re-derives
the whole table and fails on any drift.

---

## 1. What the allocation keys on

The allocation keys on **the ground itself**, in three steps. Two of them are measurement. The middle
one is authored judgement — stated once, in code, and machine-checked; it is not a measurement and
this file does not claim it is.

**Step 1 — the ground, measured.** Every surveyed region is read out of the fabric with only the
fields the generator wrote: `terrainKind`, `biomeShares`, the `instances[].type` landforms inside it,
and the dominant landform **group** taken off the instance handles (`c06/coastal/h-15392d`), ties
broken alphabetically. One region — `c05/r06`, 100% desert — carries no landform instances at all, so
its group falls back to its dominant biome, which is the only evidence there is.

**Step 2 — the licence (AUTHORED).** An affordance table maps each of the eight kinds to the measured evidence
that would let a person carry that kind out of a region: `crop` wants meadow, a river or a spring;
`timber` wants standing wood; `ore` wants rock, karst or an exposure that reaches it; `fuel` wants
peat, ash, lava or bramble; `stone` wants limestone country, bare rock or desert lag; `water` wants
something running, ponded or held in rock; `forage` wants anything that grows untended; `salvage`
wants a wrecking coast or an erg that buries a caravan and gives it back. The table lives in
`scripts/lib/zone-allocation.mjs` as `LICENCE`, one predicate per kind, each naming its own evidence.
**A zone may only be given kinds its own region licenses** — which is what lets Tasks 11–14 justify a
kind in prose without contradicting the ground the zone stands on.

**Where the licence's boundary is, and why it matters.** The predicates are a judgement about what
ground affords, and a different judgement would move rows. Two boundaries are load-bearing enough to
publish:

- **`ore` counts rock and karst and the exposures that reach them — but not fluvial rock cuts.**
  `canyon`, `slot-canyon`, `knickpoint-gorge` and `natural-bridge` appear on `c02/r01` and are in no
  predicate at all. **If `ore` counted them, `c02/r01` would license ore and §2's second measurement
  would have to be re-run.** That measurement is one of the two pillars of the placeholder ruling, so
  its sensitivity to one list belongs on the page, not in a commit message.
- **`water` does not read off dry features.** `wadi` and `playa` were in the water list and are out:
  a dry watercourse and a dry lake bed are named for the water that is *not* there, and licensing
  water off them put a drinkable spring in a 92.8%-desert region. The regression case is in the gate.

The gate holds the licence to being a rule that can refuse: no predicate may fire on all 40 surveyed
regions or on none, and the per-landmass **negatives** are asserted outright — Wealdmarch yields no
ore, Stonemoor no timber and no fuel, Thirstwold no timber, fuel or forage, Ashen Spar no crop,
timber, water, forage or salvage. Loosen a predicate to make a row pass and one of those goes red.

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

Ten records were written before the redraw and are canon. **No geography places them on surveyed
ground.** Three measurements, all reproducible by the gate:

1. **Position.** In the resolved world every pinned civil place carries the fabric region it stands
   in. Of the **41** hand-pinned canon places in the world — 8 towns and 33 landmarks — **39 stand on
   reported ground, 1 stands on no owned region at all (`c-lm-thornveil`), and exactly 1 stands on
   surveyed ground**: `c-lm-brightfall-leap`, in `c09/r03`, on Brightfall. On cluster 1 the count is
   zero. All six named cluster-1 towns and every resolvable cluster-1 landmark — Ashvale Front,
   Emberdown, Gildmark Head, Hollowmarch, Meltwash Terrace, Millcross Ford, Northern Icefield,
   Rooktide Reach, the Saltmire, the Meltwash, the Eastern Hills, the Expedition Camp — sit on
   `c02/r11`, `r12`, `r18` or `r19`, all reported. Wealdmarch's ten **surveyed** regions carry only
   unnamed generated villages, `c02/s01`…`s10`.

   How far away: from Millcross's pin `[98.2, 152.6]` the nearest surveyed region is `c02/r21` —
   **34.64 km to its boundary, 42.36 km to its centroid**. (An earlier draft and Task 9's own record
   both published "41.5 km", which matches neither metric; the figure above is measured here.)

2. **Economy.** Nor can the licence rule stand in for geography. **`hollowmarch`'s committed `ore` is
   licensed by no surveyed region on Wealdmarch** — c02's ten surveyed regions carry no rock, upland,
   scree, badland or karst biome and no ore-bearing landform — so no assignment of the ten committed
   zones onto Wealdmarch's surveyed ground has every record's resources be something the ground can
   yield. Under the join Task 9 committed, **five of ten rows are licensed and five are not**
   (`ashvale-front`, `cindervast`, `hollowmarch`, `millcross-ford`, `thornveil`).

3. **And a third thing, which is not about the join at all.** `c02/r11`, `r12`, `r18` and `r19` — the
   reported regions the canon pins actually stand in — **do not license `ore` either.** Hollowmarch's
   ore is unlicensed on its *own* ground. **The redraw invalidated a piece of committed prose
   independently of any zone join**, and no choice made in this table fixes that. It is filed and it
   is bigger than this task.

**So these ten rows are marked `PLACEHOLDER`, are exempt from the licence rule, and publish no
`terrain`.** Which ten is itself derived, not a list: a committed record is legacy **iff its zone
slug is a reserved canon name**, which is exactly this set — every one of the ten is named for a
hand-pinned canon place, and rule 5 below means no minted slug can ever be. That matters from Task 11
on: `content/zones/` now also holds records written **for derived rows**, and those are checked
*against* this table rather than transcribed into it. Before the criterion was derived, writing the
first such record flipped its row to `PLACEHOLDER` and blanked its terrain — the table would have
published "a join no geography supports" over ground it had derived itself. Their kind sets and landmark names are transcribed from the shipped files and are canon;
only the `region` join is a placeholder — the alphabetical-against-ascending-region-id pairing Task 9
committed, preserved byte for byte. **A Task 11 author must not write a Wealdmarch sentence that
depends on the region join.** Task 9 recorded the same: Task 11 Step 1 can verify the prose, not the
join.

**The placeholder is not inert, and this file previously said it was.** Nothing renders a zone's
region — the only readers of `content/zones/` are `check_content.mjs`, this table's own generator and
the tests — but `doc.region` **is** `Z1`'s join subject and `Z2`'s bijection key, so the placeholder
is load-bearing inside the gate. That is also why the `terrain` cell is now blank on these ten rows:
rendering the region's terrain beside the zone's name published "northern-icefield … cloud-forest"
and "hollowmarch … cloud-forest", which the records' own prose denies.

### The alternatives, measured

Resolving this is an owner decision, not an authoring one. Two of these were missed by the first
draft and found in review; both are **strictly better placeholders than the one that shipped**.

| | what it does | measured cost |
| --- | --- | --- |
| **A. keep the alphabetical placeholder** (shipped) | ten rows carry a join with no meaning | scores **5 of 10** on the licence — half the rows put a resource on ground that cannot yield it. Cheapest, and the weakest |
| **A′. licence-maximising placeholder** | re-pair the ten against c02's ten surveyed regions to maximise licensed rows; deterministic (maximum bipartite matching, ties by ascending region id) | scores **9 of 10** — only `hollowmarch` is impossible, for the reason in §2.2. Costs **no content**: ten `region` fields change, no prose moves. **If a ruling is wanted with no further work, this is the one to take** |
| **A″. `requires`-respecting placeholder** | pair each zone with a surveyed region that has the landform its own pin declares in `requires` | **7 of 10** zones have at least one such region (`cindervast`, `emberdown`, `gildmark-head`, `hollowmarch`, `meltwash-terrace`, `millcross-ford`, `thornveil`); `ashvale-front`, `northern-icefield` and `rooktide-reach` have none. The shipped join satisfies **4 of those 7** |
| **B. join the reported ground** | each committed zone takes the region its own pin stands in; Wealdmarch's ten surveyed regions get ten NEW records | `Z2` must accept reported-region records and several per region — `c02/r18` would host **4** zone records, `c02/r11` 3. **Not feasible as stated for all ten**: `c-lm-thornveil` stands in no owned region, so one of the ten has nowhere to go. Ten records beyond the plan's 40 |
| **C. re-survey the canon ground** | flip `c02/r11`, `r12`, `r18`, `r19` to surveyed so the true join is legal | a world regeneration; the surveyed count leaves 40, which moves E-C5, the budgets, the atlas and the render-lock; and it contradicts the honest-frontier claim that this is the only ground anyone walked |
| **D. decouple** | the ten keep their names and drop the region join; Wealdmarch's ten surveyed regions get ten new records under new names | `region` becomes optional, which weakens `Z1`/`Z2` for every record; the canon ten stop being zones |

**Why A′ was not simply taken here.** It is better on a stated, checkable criterion and costs nothing
— but it is still a choice, and it would replace Task 9's stated, reproducible pairing with one
selected to look consistent while the geographic fiction underneath is exactly as false. Making the
table look more principled than the world is, without a ruling, is the failure this section exists to
avoid. The measurement is published so the ruling is a decision and not a guess.

## 3. Rules this table keeps

1. **The ten LEGACY records keep their exact kind sets and landmark names.** Nothing about a
   shipped record changes. Only its `region` join was ever added, and that join is a placeholder.
   A record written for one of the **thirty derived rows** is the other way round: this table is the
   authority on its slug, region, kind set and landmark names, and the gate fails the record — never
   the table — when they disagree.
2. **Every kind comes from `crop, timber, ore, fuel, stone, water, forage, salvage` and nowhere else.**
3. **Every derived row's kinds are licensed by its own region's measured ground** (§1 step 2). The ten
   placeholder rows are exempt and say so.
4. **Two-element sets are spent before three-element sets**, and a one-element set only where no pair
   survives. **This did not leave cheap space for the seven deferred town-plan zones (E-C9), and the
   earlier draft of this rule claimed it did.** Measured: all **28** two-element sets are spent,
   **0** remain; what is left is **45** three-element sets, **7** one-element and every set of four or
   more — 215 of 255 free in total. A deferred zone can be allocated, but only as a triple or a
   singleton. Reserving pairs would mean pushing triples onto the licence-rich karst and volcanic
   regions that can carry a third kind in prose; that is a re-pack, and it is filed, not done here.
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

## 4. How the 59 minted landmark names were made, so a re-mint reproduces them

30 zone names and **59** landmark names are minted; the sixtieth landmark is inherited, not minted
(`c09/r03` takes Brightfall Leap — see below). Each zone gets a name and two landmarks from three
deterministic draws (`sha256` over the stream
`zone:`/`lm1:`/`lm2:` plus the region id), all in the landmass's register. The zone and the first
landmark take the `stem-classifier` form, the second landmark the `of-form`, so no landmass comes out
a column of identical trochees. The classifier **rotates by the region's ordinal on its own
landmass**, which is why six fluvial regions on Coldreach do not all come out `<stem> Ford`.
A candidate is redrawn if it is already used anywhere in the world, if it is reserved, if it carries
a triple letter, if the classifier also appears inside the stem, or if its **stem** comes within 3
phonemes of another stem on the same landmass — confusability is judged on the stem, the way
`G-NAME-SOUND` judges it, because comparing whole titles lets two near-identical stems through on the
strength of words that are not the name.

Two further rules came out of review, and both were minting real defects before they existed:

- **No minted name may be a name the DRAWN world already publishes.** `used` was seeded from
  `reserved.json`, the committed records and the hand-pinned canon places — but not from the **377**
  names the resolved world renders on its own sheets. Five derived zone names had therefore landed on
  a name another place already wore: `wracksound-race` (`c03/r10`) against the delta *Wracksound
  Race* in `c03/r15`, `lodespar-confluence` (`c03/r15`) against the levee *Lodespar Confluence* in
  `c03/r18`, plus `grykestone-fenster`, `flagsink-stair` and `siroccwold-waste`. Barring those names
  re-minted **26** of the 40 rows' names; **no row's region, terrain, kind set or join changed**.
  Whole names are barred and not stems, and that is a scope choice rather than a capacity one: the
  drawn world's stems occupy 68 / 110 / 66 / 60 / 52 of each register's 16 x 12 = 192 combinations,
  so there is room — but `Z6` and `G-NAME-SOUND` both judge the name a reader actually meets, which
  is what was going wrong.
- **A stem is spoken for once in the whole world.** Barring whole *names* was not enough: "Race of
  the Searwaste" and "Tube under Searwaste" were two different places, on two different landmasses,
  wearing one name. Stems are now globally unique — 90 minted names, 90 distinct stems.
- **No register morpheme is used more than twice on one landmass.** Before this, Thirstwold carried
  `barchan` five times and `waste` five times, and Stonemoor `sink` and `stone` five times each — a
  landmass that reads as one word repeated. The ceiling relaxes only if the register genuinely runs
  out of room (16 onsets x 12 rimes against up to 21 names on a landmass). Measured now: **2**.

**A warning Task 11–14 authors must not miss: a register stem is PHONOLOGY, not description.** The
onsets and rimes are dialect material, so a minted name may contain a word that reads like a
landform and means nothing — `Barchanvent`, `Pumicwater`, `Emberwater`. **There is no barchan and no
water in those places unless the region's own measured landforms say so.** Write from the `region`,
`terrain` and `kinds` columns and from the fabric; never from what a name sounds like. For the same
reason the classifier names the region's dominant landform **group**, not a specific instance:
`fastholt-ford` is fluvial country, and the fabric declares no `ford` landform inside it.

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
| ashvale-front | Wealdmarch | c02/r01 | — | crop, salvage | The grave rows / The abandoned cut lines | PLACEHOLDER |
| cindervast | Wealdmarch | c02/r02 | — | fuel, salvage | The Giving King statues / The dead gate | PLACEHOLDER |
| emberdown | Wealdmarch | c02/r08 | — | crop, fuel | The terraced ledges / The adits | PLACEHOLDER |
| gildmark-head | Wealdmarch | c02/r10 | — | salvage, stone | The mirror tower / The mire's bar | PLACEHOLDER |
| hollowmarch | Wealdmarch | c02/r14 | — | ore, timber | The tally boards / The palisade line | PLACEHOLDER |
| meltwash-terrace | Wealdmarch | c02/r16 | — | forage, water | The expedition camp / The gravel bars | PLACEHOLDER |
| millcross-ford | Wealdmarch | c02/r21 | — | crop, stone | The cart queue / The mill-wheel housing | PLACEHOLDER |
| northern-icefield | Wealdmarch | c02/r24 | — | stone, water | The oath-gate / The crevasse shelf | PLACEHOLDER |
| rooktide-reach | Wealdmarch | c02/r28 | — | forage, salvage | The barge-cranes / The rook flats | PLACEHOLDER |
| thornveil | Wealdmarch | c02/r30 | — | timber, water | The heartwood / The crown thickets | PLACEHOLDER |
| fastholt-ford | Coldreach | c03/r06 | tundra-steppe | forage, stone | Halehaven Roads / Reach out of Coldwall | derived |
| snowfast-race | Coldreach | c03/r10 | tundra-steppe | crop, water | Keelshore Reach / Confluence beyond Stormhold | derived |
| galeness-reach | Coldreach | c03/r12 | headland | forage, timber | Haulsound Stack / Ford past Cairnbreak | derived |
| driftway-confluence | Coldreach | c03/r15 | headland | crop, forage | Bearreach Ford / Race beyond Skerryspar | derived |
| snowness-ford | Coldreach | c03/r18 | headland | crop, forage, water | Rimehold Race / Reach off Keelfast | derived |
| lodereach-race | Coldreach | c03/r22 | headland | crop, timber | Haulholt Geo / Confluence north of Fastbreak | derived |
| grikepot-head | Stonemoor | c04/r01 | karst-plateau | crop, forage, ore | Paverake Fenster / Geo under Dolinflow | derived |
| shalegill-fenster | Stonemoor | c04/r07 | karst-plateau | ore, water | Scarlack Geo / Pot under Sinkgrike | derived |
| tarnmoor-stair | Stonemoor | c04/r12 | karst-plateau | crop, ore | Fenshaft Confluence / Sink through Flagclint | derived |
| grykefell-stack | Stonemoor | c04/r15 | karst-plateau | ore, stone, water | Karnstone Sink / Roads of Slatesink | derived |
| limepot-sink | Stonemoor | c04/r19 | karst-plateau | ore, stone | Shalesink Mere / Stair under Clintfell | derived |
| clintlack-fenster | Stonemoor | c04/r25 | karst-plateau | crop, ore, stone | Paveshaft Geo / Pot at Limerake | derived |
| flaggrike-geo | Stonemoor | c04/r28 | karst-plateau | crop, ore, water | Scarclint Pot / Head below Slatemoor | derived |
| thirstreach-pan | Thirstwold | c05/r06 | sand-sea | stone | Searcone Waste / Barchan of the Pumicwater | derived |
| charwaste-race | Thirstwold | c05/r15 | sand-sea | salvage, water | Glasswold Barchan / Confluence beyond Dunespar | derived |
| siroccvent-reach | Thirstwold | c05/r17 | sand-sea | crop, ore, salvage | Fumeflat Yardang / Ford past Sabkhpan | derived |
| yardburn-confluence | Thirstwold | c05/r20 | sand-sea | crop, stone, water | Cindersea Pan / Race within Siroccwaste | derived |
| thirstvent-pan | Thirstwold | c05/r21 | sand-sea | ore, salvage | Searwind Saddle / Barchan across Charspar | derived |
| regflat-waste | Thirstwold | c05/r23 | sand-sea | ore, salvage, stone | Regwind Horn / Yardang across Emberwater | derived |
| barchanburn-reach | Thirstwold | c05/r28 | sand-sea | crop, salvage, stone | Pumicsea Rake / Ford past Fumewold | derived |
| siltrun-head | Reedstrand | c06/r06 | headland | fuel, water | Marramlow Carr / Geo between Lagoonmere | derived |
| sedgebar-roads | Reedstrand | c06/r07 | headland | salvage, timber | Quillfall Reach / Stack below Brightlobe | derived |
| wrackeyot-geo | Reedstrand | c06/r08 | headland | crop, fuel, timber | Osierholm Quag / Head between Bitternstrand | derived |
| osierspit-head | Driftholt | c07/r01 | headland | crop, forage, stone | Withyshallow Saddle / Geo at Merefall | derived |
| quillstrand-roads | Driftholt | c07/r03 | headland | fuel, timber | Reedmere Horn / Stack at Alderrun | derived |
| brightreef-geo | Driftholt | c07/r06 | headland | forage, ore | Siltbar Rake / Head below Tidallobe | derived |
| lagoonlobe-head | Wracklow | c08/r06 | headland | forage, fuel | Reedfall Eyot / Geo between Siltreef | derived |
| withybar-roads | Wracklow | c08/r08 | bramble | fuel, stone | Brightspit Skerry / Stack at Willowshallow | derived |
| alderlow-head | Brightfall | c09/r03 | cloud-forest | stone, timber | Brightfall Leap / Geo between Sedgestrand | derived |
| emberburn-cone | Ashen Spar | c10/r01 | volcanic-arc | fuel, ore | Searflat Cleft / Tube within Regspar | derived |

<!-- END GENERATED TABLE -->
