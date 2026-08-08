# DR-003 — The Season 1 content budget

**Level:** L2 · **Role:** Systems Designer (charter §2.4 — the numbers are that role's domain) · **Date:** 2026-08-02
**Parents (not reopened):** `DR-001-L1-scope.md` §6 and §6.4 · `A1-geography-cluster1.md` §4.2
**Sub-decisions already settled:** `DR-004-starter-ground.md` (the starter ground binds, it does not retire) · `DR-005-act-axis.md` (a separate era axis; acts 1–5 frozen as history)
**Machine-readable form:** `content/season-1-budget.json` · **Report:** `scripts/report_season1.mjs`

<div class="callout success">
<strong>Parent records resolved.</strong> <code>DR-001-L1-scope.md</code>, <code>A1-geography-cluster1.md</code>, <code>DR-004-starter-ground.md</code> and <code>DR-005-act-axis.md</code> all landed on <code>release/1.6</code> when <code>F-024</code> shipped (2026-08-02), together with <code>content/bestiary/bestiary.json</code> and <code>content/maps/cluster1-geography.json</code>. Every citation above now resolves, and <code>bestiary-designs</code> measures <mark>116/116</mark> where it previously could not be read at all. <code>zones</code> is no longer blocked: <code>scripts/lib/season1.mjs</code> now exports a <code>zones</code> measure and the line reports <mark>10/10 met</mark>, counted on the geography zone id. The <code>region-*</code> keyspace rename (<code>I-056</code> §6.1, item 4) is still separately owed and still blocks quest-region authoring.
</div>

<div class="callout danger">
<strong>This record states a budget and nothing else.</strong> It does not decide progression or XP,
PvP, the reward law, the third register, or the present-tense antagonist. Those are listed in §6 and
stay where they were routed. A scope document that quietly settles another role's question is the
failure mode the charter §2.4 exists to prevent.
</div>

---

## 1. What this record is

Season 1 is **cluster 1** — the ten zones `A1-geography-cluster1.md` §4.2 names, at the cadence
`DR-001-L1-scope.md` §6 chose. This record states how much content that is: how many creatures, how
many quests, how much art, and which systems must exist before any of it can be authored.

`content/season-1-budget.json` is the **source of truth** for every number below. The table in §3 is
its readable face. If the two ever disagree, the record is wrong and the record gets fixed — never
the data. `scripts/report_season1.mjs` measures the repository against the JSON and prints the
delta; it always exits 0, because the failure mode this budget exists to stop is drift *upward*, and
a gate that stays red for months only trains people to ignore it.

## 2. What this supersedes

`role-systems-designer-scale.md` §1.2–1.4 derives **32 outdoor zones · 384 species · 560 quests**
from a 24,000-unit continent.

<div class="callout warn">
<strong>Those three figures were never adopted as a target.</strong> They are arithmetic
consequences of a scale assumption, stated as such. In the absence of a written budget they came to
function as a plan anyway, and every piece of authoring work was being measured against them —
which is how the project came to describe itself as at 5% of its quest need against a number nobody
ever chose. <mark>This record supersedes all three.</mark> The Season 1 targets are the ones in §3.
</div>

The derivation in `role-systems-designer-scale.md` is not withdrawn as analysis. It is withdrawn as
a target.

## 3. The budget

Every line in `content/season-1-budget.json`, with its target, its measured actual, and its cited
source. Actuals are the verbatim output of `node scripts/report_season1.mjs` on `feat/F-025` at the
time of adoption — not hand-counted.

| Line | Target | Actual | Delta | Source |
|---|---|---|---|---|
| `mob-bases` — implemented mob types (bases) | **30** | 6 | 24 short | `role-systems-designer-scale.md` §1.3, scaled 32 zones to 10; pinned at 30 bases × 4 variants |
| `bestiary-designs` — bestiary designs | **116** | — *(unmeasurable on this branch)* | — | measured; no net-new designs, a re-band pass over ~54 stranded ones instead |
| `quests-act-independent` — quests with no act or event gate | **90** | 8 | 82 short | `DR-005-act-axis.md`; giver-liveness is a manual canon read on top of this count |
| `art-town` — town key art | **6** | 0 | 6 short | owner's art-class funding, 2026-08-01 |
| `art-bestiary` — bestiary art | **30** | 0 | 30 short | owner's art-class funding, 2026-08-01; one image per mob base |
| `zones` — cluster-1 zones with a complete content record | **10** | 10 | met | `A1-geography-cluster1.md` §4.2; counted by `scripts/lib/season1.mjs`'s `zones` measure over `content/zones/`, keyed on the geography zone id |
| `spawn-entries` — spawn entries | **120** | — *(blocked)* | — | 12 species per zone × 10 zones |
| `world-state-systems` — observable world-state systems | **1** | — *(blocked)* | — | `DR-001-L1-scope.md` §6.4(1) and PX-V2: the bar is one, the current count is zero |

**The two blocked lines report no actual because nothing countable exists yet, and the reason is
part of the budget:**

- `spawn-entries` — blocked because **the variant axis does not exist on `MobTypeConfig`** (open
  question q2, §6).
- `world-state-systems` — blocked by **P3**, the buried-ground design.

<div class="callout info">
<strong>Two actuals look like failures and are not.</strong>
<code>bestiary-designs</code> reports <em>unmeasurable</em> (an <code>ENOENT</code> on
<code>content/bestiary/bestiary.json</code>) and <code>art-town</code> reports <strong>0</strong>,
because the bestiary corpus and the six placeholder town PNGs live on the unshipped
<code>feat/F-024</code> branch and are not on this one. Both readings are <em>correct for this
branch</em>. When the two branches meet, <code>bestiary-designs</code> measures 116 — target met on
the aggregate, with the re-band pass still owed — and <code>art-town</code> measures against real
<code>art:town-*</code> keys. Neither number was tidied to look better here.
</div>

<div class="callout warn">
<code>art-bestiary</code> counts manifest keys under the <code>art:mob-</code> prefix, which no
manifest entry uses yet. It therefore reads <strong>0 by counting nothing</strong> rather than by
measuring an absence. If the art pipeline later mints bestiary keys under a different prefix, this
line reads 0 forever and looks correct. The prefix is part of the budget's contract with the art
pipeline, not an implementation detail of the report.
</div>

**The report at adoption, verbatim:**

```
Season 1 budget — cluster 1 — docs/worldbuilding/DR-003-season-1-budget.md
line                      target  actual  note
------------------------------------------------------------------------------
mob-bases                 30      6       24 short
bestiary-designs          116     -       unmeasurable: ENOENT: no such file or directory, open '.../content/bestiary/bestiary.json'
quests-act-independent    90      8       82 short
art-town                  6       0       6 short
art-bestiary              30      0       30 short
zones                     10      10      met
spawn-entries             120     -       blocked: the variant axis does not exist on MobTypeConfig (spec 9 q2)
world-state-systems       1       -       blocked: P3 - buried-ground design
```

## 4. The weighting rule

The 90 quests are not spread evenly over the ten zones.

The **Ashvale Front** (zone 8) plus the three zones bracketing it — **Millcross Ford**, **Emberdown**
and **Hollowmarch** — carry **~60% of the 90 quests (54)**. The remaining six zones split the other
**36**. Mob implementation order follows the same rule: the Front's **26** designs are built first,
because they alone cover all eight bands (`A1-geography-cluster1.md` §4.3).

**The band floor:** at least **18 of the 90** sit in bands **1–15**, and at least **6** of those
exercise the **burial verb**.

<div class="callout danger">
<strong>Where the floor and the weighting conflict, the floor wins.</strong> The 54/36 split is
stated at zone-group granularity, and the Ashvale Front alone spans bands 10–80 — nothing in the
ratio prevents the 54 collapsing onto bands 25–80, which would tell a new player they are a burial
detail while giving them nothing to bury in their first zone. The floor constrains how the 54 may
distribute. <mark>It does not change the ratio.</mark>
</div>

## 5. Prerequisites — the budget cannot be built toward until these land

Each is a panel finding, not an invention of this record. None of §3 is authorable against until the
corresponding prerequisite is in.

| # | Prerequisite | Until it lands |
|---|---|---|
| **P1** | **The clearing commit — delivered by `I-056`** (resolve the 14 catalogued canon contradictions): amend `canon.md:85` to retire `char-expedition-member` as a player identity, name the Crossroads Man canonically across prose, glossary and the four `art:cast-crossroads-man-*` entries, repoint or retire `quests.json:447`'s giver, unify the region keyspaces, and record X1 as resolved-by-accommodation. | No quest can be written into a zone that has no `region-*` id. (The `zones` budget line no longer depends on this: it is measured on the geography zone id.) |
| **P2** | **Quest schema ↔ engine reconciliation.** `content/schemas/quest.schema.json` requires objectives `{type, targetId, count}` with `additionalProperties: false`; `nakama/src/questEngine.ts` reads `obj.id` and `obj.required`. **Also unify the `targetId` keyspace, and rule whether `rewards` is a legal field** — the schema currently forbids it. | No authored quest can complete — every objective keys on `undefined` — so the 90-quest line buys nothing that runs. Landing only the objective-shape half leaves `targetId` pointing into an unreconciled keyspace and the `rewards` question unruled. |
| **P3** | **Buried-ground world state — a design, not a line.** Must state granularity (the unit of ground a burial changes), a **numeric** reversion rule, and the **observation channel** by which a player who did not do the burial perceives it. | The `world-state-systems` line stays blocked, and DR-001 §6.4(1)'s void condition stays live against the whole L1 decision. |
| **P4** | **A `level` field and a runtime map loader.** `content/schemas/map.schema.json`'s `mobSpawnAreas` is `additionalProperties: false` with no level field, no `level` exists on `Mob`, and the server reads no file under `content/maps/` at all. | "Bands 1–80, one route" is unrepresentable in schema, runtime and entity; ten authored zones the server cannot read are ten documents. |
| **P5** | **Run the I-058 Stage 1 load harness** before committing any cell, zone or CCU number. | `cellSize`, `aoiRadius`, spawn counts and the per-zone concurrency target all rest on a measurement nobody has taken — the `spawn-entries` target may be sized against a topology that does not exist. |
| **P6** | **Append to DR-001** (append, never edit — DR-001's own rule): §6.4(4)'s operative test is the act/event `unlockedBy` gate plus giver-liveness, **not** §7.1's "28 quests, never played". | The `quests-act-independent` measure silently re-interprets a binding condition, and this budget is the document doing the re-interpreting. |

<div class="callout info">
<strong>P1 is written as a delivery of <code>I-056</code>, not as a standalone commit.</strong> The
canon amendment it needs is a slice of that idea, and specifying the same amendment twice, in two
places, is how the two copies drift apart. The sequencing already supports this: backlog order is
stamped in each idea's spec frontmatter (<code>release/1.6</code>, commit <code>4763697</code>), and
it places <mark><code>I-056</code> at wave 1, order 1</mark> — <em>"L0 first - stop building on 14
known contradictions"</em> — ahead of <mark><code>I-048</code> at wave 1, order 2</mark> —
<em>"scope cut sizes every idea below it"</em>. <strong>P1 therefore precedes the content authoring
this budget sizes.</strong> <strong>This record does not itself set backlog order</strong>; it reads
the order that exists.
</div>

## 6. What this record does not decide

Listing these as open is the point of the section. None of them is settled here, and nothing in §3–§5
should be read as settling them by implication.

| Not decided | Where it lives |
|---|---|
| **Progression and XP.** The source of experience, the curve, and what a mob kill writes to a profile. The 90-quest count is **contingent on this** and gets revisited once it is made. | Needs its own idea, owned by whoever owns progression |
| **PvP.** | Owner escalation, still open |
| **The reward law.** Now known to be a schema change before it is a voice question — the quest schema currently *forbids* a `rewards` key. | Owner escalation, still open (**P2** touches the schema, not the law) |
| **The third register.** | Owner escalation, still open |
| **The present-tense antagonist.** DR-001 §7.1 and §10.1 — the largest single risk in the L1 decision. | Remains L2's obligation; not this record's |
| **q2 — where the variant axis goes:** on `MobTypeConfig`, or into a new spawn-entry layer above it. The gate chain keys on the `MOB_TYPES` array, so the answer changes five files, and one `mob:*` asset key is minted per entry — which couples it directly to the `art-bestiary` line. | **Open — the Systems Designer's.** It is *this record's own author's* open question, and funding `spawn-entries` at 120 does not answer it |
| **q3 — where the buried-ground observation channel lives:** world state read by the client, a zone readout, or a warden's tally. Player Experience requires it *named*, not the mechanism chosen. | **Open — Player Experience's.** **P3** requires the answer; it does not supply it |

Per charter §2.4, a question one role's veto settles is settled by that role — no Principal, no
decision record, no ceremony. q2 and q3 stay open until the Systems Designer and Player Experience
respectively ratify them.

---

*Adopted against `content/season-1-budget.json` v1. Re-measure at any time with
`node scripts/report_season1.mjs`.*
