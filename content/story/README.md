# Story authoring guide

`content/story/` is a **narrative graph**: seven flat JSON files, one per node
kind, that get loaded into a single global `id → node` map and cross-checked
by `scripts/check_content.mjs`. This file is the guide an agent (or a human)
reads before authoring or extending an epic — the field contracts, the id/edge
conventions, the coherence rules the gate enforces, the commands to run, and
the loop that ships a new epic safely.

The `content/story/{characters,arcs,quests,events,dialogue}.json` +
`regions.json` + `factions.json` currently hold a small worked example (the
"Meadow Awakening" / "Icefield Reckoning" epic) that exercises every kind and
every edge type described below — read it alongside this guide, or copy its
shape as a template for a new epic.

## The seven kinds

Every node — regardless of kind — shares four base fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kind-prefixed kebab-case (see **Id conventions** below). Globally unique across all 7 files. |
| `title` | string, non-empty | Display name. |
| `kind` | string | Must equal the schema's fixed `kind` value (`"region"`, `"faction"`, etc.). |
| `summary` | string, non-empty | One-line description. |
| `links` | string[] | Loose kebab-case tags/refs. **Not** resolved or validated by the gate today — it's free-text cross-referencing (e.g. a region tagging the faction that holds it), separate from the schema's typed edge fields below, which *are* resolved. |

All seven schemas live in `content/schemas/` and are `additionalProperties:
false` — an unknown field on any node is a hard schema failure, not silently
ignored.

| File | kind | Fields beyond the shared base |
|---|---|---|
| `regions.json` | `region` | `dangerTier`: `safe`\|`low`\|`mid`\|`high` |
| `factions.json` | `faction` | `disposition`: `hostile`\|`friendly`\|`neutral`; `mobFamily[]` (`mob:*` keys — hard FAIL if not a server mob id in `colyseus-server/generated/mob-types.json` (F-013); WARN-only against `asset-keys.json` render coverage); `relationships[]?` — `{factionId, stance: ally\|enemy\|rival\|neutral}` |
| `characters.json` | `character` | `role`: `npc`\|`ally`\|`villain`\|`neutral`; `faction?`; `region?`; `assetKey?` (must resolve to a real key in `colyseus-server/generated/asset-keys.json` — hard FAIL if set and missing) |
| `arcs.json` | `arc` | `act`: integer ≥1, unique across all arcs; `questIds[]`, minItems 1 |
| `quests.json` | `quest` | `narrative {description, offerText, completeText}` (all required); `giver` (→ character); `arcId` (→ arc); `region?`; `faction?`; `prereq?` (→ quest); `objectives[]`, minItems 1 — each `{type, targetId, count≥1}` |
| `events.json` | `event` | `timelineOrder`: integer, unique across all events; `involves[]`, minItems 1 (any node kind); `triggeredBy?` (→ quest) |
| `dialogue.json` | `dialogue` | `speaker` (→ character); `lines[]`, minItems 1, non-empty strings; `context?` (→ quest **or** event) |

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
| region | `region-` | `region-icefield` |
| faction | `faction-` | `faction-stoneguard` |
| character | `char-` | `char-quartermaster` |
| arc | `arc-` | `arc-icefield-reckoning` |
| quest | `quest-` | `quest-icefield-reckoning` |
| event | `event-` | `event-twin-strike-falls` |
| dialogue | `dlg-` | `dlg-quartermaster-icefield-briefing` |

The id space is **global and flat** — two nodes in two different files can't
share an id even if their kinds differ; `loadStory()` (`scripts/lib/story.mjs`)
hard-fails on any duplicate id across the whole union. Because prefixes are
kind-locked, a target-kind mismatch on most edge fields is already impossible
by construction (a `giver` field can only ever match a `char-*` id, since only
`story-character.schema.json` mints those). The two fields whose id pattern is
*not* kind-locked — `event.involves[]` (any kind) and `dialogue.context`
(quest or event) — are exactly where the gate's kind check in
`resolveStoryRefs()` actually does work.

## Edge fields (what resolves against what)

Every typed reference field below is walked by `resolveStoryRefs()` in
`scripts/check_content.mjs` and must resolve to a real node of the stated
kind, or it's a hard FAIL (dangling id, or resolving to the wrong kind):

- `quest.giver` → character
- `quest.arcId` → arc
- `quest.prereq` → quest (optional)
- `quest.faction` → faction (optional)
- `quest.region` → region (optional)
- `arc.questIds[]` → quest
- `character.faction` → faction (optional)
- `character.region` → region (optional)
- `character.assetKey` → a real id in `asset-keys.json` (optional field, but a
  set value that doesn't resolve is a hard FAIL — not the WARN that
  `quest.objectives[].targetId` / `faction.mobFamily[]` mob-key refs get)
- `event.involves[]` → **any** node kind (FAIL if the id doesn't exist at all;
  no kind restriction)
- `event.triggeredBy` → quest (optional)
- `dialogue.speaker` → character
- `dialogue.context` → quest **or** event (optional)
- `faction.relationships[].factionId` → faction

Two edge-shaped fields are deliberately **WARN, not FAIL**, because there's no
generated registry to hard-check them against yet (tracked as I-019):
`quest.objectives[].targetId` when it looks like a `mob:*` pseudo-ref, and
`faction.mobFamily[]` entries — both checked against `asset-keys.json` but
only ever downgraded to a warning if missing.

## Coherence rules (beyond simple reference resolution)

Run in this order inside `checkStory()`: schema validation (in `loadStory()`)
→ `resolveStoryRefs()` → `assertQuestPrereqDag()` → `checkStoryCoherence()`.

**Hard FAILs, always:**
- Global id uniqueness (from `loadStory()`).
- Every schema `required`/`additionalProperties` constraint.
- Every quest has ≥1 objective, a `giver`, and an `arcId` (re-checked directly
  against raw parsed entries, not just via schema `minItems`/`required`, so
  the message is clear even alongside the generic schema error).
- Every arc has ≥1 quest (`questIds` non-empty).
- Duplicate `arc.act` across two or more arcs.
- Duplicate `event.timelineOrder` across two or more events.
- **`quest.prereq` cycles** — `assertQuestPrereqDag()` does a DFS with
  white/grey/black coloring over the prereq graph (each quest has out-degree
  ≤1, so it's a functional graph) and FAILs naming every id in the cycle.

**WARNs by default, escalated to FAILs by `--require-complete`:**
- **Orphan character** — a character id that no `quest` field (`giver` in
  practice — that's the only quest field that ever points at a character), no
  `event.involves`, and no `dialogue` field (`speaker` or `context`)
  references. In short: put every character in at least one quest, event, or
  dialogue, or it's an orphan.
- **Orphan faction** — not referenced by any `quest.faction`,
  `character.faction`, or `event.involves`.
- **Unreachable quest** — a quest whose `.prereq` chain (walked back) never
  reaches a quest with no `prereq` at all (a dangling prereq or a cycle both
  count as "unreachable" here too, on top of their own separate FAILs).

**WARN, never escalated (a consistency check, not a coverage one):**
- `event.triggeredBy` quest's arc `.act` is later than the event's
  `.timelineOrder` — i.e. the event claims to have happened "before" the arc
  that triggers it starts. This is a narrative-ordering smell, not a
  completeness gap, so `--require-complete` intentionally leaves it a WARN.

## Commands

All run from the repo root.

```bash
# Full content gate: character sheets + maps + the 7 story files.
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

# Run every gate/graph/explorer unit test (fixtures for each coherence rule,
# green and red, plus the seed-epic end-to-end proof).
cd scripts && node --test tests/*.test.mjs
node --test tools/story-explorer/tests/*.test.mjs

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
2. **Write story files, one kind at a time** — regions/factions/characters
   first (the nouns), then arcs/quests (the structure), then events/dialogue
   (the connective narrative tissue). Keep existing ids stable; other files
   (character sheets' `links.story`, other arcs' `prereq` chains) may already
   depend on them.
3. **Gate self-review** — run `node scripts/check_content.mjs
   --require-complete`. Every FAIL and WARN it prints names the exact node and
   field at fault — treat the WARN list as a checklist, not noise, before
   shipping. Fix and re-run until clean.
4. **Static graph** — run `node scripts/gen_story_graph.mjs --write` and look
   at `docs/story/story-graph.md`'s Mermaid diagram (renders natively on
   GitHub/in most Markdown viewers). Confirm the shape reads the way the story
   was intended: quests chain the way you meant, no arc is an island, no
   character sits off to the side.
5. **Adversarial review** — get a second, skeptical pass on the diff (a fresh
   subagent or a human): does the new content exercise the edges it claims to?
   Does every new quest have a real reason to exist? Is a "valid" prereq chain
   actually valid, or does it stop one hop short of the arc's other quests? Is
   the tone consistent with `bible.md`?
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
