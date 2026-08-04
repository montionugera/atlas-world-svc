# DR-004 — The starter ground: `region-spawn-meadow` and A1 zone 1

**Level:** L2 · **Role:** Principal (charter §2.3) · **Date:** 2026-08-01
**Parents (not reopened):** `DR-001-L1-scope.md` §6, §6.4 · `A1-geography-cluster1.md` §4.2, §5.3
**Options as named by:** Cartographer, A1 §5.3, which declined to rule. No option here is the Principal's.
**Blocks:** I-048 §9 question 1.

<div class="callout info">
<strong>Why a separate Principal.</strong> Charter §2.3 records that the role which ran the panel
must not score its results. The session that briefed the roles and wrote the Season 1 budget did
not author this record and supplied no recommendation to it.
</div>

## 0. Jurisdiction — ruled first

**This is the Principal's, but only in one scoping.** Under §2.3(6) the Principal escalates anything
trading art quality against cost. Option (a) does that and option (b) does not, so the two options do
not share a jurisdiction:

- `content/maps/atlas-frontier.md` references `region-spawn-meadow` at `:11`, `:28`, `:32`, `:52`.
  Retiring the id forces an edit to that file — the exact artifact the two-worlds problem is about
  (`docs/superpowers/specs/2026-08-01-world-art-bible-program.md` §3, "T2's blocking decision").
- The owner has already acted on that question by deferring it: I-048 funds two art classes on the
  stated basis that it *avoids the unsettled two-worlds map question*.

**Therefore (a) cannot be chosen without escalating, and it is not chosen.** (b) is decidable because
it can be scoped to touch no map artifact.

**The scoping is part of the ruling, not commentary:**

1. This decides **identity** — which ground the region node denotes — not **spelling** (the id string)
   and not **map artifacts**.
2. **No file under `content/maps/` changes as a consequence.** The ruling holds identically whether
   the 1000×1000 shelf is later rebuilt, retired, or kept as a compressed miniature.
3. The id string belongs to I-048 **P1**'s keyspace unification. A later rename to
   `region-meltwash-terrace` is a mechanical rename of a bound id, **not** a reversal of this record.
4. Re-grounding the node's title/summary, and the `char-expedition-member` anchor, are
   DR-001 §6.4(3) and I-048 P1 business. Not settled here.

## 1. Criteria and weights — published before scoring

| # | Criterion | Weight | Derived from |
|---|---|---|---|
| **C1** | **Start-small viability** — does cluster 1's only band-1–10 ground get a `region-*` node so authoring can begin? | **30** | §1 "large, **may start small and scale**" |
| **C2** | **MMO fitness of the starter fiction** — does the option leave a first zone whose fiction is a single-player tutorial? | **25** | §1 "persistent MMO" |
| **C3** | **Corpus integrity under revision** — how many commitments break, and are collisions named or orphaned? | **25** | §1 "everything on the table" + Archivist **G5** |
| **C4** | **Holds under unsettled parents** — does it survive either two-worlds outcome and P1's rename? | **20** | §1 "everything revisable" |

Scored 0–5; total as a percentage of 500. **Cost is not a criterion.**

## 2. Measured facts, including two corrections

| Claim | Verdict |
|---|---|
| "Exactly 3 quests reference `region-spawn-meadow`" | **True but materially incomplete.** The gate hard-FAILs on **8** edges: quest `region` ×3 (`content/story/quests.json:13,36,62`), character `region` ×3 (`content/story/characters.json:9,22,33`), lore `anchor` ×1 (`content/story/lore.json:158`), event `involves` ×1 (`content/story/events.json:12`). Plus unresolved prose references in `content/story/factions.json:75`, `content/story/bible.md:23,63`, `content/characters/npc-camp-quartermaster.md:14,29`, `content/characters/player-expedition.md:14`, `content/maps/atlas-frontier.md:11,28,32,52`. **19 references in total.** |
| "`quest.schema.json` pins `region` to `^region-`" | True (`:29`) — but `region` is **not** in `required` (`:6`). Retiring the id does not literally block authoring; it blocks **zone-attributed** authoring, which is what I-048's band floor needs. |
| Bestiary has no `meltwash-terrace` and no `spawn-meadow` key | **True.** 9 bare region keys across 116 entries; zone 1 has zero designs. |
| A1 §5.3's "the meadow's own placement — north-east of the ford, one morning's walk" | **Not in the source it attributes.** `content/maps/atlas-frontier.md:53-58` centres the meadow on spawn (500,500) — "the hub, the wilds are the spokes" — and contains no ford and no towns. The unsourced claim is already committed at `content/maps/cluster1-geography.json:573`. **Routed to the Archivist under G5.** This record does not lean on it. |

What survives that correction is the better evidence anyway: **adjacency**. `atlas-frontier.md:53-69`
puts the camp adjacent to the icefield (north) and Thornveil (east); A1 §2 routes the north-east fork
"up the river terrace to the expedition camp, Thornveil's edge, and the ice." A1 §5.3's own rule is
that the playable map preserves **topology and adjacency**, not metric distance. The adjacency
matches; the compass bearing was never the argument.

## 3. Scoring matrix

| Option | C1 ×30 | C2 ×25 | C3 ×25 | C4 ×20 | **Total** |
|---|---|---|---|---|---|
| **(a)** retire `region-spawn-meadow` | 1 | 4 | 1 | 1 | **35%** |
| **(b)** bind it to A1 zone 1 — *chosen, scoped per §0* | 5 | 2 | 5 | 5 | **85%** |

**(a)** C1=1: bare retirement leaves cluster 1's only band-1–10 zone with no region node, and I-048's
≥18-quests-in-bands-1–15 floor unauthorable. C2=4: it is the clean way to delete the tutorial fiction.
C3=1: eight gate-breaking edges plus the loss of the recorded place-of-record for two dead characters
and one lore anchor. C4=1: it forces the deferred map edit.

**(b)** C1=5 immediately. **C2=2, and this is the honest weak point** — binding carries "expedition
tents, training dummies" and the PX-V1-blocked `char-expedition-member` anchor forward into the
player's first zone. C3=5: zero dangling references. C4=5: touches no map artifact.

## 4. The call

<div class="callout success">
<strong>Bind.</strong> <code>region-spawn-meadow</code> denotes A1 §4.2 zone 1, <strong>Meltwash
Terrace</strong> — under the four scoping clauses in §0.
</div>

## 5. What this sacrifices

The cleanest moment to delete a legacy id. The keyspace keeps a **system word** — "spawn" is a spawn
point, not a place — describing a meadow, in a world whose zone 1 is a gravel river terrace with
willow scrub. Anyone who greps the id before reading the title reads the wrong world, and that
misreading gets cheaper to cause and dearer to fix with every one of the 90 Season-1 quests. It also
means the player's first ground stays, on disk, the place a dead quartermaster ran a single-player
onboarding, until I-048 P1 lands — and P1 is not guaranteed to land first.

## 6. The losing option's strongest argument, at full strength

> A region id is a permanent public name, and this one fails the Namer's own morphology before it
> fails anything else. Every reference counted as a *cost of retiring* is an argument for retiring
> **now**: 8 edges today, 98 after Season 1. This chooses the option that gets monotonically more
> expensive and calls it the cheap one. And what is preserved is not geography — it is the vocabulary
> of the single-player build that DR-001 exists to retire. Binding does not re-ground the meadow; it
> renames the tutorial and files it under the map.

Rejected on **C3 and C4 only, not on effort**: (a) forces an edit to the one artifact the owner
deliberately left unsettled, and the Principal has no authority to make that edit or pre-empt it.

## 7. Confidence and reopen trigger

**85%.** **Reopen by appendix** if the topology work under DR-001 §6.4(2) **retires
`atlas-frontier.md` as an artifact** rather than rebuilding it. At that point (a) no longer pre-empts
anything, becomes fully the Principal's, and should be re-scored on its merits alone.

## 8. Routed / escalated

- **Owner — nothing.** The scoping keeps two-worlds untouched; the owner's 2026-08-01 art-class
  funding stands undisturbed.
- **Archivist (G5)** — A1 §5.3 attributes a placement to `atlas-frontier.md` that is not in it, and
  the claim is already committed at `content/maps/cluster1-geography.json:573`.
- **Systems Designer / Archivist (I-048 P1)** — the id string, and the C2 weakness this ruling
  knowingly leaves live.
- **No option is missing.** "Retire and mint `region-meltwash-terrace`" is (b) plus P1's rename — it
  is inside the chosen scoping, not outside it.
