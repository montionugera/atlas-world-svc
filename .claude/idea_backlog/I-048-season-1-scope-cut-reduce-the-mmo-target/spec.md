---
title: "Season 1 scope cut: reduce the MMO target from 32 zones / 384 species / 560 quests to a finishable cluster-1 slice per DR-001's chosen cadence"
id: I-048
status: idea
date: 2026-08-01
panel: Systems Designer (PASS-WITH-CONDITIONS) · Player Experience (PASS-WITH-CONDITIONS) · Archivist (BLOCK, clearable)
---

# I-048 — Season 1 scope cut

**Serves:** `docs/worldbuilding/DR-001-L1-scope.md` §6 (the decision) and §6.4 (binding conditions) · `docs/worldbuilding/A1-geography-cluster1.md` §4.2 (the ten zones)
**Reviewed by:** Systems Designer, Player Experience, Archivist — convened per the roles charter §2.4 (smallest sufficient panel; no Principal, because no two vetoes conflict).
**Measured against the repository at this commit.** Every number below is either measured, or attributed to the role that measured it.

<div class="callout danger">
<strong>This document states a budget. It does not decide progression, art direction, PvP, the
reward law, or the present-tense antagonist.</strong> Those are named in §7 and routed. A scope
document that quietly settles other roles' questions is the failure mode the charter §2.4 exists
to prevent.
</div>

---

## 1. Problem

The project has no written statement of how much content Season 1 contains, and the only numbers in
circulation are **derivations nobody adopted**.

`role-systems-designer-scale.md` §1.2–1.4 derives **32 outdoor zones · 384 species · 560 quests**
from a 24,000-unit continent. Those are implications of a scale assumption, not a plan — but in the
absence of a plan they function as one, and every piece of authoring work is measured against them.
Against those numbers the project is at 5% of its quest need and a 64× implementation shortfall,
which is not a useful thing to know because it was never the target.

Meanwhile the shape **is** decided. DR-001 §6 chose growth by region-cluster starting at "~9–10 zones
the existing content already sizes to", and A1 §4.2 named the ten zones of cluster 1. What is missing
is the arithmetic in between: how many creatures, how many quests, how much art, and which systems
must exist before any of it can be authored.

## 2. Why now

<div class="metric-grid">
<div class="metric-tile"><strong>10</strong><br/>zones named by A1</div>
<div class="metric-tile alarm"><strong>6</strong><br/>mob types implemented</div>
<div class="metric-tile alarm"><strong>4</strong><br/>quests playable post-act-5</div>
<div class="metric-tile alarm"><strong>0</strong><br/>world-state systems</div>
</div>

Three reasons the moment is now and not later:

1. **DR-001 §6.4(1) is a void condition, not a deadline.** If buried-ground persistence slips out of
   cluster 1, the shape fails PX-V2 and the whole L1 decision is void. The Systems Designer's warning
   attaches directly: it gets *strictly more expensive with every commit that does not account for it*.
2. **DR-001 §6.4(3) is already breached.** `content/maps/cluster1-geography.json` is content authored
   under the decision and is on disk; `content/story/canon.md:77` is unamended. Recorded by the
   Archivist; the fix is in §4.
3. **Authoring is about to start.** Once quests are written against the current keyspaces, the
   collisions in §4 stop being cheap.

## 3. What ships

| Artifact | Purpose |
|---|---|
| `docs/worldbuilding/DR-003-season-1-budget.md` | The binding statement. Cites DR-001 §6 and A1 §4.2 as parents; authored by the Systems Designer, whose domain the numbers are. |
| `content/season-1-budget.json` | The numbers in one machine-readable place so doc and code cannot drift. |
| `scripts/report_season1.mjs` | Measures the repo against the budget; prints target / actual / delta. **Always exits 0** — a report, not a gate. |

<div class="callout info">
<strong>Reporting, not gating.</strong> The failure mode this idea exists to stop is drift
<em>upward</em> — authoring toward a 32-zone continent. A red CI gate on floor numbers would be red
for months and would train people to ignore it. If a ceiling gate is wanted later, it is a separate
idea.
</div>

## 4. Part 1 — Prerequisites, blocking

None of the budget in §5 can be authored against until these land. Each is a panel finding, not an
invention of this document.

| # | Prerequisite | Why | Raised by |
|---|---|---|---|
| **P1** | **One clearing commit:** amend `canon.md:77` (retire `char-expedition-member` as a player identity; name the Crossroads Man canonically across prose, glossary and the four `art:cast-crossroads-man-*` entries; repoint or retire `quests.json:447`'s giver), unify the region keyspaces, and record X1 as resolved-by-accommodation | Discharges DR-001 §6.4(3), which is **already breached**; prevents X9 resolving by erosion once 90 quests ship under the new shape | Archivist 5–7, PX condition 3 |
| **P2** | **Quest schema ↔ engine reconciliation.** `content/schemas/quest.schema.json:36-47` requires objectives `{type, targetId, count}` with `additionalProperties: false`; `nakama/src/questEngine.ts:44-53` reads `obj.id` and `obj.required`. **No authored quest can complete** — every objective keys on `undefined`. Also unify the `targetId` keyspace and rule whether `rewards` is a legal field | A schema migration, not a merge. Also settles DR-001 §8.3: the schema currently *forbids* a `rewards` key, so the reward law is a schema change before it is a voice question | Archivist 2 |
| **P3** | **Buried-ground world state — a design, not a line.** Must state granularity (the unit of ground a burial changes), a **numeric** reversion rule, and the **observation channel** by which a player who did not do the burial perceives it | PX-V2's clause is *observed by another player*. A per-character flag satisfies "buried ground is live" and is, in DR-001's phrase, "a differently-shaped kill count". I-058 delivers this at **no stage** — its open question 3 leaves world persistence unanswered | PX conditions 1–2, DR-001 §6.4(1) |
| **P4** | **A level field, and a runtime map loader.** `content/schemas/map.schema.json:79-96` (`mobSpawnAreas`) is `additionalProperties: false` with no level field, and no `level` exists on `Mob`. Grep of `colyseus-server/src` for `content/maps\|loadMap\|atlas-frontier` returns **zero matches** — spawns come from hardcoded `MAP_CONFIG.mobSpawnAreas` | "Bands 1–80, one route" is unrepresentable in schema, runtime and entity. Ten authored zones the server cannot read are ten documents. The loader is I-015; I-058 explicitly excludes it | Systems Designer 3, 5 |
| **P5** | **Run the I-058 Stage 1 load harness before committing any cell, zone or CCU number.** `cellSize`, `aoiRadius`, spawn counts and the per-zone concurrency target all derive from a measurement that has never been taken | If one room holds 300 players and 1,000 mobs, cluster 1 may need two cells rather than ten, and I-058 stages 3–5 may be unnecessary | Systems Designer 4.5 |
| **P6** | **Append to DR-001** (append, never edit — DR-001's own rule): §6.4(4)'s operative test is the act/event `unlockedBy` gate plus giver-liveness, **not** §7.1's "28 quests, never played". §6.4 is the binding text; §7.1 is consequence narration and over-states it | Without the appendix, a budget document silently re-interprets a binding condition | Archivist 1 |

## 5. Part 2 — The budget

### 5.1 The numbers

| Line | Season 1 target | Measured today | Derivation / correction |
|---|---|---|---|
| **Zones** (content regions) | **10**, named | 3 playable; 10 ids in `regions.json`, **not the same ten** (§5.3) | A1 §4.2 — binding |
| **Level curve** | bands 1–80, one route, no alternates | — | A1 §4.4, which states the no-alternates deficiency itself |
| **Mob bases** | **30**, pinned at **×4 variants** | **6** (`colyseus-server/generated/mob-types.json`) | SD §1.3 pinned 3 variants → 40 bases; "30 × 3–4" spans 30 entries and is not a budget. 30 × 4 chosen: fewer hand-written modules |
| **Spawn entries** | **120** (12/zone × 10) | — | Arithmetically correct, **contingent on the variant axis existing** (§5.2) |
| **Variant axis** | **build it** — funded line | does not exist | `MobTypeConfig` (`colyseus-server/src/config/mobs/types.ts:71-87`) is exactly `id, name, hp, radius, rotationSpeed, stats, atkStrategies`. No element, band, archetype, `rank` or `variantOf`. Without it, 120 entries means **120 hand-written modules + 120 asset keys** |
| **Bestiary designs** | 116 **+ a re-band/re-region pass over ~54 stranded designs**; zone 1 fed by splitting Millcross's nine band-1–10 designs | 116 (`content/bestiary/bestiary.json`) | "116 already sufficient" is **false**: six of ten zones hold ≤4 band-legal designs and zone 1 holds **0** — no `meltwash-terrace` or `spawn-meadow` key exists. The aggregate is fine; the routing is not. This is data editing, not creature design |
| **Design → `mob:*` mapping** | **funded line** | does not exist in any file | No bestiary entry carries a `mob:*` id; the "116 designs → 30 types → 120 entries" chain is a mapping this repo does not contain. Needs a bestiary schema field plus a gate rule |
| **Playable quests** | **90** | **4** — 2 shippable as-is, 2 needing rewrite | Not 0. `arcId` is taxonomy the engine never reads; what blocks is `unlockedBy` pointing at act/event ids (11 quests) plus dead givers. 24 become lore (§5.4) |
| **Quest weighting** | 54 / 36 across the burial spine | — | §5.2 |
| **Band floor** | **≥18 of the 90 in bands 1–15, ≥6 exercising the burial verb** | — | The Front's graves start at **band 10** and zone 1 (Meltwash Terrace) has none. Without the floor the player is told they are a burial detail and cannot bury anything in their first zone |
| **Art classes funded** | **2** — town key art (6 towns) + bestiary (30 creatures) | 6 placeholder town PNGs, 0 mob art | Owner's decision, 2026-08-01. Avoids the unsettled two-worlds map question |
| **World state** | buried ground live in the Ashvale Front — **funded, blocking Season-1 completion** | none | Not routed to a follow-up idea. See §5.5 |
| **Topology** | **I-058 stages 1–4** before content authoring resumes at scale | none | Stages 1–2 leave "single shard throughout" — one room, one process, no cross-process presence. `colyseus-server/src/index.ts:19-21` constructs `new Server({ transport })` with no presence and no driver |
| **Respawn** | 5 s → **90–300 s**, with spawner state surviving restart | `respawnDelayMs ?? 5000`; `lastSpawnAtByArea` is an in-memory Map | The line between a match and a zone. Cheap |
| **Concurrency** | **state a per-zone CCU target** | `maxClients = 1` | Nothing — cells, spawn counts, tagging contention — can be sized without it |
| **Act axis** | decide act-6+ or an era axis for post-act-5 quests | one ordered spine | `scripts/check_content.mjs` requires every quest an `arcId`, every arc an `actId`, and act orders contiguous `1..N`. 90 new quests have nowhere to hang |

### 5.2 The weighting rule — what "the burial spine" means

The **Ashvale Front** (zone 8) plus the three zones bracketing it — **Millcross Ford, Emberdown,
Hollowmarch** — carry **~60% of the 90 quests (54)**; the remaining six zones split **36**. Mob
implementation order follows the same rule: the Front's 26 designs are built first, since they alone
cover all eight bands (A1 §4.3).

The **band floor overrides the weighting where they conflict.** The 54/36 split is stated at
zone-group granularity, and the Front alone spans bands 10–80 — nothing in the ratio prevents the 54
collapsing onto bands 25–80. The floor constrains how the 54 may distribute; it does not change the
ratio.

### 5.3 The keyspace collision — why quests cannot be authored yet

Four id spaces now describe the same ground:

1. `content/story/regions.json` — `region-*` (10), gate-enforced
2. `content/bestiary/bestiary.json` — bare keys (9, no spawn-meadow)
3. `content/maps/cluster1-geography.json` — bare zone ids (**already committed content**)
4. `content/maps/atlas-frontier.md` — the three-region 1000×1000 shelf

Nine pairs correspond and **none are string-equal** (`millcross-ford` ↔ `region-millcross`,
`emberdown` ↔ `region-embervale`, `hollowmarch` ↔ `region-norhollow`, …). Two orphans:
`region-spawn-meadow` has no zone, and `meltwash-terrace` has no region id and no bestiary key.

`content/schemas/quest.schema.json:29` hard-pins quest `region` to `^region-`. **Ninety quests cannot
be written into ten zones that have no `region-*` ids.** The renames are legitimate design (A1 §4.1:
a town is not a zone); the collision is that nobody reconciled them. Fixed in **P1**, recorded under
`canon.md` §6 — this resolves A0's **X12** deliberately instead of letting it grow a fourth head.

### 5.4 The four surviving quests

| Quest | Giver | Status |
|---|---|---|
| `quest-embervale-watchfires` | War-Countess (alive throughout) | playable **as-is** |
| `quest-norhollow-palisade` | Speaker of Norhollow (alive throughout) | playable **as-is** |
| `quest-the-unmarked-crates` | War-Countess | needs narrative rewrite |
| `quest-letters-already-opened` | Speaker of Norhollow | needs narrative rewrite |

The last two are act-1 *unsolved mysteries* whose answers are public by act 5 (the Broker's arms
trade; the Bell-Keeper's tampering). Shipping them unedited puts a live mystery in front of a player
who can read its solution in the same client.

**Authoring rule, from PX:** a named act-1–5 death may be **found**, not **buried**. A quest that makes
one a burial objective is act 4 replayed with a shovel — `quest-what-the-mob-left` is the template to
avoid.

### 5.5 Why persistence is funded here rather than routed

The budget funds 10 zones, 90 quests, 30 mob bases and 2 art classes. That set **is** Season 1, so
anything outside it is by construction after cluster 1 — which is precisely the slip DR-001 §6.4(1)
declares void. An unfunded backlog idea is a record that someone noticed, not a commitment. A new
idea may be the implementation vehicle and may carry the design (**P3**); the *funding and the
blocking dependency* stay in the budget.

## 6. Out of scope

- **No CI gate.** Report only.
- **No content authoring.** This document sizes work; it does not do it.
- **DR-001 is not reopened.** Its shape, its cadence and A1's ten zones are inputs.
- **The present-tense antagonist** (DR-001 §7.1, §10.1) remains L2's obligation and the largest single
  risk in the L1 decision.
- **Cluster 2** — ND-E's proclamation layer, alternate routes, travel systems, dungeon templates
  (4–5 of the continent's 12–16), party membership.

## 7. Routed, not decided here

| Finding | Routed to |
|---|---|
| **Progression / XP source.** `nakama/src/leveling.ts:5` pins `xpToNext = 100 * level` → **316,000 XP** for 1→80. Mob kills write nothing to the profile (`reportMatchEvents.ts`); the only live example pays 100 XP per quest. At 90 quests that implies ~3,511 each. **The quest count is contingent on this decision and gets revisited once it is made** | Whoever owns progression — needs its own idea |
| **I-052 splits.** *052a* — schema/catalog reconciliation: **unaffected by DR-001, raise priority** (it is **P2**). *052b* — wiring: **narrows from 28 quests to 4**, and its current title is factually wrong | Backlog |
| **I-053** (phasing / `StateView`) appears to overlap **I-058 stage 1** and may be a duplicate | Backlog triage |
| **X9** — Expedition Member vs the Crossroads Man — must be pulled out of I-056 and made a Season-1 blocker, because 90 quests will be written against whichever answer is live | Archivist / **P1** |
| **X1** — Embervale farms the loam and digs the seam beneath it. **Ruled: accepted by accommodation.** One sentence in `canon.md` §4 citing both sources; Norhollow remains a forest–mine town | Archivist / **P1** |
| Owner escalations still open: the third register (§8.1), PvP (§8.2), the reward law (§8.3 — now known to be a schema change first), the novel's canonicity (§8.4) | Owner |

## 8. Verification

Evidence required before this is called done:

1. `node scripts/report_season1.mjs` runs against the repo and its output is pasted into the PR — target, actual and delta for every line in §5.1.
2. The report **derives** actuals by measuring the repo (counting `mob-types.json`, `bestiary.json`,
   `quests.json`, `regions.json`), so `DR-003` and `season-1-budget.json` cannot drift from reality
   silently.
3. `DR-003` renders through `~/.claude/scripts/render-spec-md.sh` and is reviewed in the browser.
4. Each of P1–P6 is either landed or has a named, linked idea before the budget is called adopted.

## 9. Open questions for the plan

1. Does `region-spawn-meadow` retire, or bind to `meltwash-terrace`? A1 §5.3 explicitly declines to
   rule ("not this role's call").
2. Does the variant axis go on `MobTypeConfig` or into a new spawn-entry layer above it? The gate
   chain (`gen-mob-types.sh` → `gen-asset-keys.ts` → `check_asset_manifest.mjs` → `check_content.mjs`)
   keys on the `MOB_TYPES` array, so the answer changes five files.
3. Where does the buried-ground observation channel live — world state read by the client, a zone
   readout, or a warden's tally? PX requires it named, not the mechanism chosen.
4. Does the act axis extend to act-6+, or does a separate era field carry post-act-5 content?
