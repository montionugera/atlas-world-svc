# Epic Story Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the story pipeline from a `region|faction` skeleton into a full narrative graph (7 node kinds across per-kind files), a whole-graph coherence gate, and two visualizers (static Mermaid + interactive explorer) — so an agent can build a coherent epic from a prompt.

**Architecture:** Content-only. Per-kind JSON files under `content/story/` share one global id-space; nodes reference each other by kind-prefixed id; a union loader assembles them into one graph. `scripts/check_content.mjs` gains a story-graph branch that resolves every cross-file reference and enforces coherence (orphans, completeness, prereq-DAG). `scripts/gen_story_graph.mjs` emits a drift-checked Mermaid diagram; `tools/story-explorer/` renders an interactive graph. No gameplay/runtime binding (deferred → I-017).

**Tech Stack:** Node ESM (no TypeScript in the gate/scripts), `ajv` + `js-yaml` (already in `scripts/package.json`), `node --test` for unit tests, zero-dependency vanilla HTML/JS/SVG for the explorer, Mermaid for the static graph.

## Global Constraints

- **Scope: content + gate + visualizer only.** No server/Nakama/Godot changes; no quest→gameplay binding (I-017). Every deliverable is verifiable with Node + a browser.
- **Per-kind files, one id-space.** Files: `content/story/{regions,factions,characters,arcs,quests,events,dialogue}.json`. Every node `id` is globally unique across ALL files and **kind-prefixed**: `region-` `faction-` `char-` `arc-` `quest-` `event-` `dlg-`.
- **Edges are id references**; the loader resolves them against the union `id→node` map. A dangling reference is a hard FAIL.
- **Gate discipline (unchanged):** warnings → exit 0, failures → exit 1, `--require-complete` escalates coverage warnings to failures. The gate is repo-root plain ESM — it reads JSON directly, **never imports TypeScript / @atlas/contracts**.
- **Monster references** (`faction.mobFamily`, `quest.objectives[].targetId` of form `mob:*`) stay **WARN-only** until I-019 (`mob-types.json`) lands; assetKeys check against `colyseus-server/generated/asset-keys.json` as today.
- **Tests:** `node --test` fixtures under `scripts/tests/`, each rule proven **green AND red**. Conventional commits, one logical unit per task. Ships via ps-release-workflow (idea→refine→claim→ship→promote).
- **Per-phase quality gate (every task):** implement → verify (run gate/tests, green + red) → independent adversarial review of the task diff (fresh subagent) → refactor → re-verify.

---

### Task 1: Per-kind schemas + migrate region/faction out of `story.json`

**Files:**
- Create: `content/schemas/{region,faction,character,arc,quest,event,dialogue}.schema.json`
- Create: `content/story/{regions,factions,characters,arcs,quests,events,dialogue}.json`
- Delete: `content/story/story.json` (migrated)
- Modify: `scripts/check_content.mjs` (story branch reads the per-kind files instead of `story.json`)

**Interfaces:**
- Produces: the on-disk file set + a `STORY_KINDS` list `["region","faction","character","arc","quest","event","dialogue"]` and a `loadStory(contentRoot)` helper in `check_content.mjs` returning `{ nodes: Map<id,node>, byKind: Map<kind,node[]> }` (consumed by Tasks 2–4 and by `gen_story_graph.mjs`).

**Schema field contract** (draft-07, `additionalProperties:false`, common required `id,title,kind,summary,links`; `id` pattern `^<prefix>-[a-z0-9]+(-[a-z0-9]+)*$` per kind):
- `region`: + `dangerTier` enum `safe|low|mid|high`.
- `faction`: + `disposition` enum `hostile|friendly|neutral` (required), `mobFamily` array of `^mob:[a-z0-9_]+$` (required, may be empty), `relationships` array of `{factionId, stance:(ally|enemy|rival|neutral)}`.
- `character`: + `role` enum `npc|ally|villain|neutral` (required), optional `faction`, `region`, `assetKey`.
- `arc`: + `act` integer ≥1 (required), `questIds` array (required, ≥1).
- `quest`: + `narrative {description, offerText, completeText}` (required), `giver` (required), `arcId` (required), optional `region`,`faction`,`prereq`, `objectives` array of `{type,targetId,count}` (required, ≥1).
- `event`: + `timelineOrder` integer (required), `involves` array (required), optional `triggeredBy`.
- `dialogue`: + `speaker` (required), `lines` array of strings (required, ≥1), optional `context`.

- [ ] **Step 1: Write the failing test** — `scripts/tests/story-migration.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
test("story.json is gone; per-kind files exist", () => {
  assert.equal(existsSync(join(ROOT, "content/story/story.json")), false);
  for (const f of ["regions","factions","characters","arcs","quests","events","dialogue"])
    assert.ok(existsSync(join(ROOT, `content/story/${f}.json`)), `${f}.json missing`);
});
test("gate is green on migrated content", () => {
  const out = execFileSync(process.execPath, [join(ROOT,"scripts/check_content.mjs")], { encoding:"utf8" });
  assert.match(out, /0 failures/);
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd scripts && node --test tests/story-migration.test.mjs` → FAIL (files not yet created).
- [ ] **Step 3: Author the 7 schemas** per the field contract above (mirror the style of `content/schemas/{map,character}.schema.json` — read them first for the exact draft-07 idiom).
- [ ] **Step 4: Migrate data** — move the 3 existing `region` entries into `regions.json` and the 5 `faction` entries into `factions.json` (drop the `kind`-discriminated wrapper; each file is a flat array of that kind). Create `characters.json` seeded from the 8 existing character sheets' `npc`/`player` where sensible, and empty `[]` for `arcs/quests/events/dialogue` (real content comes in Task 7). Delete `story.json`.
- [ ] **Step 5: Update `check_content.mjs`** — replace the single-`story.json` read with `loadStory()` that reads all 7 files, builds the union `id→node` map (FAIL on a duplicate id across files), and re-runs the **existing** checks (faction `mobFamily`→asset keys; character `links.story`→a real node id). Keep character/map branches untouched.
- [ ] **Step 6: Verify** — `cd scripts && node --test tests/story-migration.test.mjs` PASS; `node scripts/check_content.mjs` → 0 failures; `node scripts/check_content.mjs --require-complete` behaves.
- [ ] **Step 7: Commit** — `feat(content): split story.json into 7 per-kind files + schemas (migration)`.

**Quality gate:** implement → run the migration test + both gate modes (paste output) → adversarial review of the schema/migration diff (are all 8 character `links.story` refs still resolving? any id collision? faction/region parity vs the old story.json?) → refactor → re-verify.

---

### Task 2: Reference resolution across the union graph

**Files:**
- Modify: `scripts/check_content.mjs` (add `resolveStoryRefs(story, assetKeyIds, fail, warn)`)
- Create: `scripts/tests/story-refs.test.mjs`

**Interfaces:**
- Consumes: `loadStory()` from Task 1.
- Produces: `resolveStoryRefs(...)` — validates every cross-node edge; used by Tasks 3–4.

**Edge rules (FAIL on dangling):** `quest.giver`→character; `quest.arcId`→arc; `quest.prereq`→quest; `arc.questIds[]`→quest; `character.faction`→faction; `character.region`→region; `event.involves[]`→any id; `event.triggeredBy`→quest; `dialogue.speaker`→character; `dialogue.context`→quest|event; `faction.relationships[].factionId`→faction. `character.assetKey`→asset-keys.json (FAIL). `quest.objectives[].targetId` / `faction.mobFamily[]` of form `mob:*` → **WARN** until I-019.

- [ ] **Step 1: Write the failing test** — `scripts/tests/story-refs.test.mjs` builds a temp content root (copy the migrated files into a tmp dir, like `check_content.test.mjs` does) and asserts:

```js
test("dangling quest.giver is a hard fail", () => {
  const dir = fixture({ quests:[{ id:"quest-x", kind:"quest", title:"X", summary:"s", links:[],
    narrative:{description:"d",offerText:"o",completeText:"c"}, giver:"char-nope",
    arcId:"arc-a", objectives:[{type:"MOB_KILLED",targetId:"mob:aggressive",count:1}] }],
    arcs:[{id:"arc-a",kind:"arc",title:"A",summary:"s",links:[],act:1,questIds:["quest-x"]}] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /quest-x.*giver.*char-nope/);
});
```

- [ ] **Step 2: Run it, verify it fails** — `node --test tests/story-refs.test.mjs` → FAIL (no resolver yet).
- [ ] **Step 3: Implement `resolveStoryRefs`** — iterate every node; for each edge field look up the target in the union map; `fail(...)` on a miss (naming node id + field + bad ref); `warn(...)` for `mob:*` targets. Wire it into `checkStory()` after `loadStory()`.
- [ ] **Step 4: Verify** — add green cases (all refs resolve → exit 0) + a red case per edge kind; `node --test tests/story-refs.test.mjs` PASS; real `node scripts/check_content.mjs` still 0 failures.
- [ ] **Step 5: Commit** — `feat(content): whole-graph reference resolution in the story gate`.

**Quality gate:** implement → run fixtures (green + one red per edge kind, paste) → adversarial review (any edge kind unchecked? does a `mob:*` target correctly WARN not FAIL? false positive on optional fields?) → refactor → re-verify.

---

### Task 3: Coherence rules (completeness + orphans)

**Files:**
- Modify: `scripts/check_content.mjs` (add `checkStoryCoherence(story, fail, warn, requireComplete)`)
- Create: `scripts/tests/story-coherence.test.mjs`

**Rules:** FAIL — a `quest` with 0 objectives, or missing `giver`/`arcId`; an `arc` with 0 `questIds`; duplicate `arc.act`; duplicate `event.timelineOrder`. WARN — a `character` referenced by no quest/faction/event/dialogue; a `faction` with no quest/character/event referencing it; a `quest` unreachable from a no-`prereq` start; `event.triggeredBy` quest whose arc `act` is later than the event's `timelineOrder`.

- [ ] **Step 1: Write the failing test** — `story-coherence.test.mjs`:

```js
test("an arc with no quests is a hard fail", () => {
  const dir = fixture({ arcs:[{id:"arc-empty",kind:"arc",title:"E",summary:"s",links:[],act:1,questIds:[]}] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /arc-empty.*no quest/i);
});
test("an orphan character is a warning, not a fail", () => {
  const dir = fixture({ characters:[{id:"char-lonely",kind:"character",title:"L",summary:"s",links:[],role:"npc"}] });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*char-lonely/);
});
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement `checkStoryCoherence`** — completeness FAILs + orphan/reachability WARNs (a reverse-reference index built once from the union). `requireComplete` escalates the WARNs.
- [ ] **Step 4: Verify** — green + red per rule; real gate 0 failures.
- [ ] **Step 5: Commit** — `feat(content): story coherence rules (completeness + orphans)`.

**Quality gate:** implement → fixtures (green + red per rule) → adversarial review (is the reachability check correct? does `--require-complete` escalate exactly the coverage WARNs? any rule that false-fails the seed epic in Task 7?) → refactor → re-verify.

---

### Task 4: Prereq-DAG cycle check

**Files:**
- Modify: `scripts/check_content.mjs` (add `assertQuestPrereqDag(story, fail)`)
- Create: `scripts/tests/story-prereq-dag.test.mjs`

**Interfaces:** Produces `assertQuestPrereqDag` — builds a directed graph `quest → quest.prereq` and FAILs on any cycle, naming the cycle members.

- [ ] **Step 1: Write the failing test:**

```js
test("a prereq cycle is a hard fail", () => {
  const q = (id, prereq) => ({ id, kind:"quest", title:id, summary:"s", links:[],
    narrative:{description:"d",offerText:"o",completeText:"c"}, giver:"char-g", arcId:"arc-a",
    prereq, objectives:[{type:"MOB_KILLED",targetId:"mob:aggressive",count:1}] });
  const dir = fixture({
    characters:[{id:"char-g",kind:"character",title:"G",summary:"s",links:[],role:"npc"}],
    arcs:[{id:"arc-a",kind:"arc",title:"A",summary:"s",links:[],act:1,questIds:["quest-1","quest-2"]}],
    quests:[ q("quest-1","quest-2"), q("quest-2","quest-1") ] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /cycle.*quest-1.*quest-2|quest-2.*quest-1/i);
});
```

- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Implement `assertQuestPrereqDag`** — DFS with a recursion stack (white/grey/black coloring); on revisiting a grey node, `fail()` with the cycle path. Only over quests with a `prereq`.
- [ ] **Step 4: Verify** — cycle → fail; a valid chain (`quest-3` prereq `quest-2` prereq `quest-1` prereq null) → pass; self-prereq → fail; real gate 0 failures.
- [ ] **Step 5: Commit** — `feat(content): quest prereq DAG (cycle) check`.

**Quality gate:** implement → fixtures (cycle, self-cycle, valid chain, diamond) → adversarial review (does it catch a 3-node cycle? a self-loop? does a diamond (two paths to one prereq) correctly PASS — it's a DAG not a tree?) → refactor → re-verify.

---

### Task 5: Static visualizer — `gen_story_graph.mjs` + drift test + CI

**Files:**
- Create: `scripts/gen_story_graph.mjs`
- Create: `docs/story/story-graph.md` (generated)
- Create: `scripts/tests/story-graph-drift.test.mjs`
- Modify: `.github/workflows/ci.yml` (add a "story graph drift" step after the content gate)

**Interfaces:** `gen_story_graph.mjs` reads the 7 files via the same union-load logic (extract `loadStory` into `scripts/lib/story.mjs` so the gate and the generator share ONE loader — do this refactor here, updating `check_content.mjs` to import it), emits a Mermaid `flowchart` to `docs/story/story-graph.md` with nodes colored by kind and edges per reference. Deterministic (stable sort) so drift is meaningful.

- [ ] **Step 1: Extract the shared loader** — move `loadStory()` into `scripts/lib/story.mjs` (exported); `check_content.mjs` imports it. Run `node --test tests/` → still green (no behavior change).
- [ ] **Step 2: Write the failing drift test** — `story-graph-drift.test.mjs`: run `gen_story_graph.mjs --check` (regenerate to a temp, compare to committed `docs/story/story-graph.md`) → exit 0 when in sync.
- [ ] **Step 3: Run it, verify it fails** (generator missing).
- [ ] **Step 4: Implement `gen_story_graph.mjs`** — `--write` (default) emits the file, `--check` compares and exits 1 on drift. Mermaid: `flowchart LR`, `class` per kind (arc/quest/character/faction/region/event/dialogue), edges labeled by field (giver/prereq/arcId/faction…).
- [ ] **Step 5: Generate + commit the artifact** — `node scripts/gen_story_graph.mjs --write`; verify it renders (paste the mermaid; eyeball in any Mermaid live editor or the story-explorer later).
- [ ] **Step 6: Wire CI** — add `node scripts/gen_story_graph.mjs --check` to `.github/workflows/ci.yml` after the content gate.
- [ ] **Step 7: Verify + Commit** — drift test PASS; break a story file → `--check` exit 1 → revert. Commit `feat(tools): static story-graph generator + drift gate`.

**Quality gate:** implement → drift test green + proven red → adversarial review (is output deterministic across runs? does the shared-loader refactor keep the gate byte-identical? does CI actually fail on drift?) → refactor → re-verify.

---

### Task 6: Interactive `story-explorer`

**Files:**
- Create: `tools/story-explorer/index.html` (+ `README.md`)
- Create: `tools/story-explorer/tests/smoke.test.mjs`

**Interfaces:** A zero-dependency self-contained page (mirror `tools/asset-storybook/index.html`): `fetch`es the 7 `content/story/*.json` (served relative), builds the union graph in JS, renders an SVG node graph (simple layered/force layout, no external lib), click a node → side panel of its fields + resolved neighbors, filter by kind/arc/faction, highlight a quest's prereq chain. No build, no bundler.

- [ ] **Step 1: Write the failing smoke test** — `smoke.test.mjs`: load the real 7 files, run the SAME graph-build function the page uses (factor the pure graph-build into `tools/story-explorer/graph.mjs`, imported by both the page and the test), assert every edge resolves and node count > 0.
- [ ] **Step 2: Run it, verify it fails** (module missing).
- [ ] **Step 3: Implement `graph.mjs`** — pure `buildGraph(files) → {nodes, edges}`; reused by the page + test.
- [ ] **Step 4: Implement `index.html`** — inline CSS/JS, `fetch` the files, `buildGraph`, render SVG, interactions. Serve it with the repo's convention (document `python3 -m http.server` from `content/`-reachable root, OR copy files in — mirror how asset-storybook is served).
- [ ] **Step 5: Verify** — smoke test PASS; open the page in a browser, confirm the graph renders, a node click shows fields, the prereq-chain highlight works (screenshot).
- [ ] **Step 6: Commit** — `feat(tools): interactive story-explorer graph`.

**Quality gate:** implement → smoke test + browser eyeball (screenshot, zero console errors) → adversarial review (does `graph.mjs` match the gate's edge semantics so the picture can't lie? any node kind unrendered?) → refactor → re-verify.

---

### Task 7: Authoring guide + seed multi-arc epic

**Files:**
- Create: `content/story/README.md`
- Populate: `content/story/{characters,arcs,quests,events,dialogue}.json` with a small but complete worked epic (2 arcs, ~4 quests, ~3 characters, ~2 events, ~2 dialogues) exercising EVERY kind + edge, all bound to the existing regions/factions/mobs.
- Create: `scripts/tests/story-seed.test.mjs`

**Interfaces:** consumes the whole gate. The seed epic is the end-to-end proof + the template an agent copies.

- [ ] **Step 1: Write the failing test** — `story-seed.test.mjs`: `node scripts/check_content.mjs --require-complete` on the real tree → exit 0 (the seed epic is fully coherent); `node scripts/gen_story_graph.mjs --check` → exit 0.
- [ ] **Step 2: Run it, verify it fails** (seed not authored yet → orphans/incompleteness).
- [ ] **Step 3: Author the seed epic** — anchor to real ids: quests give `MOB_KILLED` objectives on real `mob:*`, givers are real characters, factions are the existing 5, regions the existing 3. Build a valid prereq chain across 2 arcs.
- [ ] **Step 4: Write the authoring guide** — `README.md`: the 7 kinds + field tables, the id/edge conventions, the coherence rules, the `check_content.mjs` + `gen_story_graph.mjs` + `story-explorer` commands, and the **agent loop** (research → write files → gate self-review → static graph → adversarial review → ship).
- [ ] **Step 5: Verify** — seed test PASS; regenerate the graph; open the explorer on the seed (screenshot). Full sweep: `check_content.mjs`, `--require-complete`, `gen_story_graph.mjs --check`, all `node --test scripts/tests/`, story-explorer smoke — all green.
- [ ] **Step 6: Commit** — `feat(content): seed multi-arc epic + story authoring guide`.

**Quality gate (definition-of-done sweep):** implement → full sweep (all gates + all fixtures + both visualizers, paste evidence) → adversarial review of the whole feature diff (does the seed exercise every kind + edge? is the guide accurate to the shipped gate? any coherence rule the seed violates?) → refactor → re-verify.

---

## Self-Review

- **Spec coverage:** §1 connection model → Tasks 1–2 (id-space, kind-prefixes, union loader, resolve). §2 data model (7 kinds) → Task 1 schemas. §3 coherence gate → Tasks 2–4. §4 visualizers → Tasks 5 (static) + 6 (interactive). §5 agent loop → Task 7 guide. §6 layout/migration → Task 1. §7 testing → fixtures in every task. §8 non-goals → honored (no runtime). §9 phases → Tasks 1–7. No gaps.
- **Placeholders:** none — schema field contracts, edge rules, and the DAG algorithm are all specified; representative code shown for each novel step (repetitive schema/fixture bodies are precisely specified by field, following the existing `map`/`character` schema idiom the implementer reads first).
- **Type/name consistency:** `loadStory()` (Task 1) → `scripts/lib/story.mjs` (Task 5 extraction, gate re-imports); `resolveStoryRefs`/`checkStoryCoherence`/`assertQuestPrereqDag` names consistent across tasks and their fixtures; `buildGraph()` shared by explorer page + smoke test (Task 6).

## Notes for execution

- **Where to build:** capture as a ps-release-workflow idea → refine → **claim an F-NNN worktree** (off main) and implement there; this plan currently lives on release/1.4. Do NOT edit the main checkout (guard-blocked).
- **Shared-file coordination:** Tasks 1–5 all edit `scripts/check_content.mjs` — implement them in order on one branch; if another lane touches that file, rebase on the integrated release first (as F-009/F-010 did).
- **I-019 dependency:** the `mob:*` WARN→FAIL upgrade is out of scope here; when I-019 lands, flip those two WARNs to FAILs.
