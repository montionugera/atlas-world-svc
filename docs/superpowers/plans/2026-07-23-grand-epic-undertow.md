# The Undertow (Grand Epic Content, Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the full 5-act Undertow saga (6 towns, 5 villains, ~95 new story nodes) in the F-014 Narrative System v2, gate-green after every task.

**Architecture:** Pure content authoring in `content/story/*.json` + a theme bible markdown. No code, schema, or gate changes. This plan pins the **graph skeleton** (ids, edges, `unlockedBy` chains, `diedAt` bindings, `timelineOrder`, lore threads); the spec (`docs/superpowers/specs/2026-07-23-grand-epic-undertow-design.md`) and the theme bible (Task 1) govern all prose, naming voice, and tone. Tasks 3–8 each add one act's (or pack's) nodes and MUST leave the gate green.

**Tech Stack:** F-014 content model (9 kinds), `scripts/check_content.mjs`, `scripts/gen_story_graph.mjs`, story explorer.

## Global Constraints

- **Read first, always:** the spec (creative law) and `content/story/style.md` (voice law, exists after Task 1). Every title, summary, narrative text, dialogue line, and lore body must follow them. English content; Ashen Vigil register (terse, wind-worn) with Gilded Rot diction for Gildmark-bloc voices.
- **Node ids are LAW:** use exactly the ids in this plan's tables — later tasks reference them verbatim. Kind prefixes: `act- region- faction- char- arc- quest- event- dlg- lore-`.
- **Gate green after every task:** from worktree root `node scripts/check_content.mjs` → exit 0, 0 failures. Orphan WARNs are expected mid-plan (noted per task) and must ALL be resolved by Task 9 (`--require-complete` → exit 0).
- **Regenerate the Mermaid artifact in the same commit whenever story JSON changes:** `node scripts/gen_story_graph.mjs --write` then commit `docs/story/story-graph.md` alongside.
- **Run the scripts test suite after every task** (`cd scripts && node --test tests/*.test.mjs` — glob, never bare dir): if a seed-pinning assertion in `story-seed.test.mjs` breaks because content legitimately evolved (e.g. act titles), update that assertion in the same commit; never weaken gate-rule tests.
- **mob refs:** any `mobFamily[]` / `objectives[].targetId` mob key must be `mob:` + one of the 6 server ids: `aggressive, balanced, defensive, double_attacker, hybrid, spear_thrower` (hard FAIL otherwise).
- **Schema truths:** quest requires `narrative{description,offerText,completeText}, giver, arcId, objectives[≥1]`; `unlockedBy` is optional, AND-only, ids only (`quest-|event-|act-` prefixes); event requires unique integer `timelineOrder` + `involves[≥1]`; dialogue requires `speaker, lines[≥1]`, optional `context` (one quest or event id); lore requires `body, anchor` (one node id), `thread` (kebab tag, every thread ≥2 fragments by Task 9); character optional `status`/`diedAt` (diedAt ⇒ status ≠ alive); `links: []` is required on every node (empty is fine). Check the schema file when in doubt — schemas win over this summary.
- **Deaths:** exactly the 5 in the spec (§3). A death = event + `status:"dead"` + `diedAt` on the character, authored in the act task that kills them.
- **Timeline numbers are globally unique integers** — this plan assigns 2 and 4–16 (1 and 3 exist). Never renumber existing events.
- Work in the claimed feature worktree only; never `git commit --amend`; stage explicit paths (never worktree-root `plan.md`, never `.superpowers/`); conventional commits.

---

### Task 1: Theme bible — `content/story/style.md`

**Files:** Create `content/story/style.md` · Modify `content/story/README.md` (add one line pointing to it under Further docs/intro).

**Interfaces — Produces:** the voice law all later tasks cite. No JSON changes; gate output unchanged.

- [ ] **Step 1: Write `style.md`** with exactly these sections (content per spec §§1, 2, 4, 6.5, 8):
  1. **Global tone rules** — Ashen Vigil register (short sentences, concrete nouns, no modern vocabulary — ban list: "okay, guys, tech, percent, boss"; grief understated, never melodrama); Gilded Rot register for Gildmark-bloc voices (ledger-and-chronicle diction, menace as polite accounting) — include ≥3 sample lines per register.
  2. **Naming morphology** — Ashen Vigil: terse compounds (Millcross, Rooktide, Farrow the Forward); Gilded Rot: house-and-title (the Harbor Council, the Iron Regent); rule: every new name must fit one register.
  3. **Town identity table** — for each of the 6 towns (spec §2 table): one-line identity, palette words, costume motif, emblem, diction quirk.
  4. **Faction & people identity table** — the 10 factions (5 existing + 5 new from Task 2) and 6 peoples (spec §2): accent color, costume motif, mob family, one-line creed.
  5. **Villain voice table** — the 5 villains (spec §4): drive, one-line thesis, how they talk (each must sound distinct; include 1 sample line each).
  6. **Magic rules** — spec §6 verbatim spirit: magic is scarce contested resource; never resolves political knots, cures grief, or raises the dead.
  7. **Death & dark-quest rules** — spec §3 death rule (causally human; monsters kill only unnamed) + §8 rules (pain through behavior, no diagnosis labels, no one-quest cures, rewards favor understanding, ending-montage eligibility).
- [ ] **Step 2: Verify** — `node scripts/check_content.mjs` → exit 0, same warnings as before this task (baseline unchanged). `cd scripts && node --test tests/*.test.mjs` → all pass.
- [ ] **Step 3: Commit** — `git add content/story/style.md content/story/README.md && git commit -m "content: undertow theme bible (style.md)"`

### Task 2: World foundation + seed reconciliation

**Files:** Modify `content/story/acts.json`, `regions.json`, `factions.json`, `characters.json`, `lore.json` · regenerate `docs/story/story-graph.md`.

**Interfaces — Produces:** all world nodes later tasks reference. **Consumes:** style.md voices.

- [ ] **Step 1: Rewrite `acts.json` to the 5 Undertow acts** (keep ids/orders of the existing two, replace titles/summaries/themes; add three):

| id | order | title | theme |
|---|---|---|---|
| act-1 | 1 | Small Lives | quiet-before |
| act-2 | 2 | The War Comes Home | severance |
| act-3 | 3 | The Ledger Game | the-money-trail |
| act-4 | 4 | The Truth Arrives Late | the-mirror |
| act-5 | 5 | The Undertow | what-remains |

- [ ] **Step 2: Add 7 regions** (existing 3 stay; write summaries in bible voice; use a `dangerTier` value already allowed by `content/schemas/region.schema.json` — check its enum first, pattern after existing entries): `region-millcross` (safe tier), `region-embervale`, `region-norhollow`, `region-gildmark`, `region-rooktide`, `region-ashvale-front` (high tier — the battlefront between the war towns), `region-cindervast` (highest tier — the fallen city ruin).
- [ ] **Step 3: Add 5 factions** (existing 5 stay): `faction-embervale-banner` (mobFamily `["mob:balanced"]`), `faction-norhollow-banner` (`["mob:defensive"]`), `faction-gildmark-council` (`["mob:hybrid"]`), `faction-bellfaith` (`[]`), `faction-ashen-column` (`["mob:aggressive","mob:double_attacker"]` — the Ash Prophet's raiders). Relationships (use existing stance enum values from `faction.schema.json`): embervale-banner ↔ norhollow-banner enemy; both list gildmark-council neutral; ashen-column enemy of embervale-banner, norhollow-banner, and gildmark-council; bellfaith neutral to all it lists.
- [ ] **Step 4: Add 15 characters** (role/faction/region as listed; NO fates yet — deaths land in act tasks):

| id | role | faction | region |
|---|---|---|---|
| char-the-broker | villain | faction-gildmark-council | region-gildmark |
| char-iron-regent | villain | faction-embervale-banner | region-embervale |
| char-the-bell-keeper | villain | faction-bellfaith | region-gildmark |
| char-widow-of-the-first-caravan | villain | faction-embervale-banner | region-embervale |
| char-the-ash-prophet | villain | faction-ashen-column | region-cindervast |
| char-war-countess | neutral | faction-embervale-banner | region-embervale |
| char-speaker-of-norhollow | neutral | faction-norhollow-banner | region-norhollow |
| char-elder-of-rooktide | ally | (omit faction) | region-rooktide |
| char-farrow-the-forward | ally | faction-expedition | region-millcross |
| char-clerk-of-gildmark | npc | faction-gildmark-council | region-gildmark |
| char-thornveil-war-speaker | npc | faction-thornveil | region-thornveil |
| char-warden-bright | ally | faction-bellfaith | region-gildmark |
| char-mirelle | npc | (omit) | region-gildmark |
| char-liss-of-embervale | npc | (omit) | region-embervale |
| char-joren-of-norhollow | npc | (omit) | region-norhollow |

- [ ] **Step 5: Seed reconciliation** — in `lore.json`, change both existing fragments' `thread` from `the-first-claim` to `the-cindervast-fall` and re-ground their summaries/bodies to the fallen city (the Stoneguard oath-tablet now mourns Cindervast); in `factions.json`, rewrite `faction-stoneguard` summary as Cindervast's old city guard ("a defensive order that outlived its city").
- [ ] **Step 6: Verify** — gate exit 0. EXPECTED new WARNs: orphan character/faction WARNs for the 20 new nodes (referenced by nothing yet — resolved across Tasks 3–8) — count and record them in the commit body. Scripts tests pass (update any seed-title assertion). `node scripts/gen_story_graph.mjs --write`.
- [ ] **Step 7: Commit** — `git add content/story/*.json docs/story/story-graph.md && git commit -m "content: undertow world foundation + seed reconciliation (T2)"`

### Task 3: Act 1 — Small Lives (starter arcs)

**Files:** Modify `arcs.json`, `quests.json`, `events.json`, `dialogue.json` · regen graph.

**Interfaces — Consumes:** Task 2 world ids. **Produces:** `quest-the-unmarked-crates`, `quest-letters-already-opened`, `event-first-caravan-burns` (referenced by later tasks).

- [ ] **Step 1: Add 2 starter arcs** — `arc-embervale-outskirts` (actId act-1, questIds `["quest-embervale-watchfires","quest-the-unmarked-crates"]`), `arc-norhollow-outskirts` (act-1, `["quest-norhollow-palisade","quest-letters-already-opened"]`). (Existing `arc-meadow-awakening` is the Millcross starter — unchanged.)
- [ ] **Step 2: Add 4 quests** (all objectives use valid `mob:` ids or plain non-mob targetIds; narrative text in bible voice):

| id | giver | region | faction | unlockedBy | beat |
|---|---|---|---|---|---|
| quest-embervale-watchfires | char-war-countess | region-embervale | faction-ashfang | — | militia foothold; wilds press the walls |
| quest-the-unmarked-crates | char-war-countess | region-embervale | faction-gildmark-council | ["quest-embervale-watchfires"] | crates with no maker's mark pass through |
| quest-norhollow-palisade | char-speaker-of-norhollow | region-norhollow | faction-unaligned | — | hold the palisade line |
| quest-letters-already-opened | char-speaker-of-norhollow | region-norhollow | faction-gildmark-council | ["quest-norhollow-palisade"] | mail arrives pre-opened; someone reads everything |

- [ ] **Step 3: Add event** `event-first-caravan-burns` (timelineOrder **2**, no triggeredBy, involves `["region-ashvale-front","faction-gildmark-council","char-widow-of-the-first-caravan"]`) — the staged incident, written as what people *believe* happened.
- [ ] **Step 4: Add 2 dialogue** — `dlg-war-countess-briefing` (speaker char-war-countess, context quest-embervale-watchfires), `dlg-speaker-of-norhollow-briefing` (speaker char-speaker-of-norhollow, context quest-norhollow-palisade).
- [ ] **Step 5: Verify + commit** — gate exit 0 (orphan WARN count shrinks; record); scripts tests; `gen_story_graph.mjs --write`; commit `"content: act 1 — small lives starter arcs (T3)"`.

### Task 4: Act 2 — The War Comes Home

**Files:** Modify `arcs.json`, `quests.json`, `events.json`, `characters.json`, `dialogue.json` · regen graph.

**Interfaces — Produces:** `event-the-seal-that-matched-no-one` and `event-farrow-falls` (referenced later); Farrow's death.

- [ ] **Step 1: Arc** `arc-war-comes-home` (act-2, questIds `["quest-the-road-of-strangers","quest-salvage-run","quest-hold-the-ford"]`).
- [ ] **Step 2: Quests:** `quest-the-road-of-strangers` (giver char-quartermaster, region-millcross, faction-expedition, unlockedBy `["act-2"]` — refugees flood the crossroads) → `quest-salvage-run` (giver char-quartermaster, region-ashvale-front, faction-unaligned, unlockedBy `["quest-the-road-of-strangers"]` — recover the caravan seal that matches neither side) → `quest-hold-the-ford` (giver char-farrow-the-forward, region-ashvale-front, faction-ashen-column, unlockedBy `["quest-salvage-run"]`).
- [ ] **Step 3: Events:** `event-war-declared` (4, involves both banner factions) · `event-refuge-at-millcross` (5, involves region-millcross, faction-expedition) · `event-the-seal-that-matched-no-one` (6, triggeredBy quest-salvage-run, involves char-expedition-member) · `event-farrow-falls` (7, triggeredBy quest-hold-the-ford, involves char-farrow-the-forward, faction-ashen-column).
- [ ] **Step 4: Farrow dies** — on `char-farrow-the-forward`: `"status": "dead", "diedAt": "event-farrow-falls"`.
- [ ] **Step 5: Dialogue:** `dlg-farrow-at-the-ford` (speaker char-farrow-the-forward, context quest-hold-the-ford — his last words are logistics, bible rule: grief understated) · `dlg-quartermaster-road-of-strangers` (speaker char-quartermaster, context quest-the-road-of-strangers).
- [ ] **Step 6: Verify + commit** — gate exit 0; scripts tests; graph regen; commit `"content: act 2 — the war comes home (T4)"`.

### Task 5: Act 3 — The Ledger Game

**Interfaces — Produces:** `event-ledger-lifted`, both act-3 deaths.

- [ ] **Step 1: Arc** `arc-ledger-game` (act-3, questIds = the 4 below).
- [ ] **Step 2: Quests** (chain, first unlockedBy `["act-3","event-the-seal-that-matched-no-one"]`, then each unlockedBy the previous): `quest-a-face-for-gildmark` (giver char-warden-bright, region-gildmark, faction-gildmark-council — a cover identity among the bell-wardens) → `quest-the-clerks-price` (giver char-clerk-of-gildmark — the whistleblower's terms) → `quest-the-ledger-theft` (giver char-clerk-of-gildmark) → `quest-out-the-harbor-gate` (giver char-warden-bright).
- [ ] **Step 3: Events:** `event-ledger-lifted` (8, triggeredBy quest-the-ledger-theft, involves char-the-broker) · `event-clerk-silenced` (9, involves char-clerk-of-gildmark, faction-gildmark-council) · `event-warspeaker-falls` (10, involves char-thornveil-war-speaker, faction-thornveil — the truce dies with him).
- [ ] **Step 4: Deaths:** char-clerk-of-gildmark → dead/diedAt event-clerk-silenced; char-thornveil-war-speaker → dead/diedAt event-warspeaker-falls.
- [ ] **Step 5: Dialogue:** `dlg-clerk-terms` (speaker char-clerk-of-gildmark, context quest-the-clerks-price) · `dlg-ash-prophet-sermon` (speaker char-the-ash-prophet, context event-warspeaker-falls — chaos preaches over the wreckage).
- [ ] **Step 6: Verify + commit** — `"content: act 3 — the ledger game (T5)"`.

### Task 6: Act 4 — The Truth Arrives Late

**Interfaces — Produces:** `event-bells-ring-true`, `event-quartermaster-falls`; Quartermaster's death.

- [ ] **Step 1: Arc** `arc-truth-arrives-late` (act-4, questIds = the 3 below).
- [ ] **Step 2: Quests:** `quest-the-bell-keepers-price` (giver char-warden-bright, region-gildmark, faction-bellfaith, unlockedBy `["act-4","event-ledger-lifted"]` — free Mirelle; the Bell-Keeper turns) → `quest-ash-in-the-streets` (giver char-quartermaster, region-millcross, faction-embervale-banner, unlockedBy `["quest-the-bell-keepers-price"]` — hold the crossroads against the Widow's mob) → `quest-what-the-mob-left` (giver char-expedition-member, region-millcross, faction-expedition, unlockedBy `["event-quartermaster-falls"]` — the funeral, and her log).
- [ ] **Step 3: Events:** `event-bells-ring-true` (11, triggeredBy quest-the-bell-keepers-price, involves char-the-bell-keeper, char-mirelle) · `event-messengers-burned` (12, involves char-widow-of-the-first-caravan, region-embervale) · `event-quartermaster-falls` (13, triggeredBy quest-ash-in-the-streets, involves char-quartermaster, char-widow-of-the-first-caravan) · `event-relic-deal-struck` (14, involves char-the-broker, char-iron-regent — the sale agreed, act 5 must stop it).
- [ ] **Step 4: Death:** char-quartermaster → `"status": "dead", "diedAt": "event-quartermaster-falls"`.
- [ ] **Step 5: Dialogue:** `dlg-bell-keeper-confession` (speaker char-the-bell-keeper, context event-bells-ring-true) · `dlg-widow-at-the-pyres` (speaker char-widow-of-the-first-caravan, context event-messengers-burned — she knows, and doesn't care) · `dlg-mirelle-freed` (speaker char-mirelle, context quest-the-bell-keepers-price).
- [ ] **Step 6: Verify + commit** — `"content: act 4 — the truth arrives late (T6)"`. (Existing `dlg-quartermaster-icefield-briefing` stays valid — she speaks in act 2 context, dies in act 4.)

### Task 7: Act 5 — The Undertow

- [ ] **Step 1: Arc** `arc-the-undertow` (act-5, questIds = the 3 below).
- [ ] **Step 2: Quests:** `quest-the-brink` (giver char-warden-bright, region-gildmark, faction-gildmark-council, unlockedBy `["act-5","event-relic-deal-struck"]` — stop the sale at the harbor) → `quest-the-brokers-ledger` (giver char-elder-of-rooktide, region-gildmark, faction-gildmark-council, unlockedBy `["quest-the-brink"]`) → `quest-the-first-crossing` (giver char-elder-of-rooktide, region-rooktide, faction-norhollow-banner, unlockedBy `["quest-the-brokers-ledger","event-bells-ring-true"]` — no treaty; the first small bonds cross the line).
- [ ] **Step 3: Events:** `event-relic-sale-stopped` (15, triggeredBy quest-the-brink, involves char-iron-regent) · `event-broker-unmasked` (16, triggeredBy quest-the-brokers-ledger, involves char-the-broker) · `event-the-first-crossing` (17, triggeredBy quest-the-first-crossing, involves region-rooktide, char-liss-of-embervale, char-joren-of-norhollow).
- [ ] **Step 4: Dialogue:** `dlg-broker-at-the-harbor` (speaker char-the-broker, context event-broker-unmasked — his thesis, unrepentant) · `dlg-elder-of-rooktide-welcome` (speaker char-elder-of-rooktide, context quest-the-first-crossing).
- [ ] **Step 5: Verify + commit** — `"content: act 5 — the undertow (T7)"`. NOTE: the Widow gets no death and no defeat event — she walks away; that absence is the ending (spec §3/§4).

### Task 8: Side quests + the letter threads

**Interfaces — Consumes:** everything; **Produces:** the full lore corpus (36 fragments) and 7 side quests.

- [ ] **Step 1: Side arcs** — `arc-small-mercies` (act-2, questIds `["quest-the-bells-that-wont-stop","quest-two-plates-at-dusk","quest-the-last-letter","quest-salvage-and-medals"]`) · `arc-embers-that-remain` (act-4, questIds `["quest-the-deserters-name","quest-a-stall-rebuilt","quest-the-letter-that-arrived"]`).
- [ ] **Step 2: 7 side quests** per spec §8 beats (givers: any fitting existing char; regions: millcross/embervale/norhollow/ashvale-front; no main-spine quest may `unlockedBy` any of them; each follows the dark-quest rules; `quest-a-stall-rebuilt` and `quest-the-letter-that-arrived` are the warm counterpoints; `quest-the-last-letter` involves char-liss-of-embervale/char-joren-of-norhollow via its narrative and a `dlg-liss-last-letter` dialogue (speaker char-liss-of-embervale, context quest-the-last-letter)).
- [ ] **Step 3: Lore corpus — add 34 fragments** (2 exist from T2), anchors must resolve, each thread ends ≥2:

| thread | count | anchors spread over |
|---|---|---|
| the-cindervast-fall | +4 (=6) | region-cindervast, char-the-ash-prophet, faction-stoneguard, region-icefield |
| letters-across-the-line | 6 | char-liss-of-embervale, char-joren-of-norhollow, region-ashvale-front, region-millcross |
| the-quartermasters-log | 6 | region-spawn-meadow, region-millcross, char-quartermaster, event-refuge-at-millcross |
| a-fathers-postage | 4 | region-norhollow, region-ashvale-front |
| the-brokers-hand | 5 | region-gildmark, char-the-broker, event-first-caravan-burns |
| rooktide-ledger-of-return | 4 | region-rooktide, char-elder-of-rooktide |
| the-bent-bells | 5 | faction-bellfaith, char-the-bell-keeper, region-gildmark |

- [ ] **Step 4: Verify + commit** — gate exit 0, **zero thread-size WARNs**; scripts tests; graph regen; commit `"content: side quests + letter lore corpus (T8)"`.

### Task 9: Final coherence pass

- [ ] **Step 1: Orphan sweep** — `node scripts/check_content.mjs --require-complete` must exit 0. If any character/faction is still orphaned, wire it in with the lightest true edge (an `involves`, a lore anchor, a dialogue) — never delete story nodes to silence a warning.
- [ ] **Step 2: Budget audit vs spec §9** — count per kind (`node -e` one-liner over the JSON files) and record in the commit body: 5 acts / ~10 regions / 10 factions / 18 characters / 10 arcs / ~30 quests / 17 events / ~19 dialogue / 36 lore. Deviations ±20% are fine; larger ones need a stated reason.
- [ ] **Step 3: Full verification** — gate (0 failures, 0 warnings expected now except any pre-existing non-story ones), `--require-complete` exit 0, `gen_story_graph.mjs --check` in sync, scripts tests all green, explorer smoke tests green (`node --test tools/story-explorer/tests/*.test.mjs`), then load the explorer manually (`python3 -m http.server 7788` → tools/story-explorer/index.html) and confirm: 5 act groups, villains visible, lore threads filterable.
- [ ] **Step 4: Style compliance skim** — reread 10 random new nodes against `style.md` registers; fix any voice breaks.
- [ ] **Step 5: Commit** — `"content: undertow final coherence pass (T9)"`.

---

## Post-plan self-review notes (resolved inline)

- Spec coverage: §1→T1; §2→T2; §3→T3–T7 (one task per act, deaths in their acts); §4 villains→T2 nodes + voices in T5–T7 dialogue; §5 pillars→embodied in T3–T7 content (rulers/bellfaith/corruption beats named per task); §6→T1 magic rules + monster framing in quest narratives; §7→T8 threads table; §8→T8 side quests; §9→T9 audit; §10 exclusions honored (no code/schema/map/runtime work anywhere).
- Id consistency: every id referenced in Tasks 3–8 is minted in Task 2 or earlier in its own task; `unlockedBy` targets exist by the time they're written except `event-relic-deal-struck` (T6) ← consumed in T7 ✓ ordered.
- timelineOrder inventory: existing 1,3; this plan assigns 2,4–17 with no duplicates (T3:2 · T4:4,5,6,7 · T5:8,9,10 · T6:11,12,13,14 · T7:15,16,17).
- Creative prose is deliberately NOT in this plan — the spec + style.md govern it; reviewers check voice against the bible, structure against these tables.
