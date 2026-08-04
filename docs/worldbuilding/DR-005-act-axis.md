# DR-005 — The act axis for post-act-5 content

**Level:** L2 · **Role:** Principal (charter §2.3) · **Date:** 2026-08-01
**Parents (not reopened):** `DR-001-L1-scope.md` §6.4(4)
**Options as named by:** Systems Designer, in its review of the Season 1 budget. No option here is the Principal's.
**Blocks:** I-048 §9 question 4, and I-048's act-axis budget line.

## 0. Is option (a) compatible with DR-001 §6.4(4)? Ruled first

<div class="callout warn">
<strong>Yes on its face</strong> — stated plainly rather than letting a veto do work it does not do.
§6.4(4) binds <strong>the five acts</strong> ("never made playable as a sequence… not phased, not
instanced, not seasonal"). Minting <code>act-6</code> does not make acts 1–5 playable, and
<code>scripts/check_content.mjs:278-289</code> accepts order 6 (unique, contiguous 1..N).
<strong>(a) is live, not dead</strong>, and is scored as such per obligation 2.
</div>

What §6.4(4) does instead is **empty the act axis of the property that made it an axis.**
`check_content.mjs:276-277` states the contract: acts are the spine *so that* "act reached" is
well-defined. Under §6.4(4) acts 1–5 are unreachable by construction, so `act-6` would be ordinal 6
of a sequence whose first five steps nobody takes, and `unlockedBy: act-*` (`quest.schema.json:34`;
prefix-as-semantics hard-coded at `check_content.mjs:138-141`) would mean *permanently false* for
acts 1–5 and *evaluable* for act-6. **One field, two meanings.** That is a design defect, not a veto
breach.

## 1. Criteria and weights — published before scoring

| # | Criterion | Weight | Derived from |
|---|---|---|---|
| **B1** | **Scale headroom** — can the axis carry cluster 2…N without a rewrite? | **30** | §1 "large… may start small and scale" + DR-001 §6's indefinite region-cluster cadence |
| **B2** | **Gate-contract integrity** — does a progression condition stay evaluable for a player who joined at any time? | **25** | §1 "persistent MMO" — no authored arrival order exists to lean on |
| **B3** | **Corpus integrity under revision** — what does it disturb in `acts.json`, `arcs.json`, the 11 act-gated quests, and the shipped graph? | **25** | §1 "everything on the table" + Archivist **G5** |
| **B4** | **Absorbs DR-001's open risk** — if the present-tense antagonist (DR-001 §10.1) needs a bounded dramatic sequence, which option survives? | **20** | §1 "everything revisable" |

## 2. Measured facts

- `content/story/acts.json` holds exactly five acts, orders 1–5; act-5 is "The Undertow", summarised
  as the war's resolution. **An act here is a dramatic unit with an ending, not a release counter.**
- `content/schemas/arc.schema.json:6` makes **`actId` required on every arc**; `quest.schema.json:6`
  makes `arcId` required on every quest. **This is the forcing function, and it is authoring, not
  runtime:** one post-act-5 quest cannot be authored without minting a new act or changing the arc
  schema.
- 11 quests carry an `act-*` unlock (`content/story/quests.json:215,293,398,477,557,583,609,636,662,688,714`).
- **`unlockedBy` is read by no runtime code.** Repo-wide it appears only in content, schemas,
  `scripts/`, `tools/story-explorer/`, tests and docs — **zero matches under `nakama/src`,
  `colyseus-server/src`, `contracts/src`.** Today the overload in §0 is an authoring and tooling
  defect; it becomes a runtime defect the day the gate is implemented.

## 3. Scoring matrix

| Option | B1 ×30 | B2 ×25 | B3 ×25 | B4 ×20 | **Total** |
|---|---|---|---|---|---|
| **(a)** extend to act-6+ | 2 | 1 | 4 | 2 | **45%** |
| **(b)** separate era axis, acts 1–5 frozen as history — *chosen* | 5 | 5 | 3 | 5 | **90%** |

**(a)** B1=2: arithmetically open-ended, but a five-act structure that keeps going is not a five-act
structure, and each cluster becoming an "act" conflates a dramatic unit with a release. B2=1 per §0.
**B3=4 — genuinely the least disruptive:** one JSON entry, no schema, no loader, no `unlockedBy`
pattern change. B4=2: trivial to do, expensive to undo once 90 quests carry `arcId → actId: act-6`.

**(b)** B1=5: an era is a period, not a unit with an ending; cluster N maps to era M without
arithmetic. B2=5: `act-*` keeps exactly one meaning — permanently false — which is also what I-048
**P6** asks DR-001 to append. B3=3: a real migration — new schema, new story file, a `STORY_FILES`
entry, `gen_story_graph.mjs`, `check_content.mjs`, and `arc.schema.json:6`'s required `actId`. B4=5:
an era can **contain** acts later (era-1 → act-6…act-9) without undoing anything; the converse is
false.

## 4. The call

<div class="callout success">
<strong>A separate era axis.</strong> Acts 1–5 freeze as history; post-act-5 content hangs on eras.
</div>

## 5. What this sacrifices

A schema migration on `check_content.mjs` — the most-coupled script in the project — at the moment
I-048 **P2** reports that script's schema↔engine contract is *already broken* (objectives key on
`undefined`; no authored quest can complete). It forfeits the one-JSON-entry answer permanently. It
commits the project to maintaining **two period axes forever**, with a standing hazard: an era-1 quest
whose arc still carries an act-5 `actId` will be invisible unless the gate is taught to care.

Most consequentially, it **hardens DR-001 §6.4(4) from a decision into a data-model fact** — after
this, making the acts playable is a migration, not a reversal. That is a real narrowing of
"everything revisable" and it is chosen knowingly.

## 6. The losing option's strongest argument, at full strength

> The act axis exists, is gated, is understood by everyone who reads `check_content.mjs`, and costs
> one JSON entry. Every objection to it is an objection to a **word** — that "act" connotes a dramatic
> unit — and words are the Namer's business, not the schema's. The gate does not know what an act
> means; it knows orders are contiguous. A world that grows by region-cluster forever needs exactly
> **one** monotonic period counter, and inventing a second to sit beside a first you are freezing is
> how you end up with two half-used axes instead of one working one. And the semantic-purity argument
> is currently worth nothing measurable: `unlockedBy` is read by no runtime code anywhere in this
> repo. You are paying a schema migration, on an unrepaired foundation, to fix an ambiguity in a field
> nothing evaluates.

That last sentence is correct and was verified directly. (a) is still rejected, on **B1 and B4**: the
axis has to carry every future cluster, and (b) is the only one that can later contain acts rather
than be replaced by them. **The cheapest moment to fix an axis is before anything reads it** — which
is exactly now.

## 7. Confidence and reopen trigger

**75%** — lower than DR-004, because §6 is strong and the cost lands on an already-broken gate.

**Concrete reopen trigger:** if I-048 **P2** lands an `unlockedBy` evaluator whose `act-*` rule is
*"any act at or below the player's furthest-reached order"*, and `act-6` is reachable under it without
a second meaning, then B2 collapses from 5-vs-1 to a tie, (a) wins on B3, and this record should be
reopened by appendix. **Checkable by reading the evaluator, not by argument.**

## 8. Routed / escalated

- **Owner — one confirmation, not a blocker.** If §6.4(4) is read as forbidding the act *axis* from
  ever continuing — not just the five acts from being played — then (a) is dead outright rather than
  degenerate. **The call is (b) under both readings**, so this does not block on it; it is recorded so
  nobody later mistakes this ruling for a reading of §6.4(4). This is also I-048 **P6**'s appendix,
  which (b) presumes lands.
- **Systems Designer** — the migration surface: `arc.schema.json:6`, a new era schema and story file,
  `STORY_FILES`, `gen_story_graph.mjs`, `check_content.mjs`, and whether `era-` joins `unlockedBy`'s
  pattern.
- **Missing option, and who owns it:** "arcs carry no period at all — drop `actId`" was offered by no
  role. If the panel wants it, the **Systems Designer** must supply it. The Principal may not.
