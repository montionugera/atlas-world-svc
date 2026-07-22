---
title: "Epic Story Pipeline — narrative schema + coherence gate + dual visualizer"
date: 2026-07-22
status: design-approved
scope: content + gate + visualizer only (runtime binding deferred → I-017)
relates_to: "I-013/F-010 (shipped region|faction skeleton), I-017 (deferred quest/gameplay runtime), I-019 (mob-types.json hard-check)"
---

# Epic Story Pipeline

> **Goal.** Grow the story pipeline from a thin skeleton (today: only `region` +
> `faction` kinds in one `content/story/story.json`, validated by
> `scripts/check_content.mjs`) into a **full narrative graph** — arcs, quests,
> characters, events, dialogue, faction relationships, timeline — plus a
> **whole-graph coherence gate** and **two visualizers** (a static CI/PR diagram
> and an interactive authoring explorer). The end state: an agent can
> **research → build → self-check → adversarially review → ship** a big story
> from a user prompt, and the gate keeps the epic coherent without a human
> reading every line.
>
> **Scope: content + gate + visualizer only.** No gameplay/runtime binding —
> turning a quest into a live in-game objective stays deferred (I-017, needs
> Godot/server). Everything here is verifiable with Node + a browser.

## 1. The connection model (how per-kind files form one graph)

Story content splits into **per-kind files** under `content/story/`, but they are
**one logical graph** assembled at load time:

- **Shared global id-space.** Every node's `id` is unique across *all* files.
- **Kind-prefixed ids** — `region-*`, `faction-*`, `char-*`, `arc-*`, `quest-*`,
  `event-*`, `dlg-*`. An id names its kind; collisions are obvious.
- **Edges are id references in fields** (e.g. `quest.giver: "char-quartermaster"`,
  `arc.questIds: [...]`, `character.faction: "faction-ashfang"`).
- **Union loader.** The gate and both visualizers read every file, build one
  `id → node` map, and resolve references against that union — regardless of
  which file a node physically lives in.
- **The gate enforces:** global id uniqueness + every reference resolves. A
  dangling `giver`/`arcId`/`prereq` is a hard fail.

```
arc ──questIds──▶ quest ──giver──▶ character ──faction──▶ faction ──mobFamily──▶ mob:*
                    │  └─region─▶ region                     └─relationships─▶ faction
                    └──prereq──▶ quest        event ──involves──▶ (any)   dlg ──speaker──▶ character
```

Splitting costs nothing in connectivity; it buys focused files (an agent builds
one kind at a time) and clean diffs.

## 2. Data model — seven node kinds

Each file is a JSON array of same-kind nodes, validated against a per-kind schema
in `content/schemas/`. `bible.md` remains the human prose companion. All nodes
share: `id` (kind-prefixed kebab), `title`, `kind`, `summary`, `links[]`.

| File | kind | Fields beyond the shared base |
|------|------|-------------------------------|
| `regions.json` | `region` | `dangerTier` (safe/low/mid/high) *(exists)* |
| `factions.json` | `faction` | `disposition` (hostile/friendly/neutral), `mobFamily[]` (real `mob:*` keys), **`relationships[] {factionId, stance:(ally/enemy/rival/neutral)}`** |
| `characters.json` | `character` | **`role`** (npc/ally/villain/neutral), **`faction?`**, **`region?`**, **`assetKey?`** (→ a real character sheet key) |
| `arcs.json` | `arc` | **`act`** (integer order), **`questIds[]`** (ordered) |
| `quests.json` | `quest` | **`narrative {description, offerText, completeText}`**, **`giver`** (characterId), **`region?`**, **`faction?`**, **`prereq?`** (questId), **`arcId`**, **`objectives[] {type, targetId, count}`** |
| `events.json` | `event` | **`timelineOrder`** (integer), **`involves[]`** (any ids), **`triggeredBy?`** (questId) |
| `dialogue.json` | `dialogue` | **`speaker`** (characterId), **`lines[]`** (strings), **`context?`** (quest/event id) |

**Notes.** `quest.objectives` mirrors the *shape* of the mechanical `QuestDef`
(F-001) but is the **content/narrative** layer — the binding to the runtime quest
engine is I-017, out of scope. `mob:*` targets/families hard-check once I-019
(`mob-types.json`) lands; until then they are the existing WARN.

## 3. Coherence gate — the unlock

Extend `check_content.mjs` with a **story-graph** branch that goes beyond "ids
resolve" to whole-graph coherence. This is the agent's self-review rubric.

**Reference resolution (FAIL on dangling):** `quest.giver→character`,
`quest.arcId→arc`, `quest.prereq→quest`, `arc.questIds→quest`,
`character.faction→faction`, `character.assetKey→real asset key`,
`event.involves→any id`, `dialogue.speaker→character`,
`faction.relationships.factionId→faction`, `character.links.story` (existing).

**Coherence rules:**
- Global `id` uniqueness across all files (FAIL on duplicate).
- Every `quest` has ≥1 objective, a `giver`, and a valid `arcId` (FAIL).
- Every `arc` has ≥1 quest; `act` values unique (FAIL).
- **`quest.prereq` forms a DAG — a cycle is a FAIL** (topological check).
- `event.timelineOrder` unique (FAIL); an `event.triggeredBy` quest should not
  sit "after" the event in timeline order (WARN).
- Orphans (WARN): a character referenced by nothing; a faction with no quest/
  character/event; a quest chain unreachable from a no-prereq start.
- Existing FAIL/WARN discipline + `--require-complete` escalation preserved.

## 4. Visualizers — both

**Static (CI/PR) — `scripts/gen_story_graph.mjs`.** Reads all story files → emits
a **Mermaid** graph to `docs/story/story-graph.md` (arcs→quests→factions→regions
→characters, colored by kind). Committed and **drift-checked** (regenerate +
compare, like `asset-keys.json`) so a PR shows the narrative shape and can't
silently drift. Renders natively in GitHub.

**Interactive (authoring) — `tools/story-explorer/index.html`.** A
**zero-dependency, self-contained** page (same pattern as `tools/asset-storybook`)
that `fetch`es the story files, builds the union graph, and renders a **clickable
node graph** — click a node to see its fields, filter by arc/faction/kind,
highlight a quest chain (prereq path). Open the file; no build, no server. This
is the "see your epic" tool for authoring + review.

## 5. Agent authoring loop

A `content/story/README.md` authoring guide documents the schema, the id/edge
conventions, and the ship steps. The loop that makes agent-authored epics safe:

```
prompt → research → write story files (one kind at a time)
       → check_content.mjs  (names every orphan / dangling / cycle — self-review rubric)
       → gen_story_graph.mjs (static graph = the review artifact)
       → adversarial subagent review of the diff
       → ship via ps-release-workflow → promote via PR + green CI
```

The **coherence gate is the automated reviewer**; the static graph + interactive
explorer are the human/agent visual check.

## 6. File layout & migration

```
content/story/
  bible.md            (prose companion — unchanged)
  regions.json  factions.json  characters.json
  arcs.json     quests.json    events.json     dialogue.json
content/schemas/
  region.schema.json  faction.schema.json  character.schema.json
  arc.schema.json  quest.schema.json  event.schema.json  dialogue.schema.json
scripts/
  check_content.mjs        (story-graph branch expanded)
  gen_story_graph.mjs      (static Mermaid + drift check)
  tests/                   (fixtures per coherence rule, green + red)
tools/story-explorer/
  index.html               (+ a smoke test that loads the real files)
docs/story/story-graph.md  (generated, drift-checked)
```

**Migration.** The existing `region`/`faction` entries move out of
`story.json` into `regions.json`/`factions.json`; `story.json` is removed.
Character sheets' `links.story` continue to resolve against the union (no change
to character files). The migration is one commit + a gate run proving parity.

## 7. Testing

- `check_content.mjs` unit fixtures (node `--test`) for **each** coherence rule,
  green **and** red (dangling giver → fail; prereq cycle → fail; arc with no
  quest → fail; orphan character → warn; etc.).
- `gen_story_graph.mjs` drift test (regenerate, assert equals committed).
- `story-explorer` smoke test (loads the real story files, builds the graph, no
  error) — headless where possible, else a documented manual eyeball.
- CI wires the story branch + graph drift into the existing content-gate job.

## 8. Non-goals (deferred / YAGNI)

- **No gameplay/runtime binding** — quest→live-objective, dialogue→in-game UI,
  giver proximity triggers all stay in I-017 (needs Godot/server).
- **No branching-dialogue engine** — dialogue is ordered snippets, not a tree.
- **No authoring GUI** — files are authored as JSON (by human or agent); the
  explorer is read-only visualization.

## 9. Suggested phase breakdown (for writing-plans)

1. **Schema + migration** — 7 per-kind schemas; migrate region/faction; gate
   still green on the migrated skeleton.
2. **Coherence gate** — expand `check_content.mjs` (resolution + coherence rules
   + prereq-DAG) with full green/red fixtures.
3. **Static visualizer** — `gen_story_graph.mjs` + drift test + CI wiring.
4. **Interactive explorer** — `tools/story-explorer/` + smoke test.
5. **Authoring guide + a seed epic** — `README.md` + a small worked multi-arc
   story exercising every kind, proving the agent loop end-to-end.

Each phase ends with the per-phase quality gate (implement → verify green+red →
independent adversarial review → refactor → re-verify).
