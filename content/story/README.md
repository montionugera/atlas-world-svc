# Story authoring guide

`content/story/` is a **narrative graph**: nine flat JSON files, one per node
kind, that get loaded into a single global `id → node` map and cross-checked
by `scripts/check_content.mjs`. This file is the guide an agent (or a human)
reads before authoring or extending an epic — the field contracts, the id/edge
conventions, the coherence rules the gate enforces, the commands to run, and
the loop that ships a new epic safely.

The `content/story/{acts,characters,arcs,quests,events,dialogue,lore}.json` +
`regions.json` + `factions.json` currently hold a small worked example (the
"Meadow Awakening" / "Icefield Reckoning" epic) that exercises every kind and
every edge type described below — read it alongside this guide, or copy its
shape as a template for a new epic.

**Voice law:** `content/story/style.md` is the theme bible — read it before
writing any title, summary, narrative text, dialogue line, or lore body; it
governs tone/register, naming morphology, town/faction/people/villain
identities, magic rules, and death/dark-quest rules for the Undertow epic
(and any epic authored after it).

## The nine kinds

Every node — regardless of kind — shares four base fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kind-prefixed kebab-case (see **Id conventions** below). Globally unique across all 9 files. |
| `title` | string, non-empty | Display name. |
| `kind` | string | Must equal the schema's fixed `kind` value (`"region"`, `"faction"`, etc.). |
| `summary` | string, non-empty | One-line description. |
| `links` | string[] | Loose kebab-case tags/refs. **Not** resolved or validated by the gate today — it's free-text cross-referencing (e.g. a region tagging the faction that holds it), separate from the schema's typed edge fields below, which *are* resolved. |

All nine schemas live in `content/schemas/` and are `additionalProperties:
false` — an unknown field on any node is a hard schema failure, not silently
ignored.

| File | kind | Fields beyond the shared base |
|---|---|---|
| `acts.json` | `act` | `order`: integer ≥1, unique **and** contiguous 1..N across all acts (the story spine); `theme`: one line |
| `regions.json` | `region` | `dangerTier`: `safe`\|`low`\|`mid`\|`high` |
| `factions.json` | `faction` | `disposition`: `hostile`\|`friendly`\|`neutral`; `mobFamily[]` (`mob:*` keys — hard FAIL if not a server mob id in `colyseus-server/generated/mob-types.json` (F-013); WARN-only against `asset-keys.json` render coverage); `relationships[]?` — `{factionId, stance: ally\|enemy\|rival\|neutral}` |
| `characters.json` | `character` | `role`: `npc`\|`ally`\|`villain`\|`neutral`; `faction?`; `region?`; `assetKey?` (must resolve to a real key in `colyseus-server/generated/asset-keys.json` — hard FAIL if set and missing); `status?`: `alive`\|`dead`\|`missing` (default `alive`); `diedAt?` (→ event) |
| `arcs.json` | `arc` | `actId` (→ act, required); `questIds[]`, minItems 1 |
| `quests.json` | `quest` | `narrative {description, offerText, completeText}` (all required); `giver` (→ character); `arcId` (→ arc); `region?`; `faction?`; `unlockedBy?[]`, minItems 1 (→ quest\|event\|act); `objectives[]`, minItems 1 — each `{type, targetId, count≥1}` |
| `events.json` | `event` | `timelineOrder`: integer, unique across all events; `involves[]`, minItems 1 (any node kind); `triggeredBy?` (→ quest); `unlockedBy?[]`, minItems 1 (→ quest\|event\|act) |
| `dialogue.json` | `dialogue` | `speaker` (→ character); `lines[]`, minItems 1, non-empty strings; `context?` (→ quest **or** event); `unlockedBy?[]`, minItems 1 (→ quest\|event\|act) |
| `lore.json` | `lore` | `body`: the discoverable text itself; `anchor` (→ **any** node kind, required); `thread`: plain string naming the mystery this fragment feeds — not an id-space, just a tag |

Note: `content/schemas/story-character.schema.json` backs `characters.json`
(the narrative graph's `character` kind) — it is deliberately **not** named
`character.schema.json`, because that name is already taken by the unrelated
F-005 markdown character-*sheet* schema for `content/characters/*.md`
(art-forge frontmatter: `assetKey`, `stats`, `status`, `tier` — a different
document with a different shape). Don't confuse the two.

## Id conventions

Every kind has a fixed id prefix, enforced by that kind's schema pattern:

| Kind | Prefix | Example |
|---|---|---|
| act | `act-` | `act-1` |
| region | `region-` | `region-icefield` |
| faction | `faction-` | `faction-stoneguard` |
| character | `char-` | `char-quartermaster` |
| arc | `arc-` | `arc-icefield-reckoning` |
| quest | `quest-` | `quest-icefield-reckoning` |
| event | `event-` | `event-twin-strike-falls` |
| dialogue | `dlg-` | `dlg-quartermaster-icefield-briefing` |
| lore | `lore-` | `lore-guarded-nothing` |

The id space is **global and flat** — two nodes in two different files can't
share an id even if their kinds differ; `loadStory()` (`scripts/lib/story.mjs`)
hard-fails on any duplicate id across the whole union. Because prefixes are
kind-locked, a target-kind mismatch on most edge fields is already impossible
by construction (a `giver` field can only ever match a `char-*` id, since only
`story-character.schema.json` mints those). The fields whose id pattern is
*not* kind-locked — `event.involves[]` (any kind), `dialogue.context` (quest
or event), `lore.anchor` (any kind), and `unlockedBy[]` (quest, event, or act,
disambiguated by prefix) — are exactly where the gate's kind check in
`resolveStoryRefs()` actually does work.

## Edge fields (what resolves against what)

Every typed reference field below is walked by `resolveStoryRefs()` in
`scripts/check_content.mjs` and must resolve to a real node of the stated
kind, or it's a hard FAIL (dangling id, or resolving to the wrong kind):

- `quest.giver` → character
- `quest.arcId` → arc
- `quest.unlockedBy[]` → quest **or** event **or** act (optional; see
  **Unlock mechanism (`unlockedBy`)** below)
- `quest.faction` → faction (optional)
- `quest.region` → region (optional)
- `arc.questIds[]` → quest
- `arc.actId` → act
- `character.faction` → faction (optional)
- `character.region` → region (optional)
- `character.assetKey` → a real id in `asset-keys.json` (optional field, but a
  set value that doesn't resolve is a hard FAIL)
- `character.diedAt` → event (optional; see **Character fates** below)
- `event.involves[]` → **any** node kind (FAIL if the id doesn't exist at all;
  no kind restriction)
- `event.triggeredBy` → quest (optional)
- `event.unlockedBy[]` → quest **or** event **or** act (optional)
- `dialogue.speaker` → character
- `dialogue.context` → quest **or** event (optional)
- `dialogue.unlockedBy[]` → quest **or** event **or** act (optional)
- `lore.anchor` → **any** node kind (FAIL if the id doesn't exist at all)
- `faction.relationships[].factionId` → faction

The two `mob:*` pseudo-refs — `quest.objectives[].targetId` (when it looks
like `mob:*`, and a `MOB_KILLED` objective's targetId MUST be `mob:*`) and
`faction.mobFamily[]` entries — are hard-FAILed against the generated
`colyseus-server/generated/mob-types.json` ("actually spawnable", F-013).
Each also keeps a softer WARN against `asset-keys.json` ("renderable
coverage") for the case where the two sets diverge.

### Unlock mechanism (`unlockedBy`)

`unlockedBy` is the **single** unlock mechanism in the graph — it replaces the
old `quest.prereq` field, which no longer exists (any `prereq` field on a
quest is now a hard schema failure, since schemas are
`additionalProperties: false`). It's an optional array (`minItems: 1` when
present) on **quest, event, and dialogue**. Semantics come from the id
**prefix** — there is no separate type field, no expressions:

| Referenced id prefix | Meaning |
|---|---|
| `quest-*` | that quest completed |
| `event-*` | that event fired |
| `act-*` | that act reached |

- A flat array is **AND only** — every entry must hold. No OR, no nesting, no
  flags, no counters, no stances. This is deliberate (see the design spec's
  Antagonist Doctrine §7: single canon, authored dilemmas, not per-player
  branches).
- Schema pattern: `^(quest|event|act)-[a-z0-9]+(-[a-z0-9]+)*$`.
- Gate: every `unlockedBy` id resolves to a real node of the kind its prefix
  implies (`resolveStoryRefs()`); `assertUnlockDag()` walks the whole
  quest/event/dialogue unlock graph (acts are sinks — they have no
  `unlockedBy` of their own; dialogue nodes have out-edges only, since nothing
  can be `unlockedBy` a dialogue id) and hard-FAILs on any cycle, naming every
  id in the cycle.
- `quest.unlockedBy` entries that point at another quest also feed
  **reachability**: `buildQuestReachability()` walks only the `quest-*`
  subset of `unlockedBy` (the statically-walkable part — `event-*`/`act-*`
  unlocks are runtime conditions, not something the gate can prove reachable
  ahead of time) and WARNs on any quest that can't trace back to a
  no-`unlockedBy` starting quest.

### Character fates

`character` gains two optional fields for minimal GoT-style mortality:

- `status`: `"alive" | "dead" | "missing"` (defaults to `alive` when absent).
- `diedAt`: an `event-*` id — the event this character died in/at.

Gate: `diedAt` set while `status` is `"alive"` (or absent, since absent
defaults to alive) is a hard FAIL — a character can't have a recorded death
event and still be alive. There is deliberately no schema for dead-speaker
timing rules or posthumous-dialogue flags — that's authoring discipline, not
gate machinery.

## Coherence rules (beyond simple reference resolution)

Run in this order inside `checkStory()`: schema validation (in `loadStory()`)
→ `resolveStoryRefs()` → `checkActOrdering()` → `assertUnlockDag()` →
`checkStoryCoherence()`.

**Hard FAILs, always:**
- Global id uniqueness (from `loadStory()`).
- Every schema `required`/`additionalProperties` constraint.
- Every quest has ≥1 objective, a `giver`, and an `arcId` (re-checked directly
  against raw parsed entries, not just via schema `minItems`/`required`, so
  the message is clear even alongside the generic schema error).
- Every arc has ≥1 quest (`questIds` non-empty).
- Duplicate `event.timelineOrder` across two or more events.
- **Act ordering** (`checkActOrdering()`) — `act.order` values must be unique
  across all acts, and the set of orders must be contiguous `1..N` (N = act
  count). **Multiple arcs may legally share one act** (parallel storylines);
  the old duplicate-`arc.act` FAIL is deliberately gone — act uniqueness now
  lives entirely on `act.order`, not on how many arcs point at an act.
- **`diedAt` vs `status`** — a character with `diedAt` set while `status` is
  `"alive"` (or absent, since absent defaults to `alive`).
- **`unlockedBy` cycles** — `assertUnlockDag()` does a DFS with white/grey/black
  coloring over the whole quest/event/dialogue unlock graph (out-degree is now
  unbounded — a flat array, not a single field — so every successor is
  walked) and FAILs naming every id in the cycle. Dangling `unlockedBy` ids
  are skipped here (already FAILed by `resolveStoryRefs()`), never crashed on
  or misreported as a cycle.

**WARNs by default, escalated to FAILs by `--require-complete`:**
- **Orphan character** — a character id that no `quest` field (`giver` in
  practice — that's the only quest field that ever points at a character), no
  `event.involves`, and no `dialogue` field (`speaker` or `context`)
  references. In short: put every character in at least one quest, event, or
  dialogue, or it's an orphan.
- **Orphan faction** — not referenced by any `quest.faction`,
  `character.faction`, or `event.involves`.
- **Unreachable quest** — a quest whose `unlockedBy` chain, walked back
  through only the `quest-*` entries (the statically-walkable subset — see
  **Unlock mechanism** above), never reaches a quest with no `unlockedBy` at
  all. A dangling quest-prefixed dep or a cycle both count as "unreachable"
  here too, on top of their own separate FAILs.

**WARN, never escalated (consistency/coverage checks, not completeness gaps):**
- `event.triggeredBy` quest's arc's act `.order` is later than the event's
  `.timelineOrder` — i.e. the event claims to have happened "before" the act
  that triggers it starts. This is a narrative-ordering smell, not a
  completeness gap, so `--require-complete` intentionally leaves it a WARN.
- **Lore thread size** — a `lore.thread` value used by fewer than 2 fragments
  ("a thread of one isn't a mystery"). Also deliberately not escalated —
  coverage-of-a-mystery, not a structural gap.

## Commands

All run from the repo root.

```bash
# Full content gate: character sheets + maps + the 9 story files.
# Exit 0 with 0 failures = green; WARNs are allowed at exit 0.
node scripts/check_content.mjs

# Same gate, but escalate orphan-character / orphan-faction / unreachable-quest
# WARNs to FAILs. This is the bar a shipped epic must clear — no coverage gaps.
node scripts/check_content.mjs --require-complete

# Regenerate the static Mermaid graph (docs/story/story-graph.md) from the
# current content/story/*.json files.
node scripts/gen_story_graph.mjs --write

# Verify the committed graph matches current content (CI runs this after the
# content gate; a stale artifact fails the build).
node scripts/gen_story_graph.mjs --check

# Run every gate/graph unit test (fixtures for each coherence rule, green and
# red, plus the seed-epic end-to-end proof). Always the *.test.mjs glob, never
# a bare directory — a bare dir silently no-ops on some Node versions.
cd scripts && node --test tests/*.test.mjs

# Explorer smoke test: graph.mjs is the pure buildGraph() shared by
# tools/story-explorer/index.html and this test — run from the repo root
# (not from scripts/).
cd .. && node --test tools/story-explorer/tests/*.test.mjs

# Interactive explorer: serve the repo root (the page fetches
# ../../content/story/*.json relative to itself) and open it in a browser.
python3 -m http.server 7788 --bind 127.0.0.1
# then open http://127.0.0.1:7788/tools/story-explorer/index.html
```

`node scripts/check_content.mjs` is what CI runs today (without
`--require-complete` — see `.github/workflows/ci.yml`); run the
`--require-complete` variant yourself before shipping new story content, since
it's the stricter bar and isn't (yet) the CI default.

## The agent authoring loop

This is the loop a prompt-to-epic agent (or a human) should follow, matching
`docs/superpowers/specs/2026-07-22-epic-story-pipeline-design.md` §5:

1. **Research** — read `bible.md`, the existing `content/story/*.json` files,
   `content/characters/*.md` (real character sheets / `assetKey`s), and
   `content/maps/*.md` (real regions). Never invent a faction, region, or mob
   family that doesn't already exist in the bible — extend the bible first if
   the story genuinely needs a new one.
2. **Write story files, one kind at a time, in this order** — **acts** first
   (the spine: how many, what order, what theme), then **regions/factions/
   characters** (the nouns), then **arcs** (which act each belongs to), then
   **quests** (the structure, chained via `unlockedBy`), then **events/
   dialogue** (the connective narrative tissue, also `unlockedBy`-chainable),
   then **lore** last (fragments anchor onto nodes that must already exist).
   Keep existing ids stable; other files (character sheets' `links.story`,
   other quests'/events'/dialogue's `unlockedBy` chains) may already depend on
   them.
3. **Gate self-review** — run `node scripts/check_content.mjs
   --require-complete`. Every FAIL and WARN it prints names the exact node and
   field at fault — treat the WARN list as a checklist, not noise, before
   shipping. Fix and re-run until clean.
4. **Static graph** — run `node scripts/gen_story_graph.mjs --write` and look
   at `docs/story/story-graph.md`'s Mermaid diagram (renders natively on
   GitHub/in most Markdown viewers; nodes are grouped into a subgraph per act).
   Confirm the shape reads the way the story was intended: quests chain the
   way you meant, no arc is an island, no character sits off to the side.
5. **Adversarial review** — get a second, skeptical pass on the diff (a fresh
   subagent or a human): does the new content exercise the edges it claims to?
   Does every new quest have a real reason to exist? Is a "valid" `unlockedBy`
   chain actually valid, or does it stop one hop short of the arc's other
   quests? Is the tone consistent with `bible.md`?
6. **Ship** — commit the story files together with the regenerated
   `docs/story/story-graph.md` in the **same** commit (the drift gate compares
   the committed graph against a fresh regeneration — a content change without
   a graph regeneration is a gate failure on the next CI run). Route through
   this repo's normal `ps-release-workflow` flow (claim → implement → ship →
   promote via PR + green CI) like any other feature.

The **coherence gate is the automated reviewer** in this loop; the static
graph and the interactive explorer (`tools/story-explorer/index.html`) are the
human/agent visual check — use both, they catch different kinds of mistakes
(the gate catches broken references and structural gaps; the visualizers
catch narrative shape mistakes a passing gate can't see, like an arc that's
technically valid but reads as disconnected from the rest of the epic).

## Epic authoring doctrine (binding on future epics)

Everything above is structural — what the gate can prove. The **Antagonist
Doctrine** in `docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md`
§7 is the binding *creative* doctrine on top of it for any future epic
authoring in this repo: the villain attacks the story's core theme (not the
hero), is immaterial/unbribable, is partially right (a mirror of hypocrisy),
and does its damage entirely through existing machinery — events, `diedAt`
fates, and `unlockedBy` chains — never a bespoke villain schema. The spec's §7
also states the **single-canon rule**: this is a shared-world multiplayer
server, so canon cannot fork per player — dilemmas are authored into the
story itself, not branched per player choice, which is exactly why flat
AND-only `unlockedBy` is sufficient and OR/branching unlock logic is out of
scope. Read §7 before writing quests/events/dialogue/lore for a new epic.
