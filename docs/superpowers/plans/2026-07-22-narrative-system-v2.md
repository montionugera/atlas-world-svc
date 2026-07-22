# Narrative System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the F-012 story content model with `act-*` and `lore-*` kinds, a single `unlockedBy` unlock mechanism (replacing `quest.prereq`), and minimal character fates — with the gate, both visualizers, and the seed migrated in lockstep.

**Architecture:** Everything stays in the content/tooling layer (no server code). The shared loader (`scripts/lib/story.mjs`) grows two kinds; the gate (`scripts/check_content.mjs`) grows the new edge resolutions + act ordering + generalized unlock-DAG; the two visualizers mirror the same edge set (parity guarded by the explorer smoke test). Spec: `docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md`.

**Tech Stack:** Plain ESM Node scripts (ajv draft-07, `node:test`), zero-dep browser explorer, deterministic Mermaid.

## Global Constraints

- **Simplicity is first-class; immersion rides on top** (spec §, user-set). Smallest schema surface; no machinery beyond what this plan specifies.
- **WARN/FAIL discipline:** dangling refs, cycles, act-order violations, fate inconsistencies = FAIL (exit 1); thread-size, orphans, coverage = WARN (exit 0). `--require-complete` escalation set is unchanged (orphan character/faction + unreachable quest only).
- **The 3 edge-list mirrors move together in the same task** whenever an edge kind changes: gate `resolveStoryRefs`/`buildReverseRefIndex`, generator `collectEdges`, explorer `EDGE_SPECS`. The explorer smoke test must assert parity for every new edge.
- **New edge set added by this plan (exact):** `arc.actId → act` · `lore.anchor → any kind` · `character.diedAt → event` · `{quest,event,dialogue}.unlockedBy[] → quest|event|act`. **Removed:** `quest.prereq`.
- `unlockedBy` semantics: id prefix IS the meaning (`quest-*` completed / `event-*` fired / `act-*` reached); flat array = AND only. Schema pattern: `^(quest|event|act)-[a-z0-9]+(-[a-z0-9]+)*$`, `minItems: 1`, field optional.
- **Multiple arcs may share an act** (parallel storylines). The old duplicate-`arc.act` FAIL is deliberately removed; act uniqueness/contiguity now lives on `act.order`.
- Plain ESM only; scripts never import TypeScript. `node --test tests/*.test.mjs` glob always (bare dir fails on Node 26). Run script tests from `scripts/`, explorer tests from repo root.
- Work in the claimed feature worktree only (main checkout blocks edits). Never `git commit --amend`. Conventional commit subjects.
- After every task: `node scripts/check_content.mjs` → 0 failures (3 pre-existing `mobType` WARNs + any WARNs this plan expects), and full `cd scripts && node --test tests/*.test.mjs` green.
- Test fixture pattern to copy: `fixture()`/`runGate()` in `scripts/tests/story-refs.test.mjs` (synthetic content root in tmpdir, real schemas copied in, real gate binary run via `execFileSync`).

---

### Task 1: `act-*` kind + `arc.actId`

**Files:**
- Create: `content/schemas/act.schema.json`, `content/story/acts.json`
- Modify: `content/schemas/arc.schema.json`, `scripts/lib/story.mjs`, `scripts/check_content.mjs`, `content/story/arcs.json`
- Modify (fixtures): `scripts/tests/story-refs.test.mjs`, `scripts/tests/story-coherence.test.mjs`, `scripts/tests/story-prereq-dag.test.mjs`, `scripts/tests/story-seed.test.mjs`, `scripts/tests/story-migration.test.mjs`, `scripts/tests/story-graph-drift.test.mjs`, `tools/story-explorer/tests/smoke.test.mjs` (whatever uses `act:` int fixtures / copies schema lists)
- Test: `scripts/tests/story-acts.test.mjs` (new)

**Interfaces:**
- Consumes: `loadStory` contract from `scripts/lib/story.mjs` (unchanged shape).
- Produces: `STORY_KINDS` now `["act","region","faction","character","arc","quest","event","dialogue"]` (act first); `STORY_FILES.act = "acts.json"`; `STORY_SCHEMAS.act = "act.schema.json"`; arc field `actId` (string ref, required) replacing `act` (integer); gate function `checkActOrdering(story, fail)` called from `checkStory`. Later tasks rely on these exact names.

- [ ] **Step 1: Write failing tests** — `scripts/tests/story-acts.test.mjs`:

```js
// Narrative System v2 Task 1: act-* kind + arc.actId. Same synthetic-root
// pattern as story-refs.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
// ... copy the imports, STORY_SCHEMAS list (ADD "act.schema.json"), KEYS,
// MANIFEST, fixture(), runGate(), clone() helpers from story-refs.test.mjs,
// extending fixture() with an `acts = []` file entry written to
// content/story/acts.json.

const ACT1 = { id: "act-1", kind: "act", title: "Act One", summary: "s", links: [], order: 1, theme: "foothold" };
const ACT2 = { id: "act-2", kind: "act", title: "Act Two", summary: "s", links: [], order: 2, theme: "silence" };
const REGION = { id: "region-town", kind: "region", title: "T", summary: "s", links: [], dangerTier: "safe" };
const FACTION = { id: "faction-a", kind: "faction", title: "A", summary: "s", links: [], disposition: "friendly", mobFamily: [], relationships: [] };
const CHARACTER = { id: "char-npc", kind: "character", title: "N", summary: "s", links: [], role: "npc", faction: "faction-a", region: "region-town" };
const QUEST = { id: "quest-x", kind: "quest", title: "X", summary: "s", links: [], narrative: { description: "d", offerText: "o", completeText: "c" }, giver: "char-npc", arcId: "arc-a", objectives: [{ type: "MOB_KILLED", targetId: "mob:aggressive", count: 1 }] };
const ARC = { id: "arc-a", kind: "arc", title: "A", summary: "s", links: [], actId: "act-1", questIds: ["quest-x"] };
const BASE = { acts: [ACT1], regions: [REGION], factions: [FACTION], characters: [CHARACTER], arcs: [ARC], quests: [QUEST] };

test("green: arc.actId resolving to an act node passes", () => {
  const { code, out } = runGate(fixture(clone(BASE)));
  assert.equal(code, 0, out);
});

test("red: dangling arc.actId FAILs", () => {
  const files = clone(BASE);
  files.arcs[0].actId = "act-missing";
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /actId "act-missing" does not resolve/);
});

test("red: non-contiguous act orders FAIL", () => {
  const files = clone(BASE);
  files.acts = [ACT1, { ...clone(ACT2), order: 3 }];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /act orders .* not contiguous/);
});

test("red: duplicate act order FAILs", () => {
  const files = clone(BASE);
  files.acts = [ACT1, { ...clone(ACT2), order: 1 }];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /duplicate order 1/);
});

test("green: two arcs sharing one act is allowed (parallel storylines)", () => {
  const files = clone(BASE);
  files.quests.push({ ...clone(QUEST), id: "quest-y", arcId: "arc-b" });
  files.arcs.push({ ...clone(ARC), id: "arc-b", questIds: ["quest-y"] });
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
});

test("red: old integer arc.act field is schema-rejected", () => {
  const files = clone(BASE);
  delete files.arcs[0].actId;
  files.arcs[0].act = 1;
  const { code } = runGate(fixture(files));
  assert.equal(code, 1);
});
```

- [ ] **Step 2: Run** `cd scripts && node --test tests/story-acts.test.mjs` — expect FAIL (act.schema.json missing → schema copy throws / actId unknown).

- [ ] **Step 3: Implement.**

`content/schemas/act.schema.json` (new):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas story node: act",
  "description": "One entry of content/story/acts.json. Narrative System v2 story spine (see docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md).",
  "type": "object",
  "required": ["id", "title", "kind", "summary", "links", "order", "theme"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^act-[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "kind": { "const": "act" },
    "summary": { "type": "string", "minLength": 1 },
    "links": { "type": "array", "items": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" } },
    "order": { "type": "integer", "minimum": 1 },
    "theme": { "type": "string", "minLength": 1 }
  }
}
```

`content/schemas/arc.schema.json`: in `required`, replace `"act"` with `"actId"`; replace the `"act"` property with `"actId": { "type": "string", "pattern": "^act-[a-z0-9]+(-[a-z0-9]+)*$" }`.

`scripts/lib/story.mjs`:

```js
export const STORY_KINDS = ["act", "region", "faction", "character", "arc", "quest", "event", "dialogue"];
export const STORY_FILES = {
  act: "acts.json",
  region: "regions.json",
  // ...existing entries unchanged...
};
export const STORY_SCHEMAS = {
  act: "act.schema.json",
  region: "region.schema.json",
  // ...existing entries unchanged...
};
```

`scripts/check_content.mjs`:

1. In `resolveStoryRefs`, in the arc loop, add: `resolve(label, "actId", a.actId, ["act"]);`
2. **Delete** the duplicate-`arc.act` FAIL in `checkStoryCoherence` (the `findDuplicateGroups(byKind.get("arc"), (a) => a.act)` block) — multiple arcs per act are now legal.
3. Add and call from `checkStory` (after `resolveStoryRefs`):

```js
// Narrative System v2: acts are the story spine — orders must be unique and
// contiguous 1..N so "act reached" (unlockedBy act-*) is well-defined.
function checkActOrdering(story, fail) {
  const acts = story.byKind.get("act");
  for (const [order, group] of findDuplicateGroups(acts, (a) => a.order))
    fail(`story/${STORY_FILES.act}: duplicate order ${order} used by acts ${group.map((a) => `"${a.id}"`).join(", ")}`);
  const sorted = [...new Set(acts.map((a) => a.order))].sort((x, y) => x - y);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      fail(`story/${STORY_FILES.act}: act orders [${acts.map((a) => a.order).join(", ")}] are not contiguous 1..${acts.length}`);
      break;
    }
  }
}
```

4. Rewire the `triggeredBy` act-order WARN in `checkStoryCoherence` (arc no longer has `.act`):

```js
  for (const e of byKind.get("event")) {
    if (e.triggeredBy === undefined) continue;
    const quest = nodes.get(e.triggeredBy);
    if (!quest || quest.kind !== "quest") continue;
    const arc = nodes.get(quest.arcId);
    if (!arc || arc.kind !== "arc") continue;
    const act = nodes.get(arc.actId);
    if (!act || act.kind !== "act") continue; // dangling actId already FAILed by resolveStoryRefs
    if (act.order > e.timelineOrder)
      warn(`story/${STORY_FILES.event}#${e.id}: triggeredBy quest "${quest.id}"'s act "${act.id}" order ${act.order} is later than event timelineOrder ${e.timelineOrder}`);
  }
```

Seed migration — `content/story/acts.json` (new):

```json
[
  {
    "id": "act-1",
    "kind": "act",
    "title": "Meadow Awakening",
    "summary": "The expedition finds its footing at the frontier's edge.",
    "order": 1,
    "theme": "foothold",
    "links": []
  },
  {
    "id": "act-2",
    "kind": "act",
    "title": "Icefield Reckoning",
    "summary": "The push north onto the Stoneguard's shelf, and the first hint of what they guarded.",
    "order": 2,
    "theme": "the-silence",
    "links": []
  }
]
```

`content/story/arcs.json`: in `arc-meadow-awakening` replace `"act": 1` with `"actId": "act-1"`; in `arc-icefield-reckoning` replace `"act": 2` with `"actId": "act-2"`.

Fixture sweep: in every listed test file, (a) add `"act.schema.json"` to any `STORY_SCHEMAS` copy-list, (b) extend `fixture()` with `acts = []` writing `content/story/acts.json`, (c) replace every arc fixture's `act: <n>` with `actId: "act-<n>"` and add the matching `ACT` node(s) to the fixture's files, (d) update any assertion that matched the removed duplicate-act FAIL message or the old `act \d` WARN text. `story-seed.test.mjs`/`story-migration.test.mjs`: update seed expectations (acts.json exists, arcs carry actId). NOTE: `docs/story/story-graph.md` will be regenerated in Task 4; if `story-graph-drift.test.mjs` runs `--check` against real content, regenerate the artifact now (`node scripts/gen_story_graph.mjs --write`) so the suite stays green — act nodes appear as plain nodes until Task 4 adds subgraphs; `gen_story_graph.mjs` needs no code change for that (it iterates `STORY_KINDS`) except `CLASS_STYLES.act`, which Task 4 owns — add a placeholder entry now if rendering throws `undefined` into classDef: `act: "fill:#343A40,color:#fff,stroke:#212529,stroke-width:1px"`.

- [ ] **Step 4: Run** `cd scripts && node --test tests/story-acts.test.mjs` → PASS; then full `node --test tests/*.test.mjs` → all green; then from repo root `node scripts/check_content.mjs` → 0 failures.

- [ ] **Step 5: Commit** — `git add content/schemas/act.schema.json content/schemas/arc.schema.json content/story/acts.json content/story/arcs.json scripts/ docs/story/story-graph.md tools/story-explorer/tests/` (only what changed) · `git commit -m "feat: act-* story kind + arc.actId (narrative v2 T1)"`

---

### Task 2: `unlockedBy` replaces `quest.prereq`

**Files:**
- Modify: `content/schemas/quest.schema.json`, `content/schemas/event.schema.json`, `content/schemas/dialogue.schema.json`, `scripts/check_content.mjs`, `content/story/quests.json`
- Modify (fixtures): `scripts/tests/story-refs.test.mjs`, `scripts/tests/story-coherence.test.mjs`, `scripts/tests/story-seed.test.mjs`, `scripts/tests/story-migration.test.mjs`
- Rewrite: `scripts/tests/story-prereq-dag.test.mjs` → `scripts/tests/story-unlock-dag.test.mjs`
- Test: `scripts/tests/story-unlocks.test.mjs` (new)

**Interfaces:**
- Consumes: Task 1's `ACT`/`actId` fixture shapes.
- Produces: optional `unlockedBy` (array, `minItems:1`, pattern `^(quest|event|act)-[a-z0-9]+(-[a-z0-9]+)*$`) on quest/event/dialogue schemas; `quest.prereq` **gone** from schema and gate; gate functions `assertUnlockDag(story, fail)` (replaces `assertQuestPrereqDag`) and `buildQuestReachability(quests)` (replaces `isQuestReachable`). Tasks 4–5 mirror the `unlockedBy` edge.

- [ ] **Step 1: Write failing tests** — `scripts/tests/story-unlocks.test.mjs` (same fixture pattern; BASE from Task 1's constants plus an `EVENT = { id: "event-e", kind: "event", title: "E", summary: "s", links: [], timelineOrder: 1, involves: ["char-npc"] }` and `DIALOGUE = { id: "dlg-d", kind: "dialogue", title: "D", summary: "s", links: [], speaker: "char-npc", lines: ["hi"] }`):

```js
test("green: quest unlockedBy [quest, event, act] all resolving passes", () => {
  const files = clone(BASE);
  files.quests.push({ ...clone(QUEST), id: "quest-y", arcId: "arc-a", unlockedBy: ["quest-x", "event-e", "act-1"] });
  files.arcs[0].questIds.push("quest-y");
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
});

test("red: dangling unlockedBy id FAILs", () => {
  const files = clone(BASE);
  files.quests[0].unlockedBy = ["quest-ghost"];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /unlockedBy "quest-ghost" does not resolve/);
});

test("red: quest.prereq is schema-rejected (removed field)", () => {
  const files = clone(BASE);
  files.quests[0].prereq = "quest-x";
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /additional/i); // additionalProperties: false
});

test("red: dialogue unlockedBy dangling event FAILs", () => {
  const files = clone(BASE);
  files.dialogue = [{ ...clone(DIALOGUE), unlockedBy: ["event-ghost"] }];
  const { code } = runGate(fixture(files));
  assert.equal(code, 1);
});

test("green: unlockable-but-event-gated quest is NOT flagged unreachable", () => {
  const files = clone(BASE);
  files.events = [clone(EVENT)];
  files.quests.push({ ...clone(QUEST), id: "quest-y", arcId: "arc-a", unlockedBy: ["event-e"] });
  files.arcs[0].questIds.push("quest-y");
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /quest-y.*unreachable/);
});

test("warn: quest whose quest-dep chain is dangling is unreachable", () => {
  const files = clone(BASE);
  files.quests.push({ ...clone(QUEST), id: "quest-y", arcId: "arc-a", unlockedBy: ["quest-ghost"] });
  files.arcs[0].questIds.push("quest-y");
  const { out } = runGate(fixture(files));
  assert.match(out, /quest "quest-y" is unreachable/);
});
```

`scripts/tests/story-unlock-dag.test.mjs` (replaces story-prereq-dag.test.mjs; port its 7 cases to `unlockedBy` semantics — the two below are the shape, keep the ported chain-into-cycle case that asserts only the cycle members are named):

```js
test("red: unlockedBy cycle FAILs naming the cycle", () => {
  const files = clone(BASE);
  files.quests = [
    { ...clone(QUEST), id: "quest-a", unlockedBy: ["quest-b"] },
    { ...clone(QUEST), id: "quest-b", unlockedBy: ["quest-a"] },
  ];
  files.arcs[0].questIds = ["quest-a", "quest-b"];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /unlockedBy cycle: quest-[ab] -> quest-[ba] -> quest-[ab]/);
});

test("red: cross-kind cycle quest->event->quest FAILs", () => {
  const files = clone(BASE);
  files.events = [{ ...clone(EVENT), unlockedBy: ["quest-x"] }];
  files.quests[0].unlockedBy = ["event-e"];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /unlockedBy cycle/);
});
```

- [ ] **Step 2: Run** `cd scripts && node --test tests/story-unlocks.test.mjs tests/story-unlock-dag.test.mjs` — expect FAIL (unlockedBy schema-rejected today).

- [ ] **Step 3: Implement.**

Schemas — in `quest.schema.json` **delete** the `"prereq"` property; in all three of `quest/event/dialogue.schema.json` add:

```json
    "unlockedBy": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string", "pattern": "^(quest|event|act)-[a-z0-9]+(-[a-z0-9]+)*$" }
    }
```

`scripts/check_content.mjs`:

1. `resolveStoryRefs`: remove `resolve(label, "prereq", q.prereq, ["quest"]);`. Add a helper inside the function and call it in the quest, event, and dialogue loops:

```js
  // Narrative System v2: unlockedBy — id prefix IS the semantics (quest-* =
  // completed, event-* = fired, act-* = reached). Schema already prefix-locks
  // the pattern; resolution + kind check here is defense in depth.
  const UNLOCK_KINDS = { quest: ["quest"], event: ["event"], act: ["act"] };
  const resolveUnlocks = (label, node) => {
    for (const uid of node.unlockedBy ?? [])
      resolve(label, "unlockedBy", uid, UNLOCK_KINDS[uid.split("-")[0]] ?? ["quest", "event", "act"]);
  };
```

(quest loop: `resolveUnlocks(label, q);` · event loop: `resolveUnlocks(label, e);` · dialogue loop: `resolveUnlocks(label, d);`)

2. `buildReverseRefIndex`: remove `addRef(q.prereq, "quest")`; add in the quest loop `for (const uid of q.unlockedBy ?? []) addRef(uid, "quest");`, in the event loop `for (const uid of e.unlockedBy ?? []) addRef(uid, "event");`, in the dialogue loop `for (const uid of d.unlockedBy ?? []) addRef(uid, "dialogue");`.

3. Replace `assertQuestPrereqDag` with (and update the `checkStory` call site):

```js
// Narrative System v2: hard FAIL on any cycle in the unlockedBy graph.
// Graph nodes are quests/events/dialogue; edges are unlockedBy entries that
// resolve to a quest or event (act-* refs are sinks — acts have no
// unlockedBy — and dialogue ids can never appear in unlockedBy, so dialogue
// nodes have out-edges only). Out-degree is now unbounded (array), so DFS
// walks every successor. Dangling refs (already FAILed by resolveStoryRefs)
// are skipped, never crashed on or misreported as cycles.
function assertUnlockDag(story, fail) {
  const { nodes, byKind } = story;
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map();

  const visit = (node, stack) => {
    color.set(node.id, GREY);
    stack.push(node.id);
    for (const uid of node.unlockedBy ?? []) {
      const target = nodes.get(uid);
      if (!target || !["quest", "event"].includes(target.kind)) continue;
      const targetColor = color.get(target.id) ?? WHITE;
      if (targetColor === GREY) {
        const cycleStart = stack.indexOf(target.id);
        fail(`story: unlockedBy cycle: ${[...stack.slice(cycleStart), target.id].join(" -> ")}`);
      } else if (targetColor === WHITE) visit(target, stack);
    }
    stack.pop();
    color.set(node.id, BLACK);
  };

  for (const kind of ["quest", "event", "dialogue"])
    for (const n of byKind.get(kind))
      if ((color.get(n.id) ?? WHITE) === WHITE) visit(n, []);
}
```

4. Replace `isQuestReachable` with a memoized builder (and its use in `checkStoryCoherence`):

```js
// A quest is statically reachable when every quest-* id it is unlocked by
// resolves and is itself reachable. event-*/act-* unlocks are runtime
// conditions, not statically walkable — ignored here (assertUnlockDag still
// covers cycles through events). A cycle or dangling quest dep => unreachable.
function buildQuestReachability(quests) {
  const questById = new Map(quests.map((q) => [q.id, q]));
  const memo = new Map();
  const visiting = new Set();
  const reachable = (q) => {
    if (memo.has(q.id)) return memo.get(q.id);
    if (visiting.has(q.id)) return false;
    visiting.add(q.id);
    const ok = (q.unlockedBy ?? [])
      .filter((id) => id.startsWith("quest-"))
      .every((id) => questById.get(id) !== undefined && reachable(questById.get(id)));
    visiting.delete(q.id);
    memo.set(q.id, ok);
    return ok;
  };
  return reachable;
}
```

In `checkStoryCoherence`, the reachability block becomes:

```js
  const reachable = buildQuestReachability(byKind.get("quest"));
  for (const q of byKind.get("quest")) {
    if (!reachable(q))
      escalate(`story/${STORY_FILES.quest}#${q.id}: quest "${q.id}" is unreachable from any no-prereq start quest`);
  }
```

Seed migration — `content/story/quests.json`: replace each `"prereq": "X"` line with `"unlockedBy": ["X"]` (3 quests: cull-the-packs ← first-steps, the-twin-strike ← cull-the-packs, icefield-reckoning ← the-twin-strike).

Fixture sweep: update `story-refs.test.mjs` / `story-coherence.test.mjs` / seed & migration tests — every `prereq: "quest-…"` fixture becomes `unlockedBy: ["quest-…"]`; assertions on prereq-cycle/unreachable messages updated to the new texts. Delete `scripts/tests/story-prereq-dag.test.mjs` (superseded by story-unlock-dag.test.mjs). Explorer smoke + graph.mjs still reference `prereq` — they keep passing this task because seed quests no longer carry `prereq` (the EDGE_SPECS entry just yields no edges); the mirror moves in Tasks 4–5. Regenerate `docs/story/story-graph.md` (`node scripts/gen_story_graph.mjs --write`) since prereq edges vanish from the artifact.

- [ ] **Step 4: Run** new tests → PASS; full `cd scripts && node --test tests/*.test.mjs` green; root `node scripts/check_content.mjs` → 0 failures; `node scripts/gen_story_graph.mjs --check` → in sync; `node --test tools/story-explorer/tests/*.test.mjs` → green.

- [ ] **Step 5: Commit** — `git commit -m "feat: unlockedBy unlock graph replaces quest.prereq (narrative v2 T2)"`

---

### Task 3: character fates + `lore-*` kind

**Files:**
- Create: `content/schemas/lore.schema.json`, `content/story/lore.json`
- Modify: `content/schemas/story-character.schema.json`, `scripts/lib/story.mjs`, `scripts/check_content.mjs`, `content/story/characters.json`
- Modify (fixtures): schema copy-lists + `fixture()` in the story test files (add lore), `story-seed.test.mjs`
- Test: `scripts/tests/story-fates-lore.test.mjs` (new)

**Interfaces:**
- Consumes: Tasks 1–2 shapes.
- Produces: `STORY_KINDS` final order `["act","region","faction","character","arc","quest","event","dialogue","lore"]`; `STORY_FILES.lore = "lore.json"`; `STORY_SCHEMAS.lore = "lore.schema.json"`; character fields `status` (enum, optional, default alive) + `diedAt` (event ref, optional); lore fields `body`/`anchor`/`thread`. Tasks 4–5 mirror `character.diedAt` and `lore.anchor`.

- [ ] **Step 1: Write failing tests** — `scripts/tests/story-fates-lore.test.mjs`:

```js
const LORE_A = { id: "lore-oath", kind: "lore", title: "Oath", summary: "s", links: [], body: "Hold, though the hall is empty.", anchor: "faction-a", thread: "the-first-claim" };
const LORE_B = { id: "lore-stone", kind: "lore", title: "Stone", summary: "s", links: [], body: "CLAIMED.", anchor: "region-town", thread: "the-first-claim" };

test("green: dead character with diedAt -> real event passes", () => {
  const files = clone(BASE);
  files.events = [clone(EVENT)];
  files.characters[0] = { ...clone(CHARACTER), status: "dead", diedAt: "event-e" };
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
});

test("red: diedAt with status alive FAILs", () => {
  const files = clone(BASE);
  files.events = [clone(EVENT)];
  files.characters[0] = { ...clone(CHARACTER), diedAt: "event-e" }; // status defaults alive
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /diedAt "event-e" set but status is "alive"/);
});

test("red: dangling diedAt FAILs", () => {
  const files = clone(BASE);
  files.characters[0] = { ...clone(CHARACTER), status: "dead", diedAt: "event-ghost" };
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /diedAt "event-ghost" does not resolve/);
});

test("green: two lore fragments on one thread pass with no thread WARN", () => {
  const files = clone(BASE);
  files.lore = [LORE_A, LORE_B];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /thread/);
});

test("red: dangling lore.anchor FAILs", () => {
  const files = clone(BASE);
  files.lore = [{ ...clone(LORE_A), anchor: "region-ghost" }, clone(LORE_B)];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 1);
  assert.match(out, /anchor "region-ghost" does not resolve/);
});

test("warn: singleton thread WARNs but exits 0", () => {
  const files = clone(BASE);
  files.lore = [clone(LORE_A)];
  const { code, out } = runGate(fixture(files));
  assert.equal(code, 0, out);
  assert.match(out, /WARN .*thread "the-first-claim" has only 1 fragment/);
});
```

- [ ] **Step 2: Run** — expect FAIL (lore schema missing, character fields rejected).

- [ ] **Step 3: Implement.**

`content/schemas/lore.schema.json` (new):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas story node: lore",
  "description": "One entry of content/story/lore.json — a discoverable fragment (Hollow-Knight-style environmental storytelling). anchor = the node it is attached to; thread = the mystery it feeds. See docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md.",
  "type": "object",
  "required": ["id", "title", "kind", "summary", "links", "body", "anchor", "thread"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^lore-[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "kind": { "const": "lore" },
    "summary": { "type": "string", "minLength": 1 },
    "links": { "type": "array", "items": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" } },
    "body": { "type": "string", "minLength": 1 },
    "anchor": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "thread": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" }
  }
}
```

`content/schemas/story-character.schema.json` — add two properties (NOT to `required`):

```json
    "status": { "enum": ["alive", "dead", "missing"] },
    "diedAt": { "type": "string", "pattern": "^event-[a-z0-9]+(-[a-z0-9]+)*$" }
```

`scripts/lib/story.mjs`: append `"lore"` to `STORY_KINDS`; add `lore: "lore.json"` / `lore: "lore.schema.json"`.

`scripts/check_content.mjs` — in `resolveStoryRefs`:

```js
  // character loop additions:
    resolve(label, "diedAt", c.diedAt, ["event"]);
    if (c.diedAt !== undefined && (c.status ?? "alive") === "alive")
      fail(`${label}: diedAt "${c.diedAt}" set but status is "alive"`);

  // new loop:
  for (const l of byKind.get("lore")) {
    const label = `story/${STORY_FILES.lore}#${l.id}`;
    if (!nodes.has(l.anchor))
      fail(`${label}: anchor "${l.anchor}" does not resolve to any story node`);
  }
```

`buildReverseRefIndex`: character loop adds `addRef(c.diedAt, "character");`; new lore loop `for (const l of byKind.get("lore")) addRef(l.anchor, "lore");` (orphan rescue-kind lists stay UNCHANGED — a lore-only reference does not rescue an orphan; the spec keeps orphan semantics as-is).

`checkStoryCoherence` — thread-size WARN (plain `warn`, never escalated — it's coverage-of-a-mystery, deliberately outside `--require-complete`, matching the triggeredBy WARN's reasoning):

```js
  for (const [thread, frags] of findDuplicateGroups(byKind.get("lore"), (l) => l.thread))
    void thread; // duplicates are FINE — we want the inverse:
  {
    const byThread = new Map();
    for (const l of byKind.get("lore")) {
      if (!byThread.has(l.thread)) byThread.set(l.thread, []);
      byThread.get(l.thread).push(l);
    }
    for (const [thread, frags] of byThread)
      if (frags.length < 2)
        warn(`story/${STORY_FILES.lore}#${frags[0].id}: thread "${thread}" has only 1 fragment — a thread of one isn't a mystery`);
  }
```

(Implementer note: drop the vestigial `findDuplicateGroups` loop above — build `byThread` directly; shown here only to make the inversion explicit.)

Seed — `content/story/lore.json` (new; opens the buried-mystery thread per the spec's Antagonist Doctrine):

```json
[
  {
    "id": "lore-guarded-nothing",
    "kind": "lore",
    "title": "Guarded Nothing",
    "summary": "A Stoneguard oath-tablet, half-buried in the shelf ice.",
    "body": "The oath does not name what is kept. It names only the keeping: 'Hold, though the hall is empty. Hold, though the name is lost.'",
    "anchor": "faction-stoneguard",
    "thread": "the-first-claim",
    "links": []
  },
  {
    "id": "lore-first-claim-stone",
    "kind": "lore",
    "title": "The First Claim",
    "summary": "A boundary stone older than any camp, its carving worn to a single line.",
    "body": "Beneath the frost line the stone still reads: 'CLAIMED'. Nothing else survived the years — not the claimant, not the claim.",
    "anchor": "region-icefield",
    "thread": "the-first-claim",
    "links": []
  }
]
```

`content/story/characters.json`: on `char-ashfang-alpha` (the Twin-Strike — it dies in `event-twin-strike-falls`) add `"status": "dead", "diedAt": "event-twin-strike-falls"`.

Fixture sweep: add `"lore.schema.json"` to schema copy-lists, `lore = []` to `fixture()` writers, seed-test expectations (lore.json exists, alpha is dead). Regenerate `docs/story/story-graph.md` (new nodes appear; `CLASS_STYLES.lore` needed — add `lore: "fill:#66D9E8,color:#000,stroke:#0B7285,stroke-width:1px"` now; full generator work stays Task 4).

- [ ] **Step 4: Run** new tests → PASS; full scripts suite green; gate 0 failures; drift `--check` in sync; explorer smoke green (graph.mjs tolerates unknown kinds by ignoring them — verify, and if the smoke test's dangling-edge proxy trips on lore.anchor, that mirror lands in Task 5; keep this task's artifact green by not asserting lore in smoke yet).

- [ ] **Step 5: Commit** — `git commit -m "feat: lore-* fragments + character fates (narrative v2 T3)"`

---

### Task 4: Mermaid generator v2 (act subgraphs + new edges)

**Files:**
- Modify: `scripts/gen_story_graph.mjs`, `docs/story/story-graph.md` (regenerated), `scripts/tests/story-graph-drift.test.mjs` (extend)

**Interfaces:**
- Consumes: `STORY_KINDS` (9 kinds), story shapes from Tasks 1–3.
- Produces: committed `docs/story/story-graph.md` with `subgraph` per act; `collectEdges` emitting exactly the Global-Constraints edge set. Task 5's smoke test asserts explorer parity against this same edge set.

- [ ] **Step 1: Write failing test** — extend `story-graph-drift.test.mjs`:

```js
test("generated graph groups arcs and quests into act subgraphs and carries v2 edges", () => {
  // run gen_story_graph.mjs with CONTENT_ROOT pointing at the real content/
  // (or default), capture the markdown string (regenerate to a tmp OUT via
  // --write after copying, or read docs/story/story-graph.md after --write)
  const md = readFileSync(join(ROOT, "docs/story/story-graph.md"), "utf8");
  assert.match(md, /subgraph sg_n_act_1\["Act 1 — Meadow Awakening"\]/);
  assert.match(md, /subgraph sg_n_act_2\["Act 2 — Icefield Reckoning"\]/);
  assert.match(md, /-->\|unlockedBy\|/);
  assert.match(md, /-->\|actId\|/);
  assert.match(md, /-->\|anchor\|/);
  assert.match(md, /-->\|diedAt\|/);
  assert.doesNotMatch(md, /-->\|prereq\|/);
});
```

- [ ] **Step 2: Run** — expect FAIL (no subgraphs, no new edge labels yet).

- [ ] **Step 3: Implement** in `scripts/gen_story_graph.mjs`:

`collectEdges` — remove the `prereq` push; add:

```js
  // quest loop:      for (const uid of q.unlockedBy ?? []) push(q.id, "unlockedBy", uid);
  // arc loop:        push(a.id, "actId", a.actId);
  // character loop:  push(c.id, "diedAt", c.diedAt);
  // event loop:      for (const uid of e.unlockedBy ?? []) push(e.id, "unlockedBy", uid);
  // dialogue loop:   for (const uid of d.unlockedBy ?? []) push(d.id, "unlockedBy", uid);
  // new lore loop:
  for (const l of byKind.get("lore") ?? []) push(l.id, "anchor", l.anchor);
```

`renderMermaid` — new signature `renderMermaid(nodes, edges, storyNodes)` (update the `main()` call to pass `story.nodes`):

```js
function renderMermaid(nodes, edges, storyNodes) {
  const lines = ["flowchart LR"];
  for (const kind of STORY_KINDS) lines.push(`  classDef ${kind} ${CLASS_STYLES[kind]}`);
  lines.push("");

  // Acts are rendered as Mermaid subgraphs: each act contains itself, its
  // arcs (arc.actId), and their quests (quest.arcId -> arc.actId). Every
  // other kind — and any arc/quest whose act chain doesn't resolve — renders
  // in the shared (act-less) lane. Deterministic: acts by order, members
  // keep collectNodes' id-sorted order.
  const actOf = (n) => {
    const node = storyNodes.get(n.id);
    if (node.kind === "act") return node.id;
    if (node.kind === "arc") return storyNodes.get(node.actId)?.kind === "act" ? node.actId : null;
    if (node.kind === "quest") {
      const arc = storyNodes.get(node.arcId);
      if (!arc || arc.kind !== "arc") return null;
      return storyNodes.get(arc.actId)?.kind === "act" ? arc.actId : null;
    }
    return null;
  };
  const acts = [...storyNodes.values()].filter((n) => n.kind === "act").sort((a, b) => a.order - b.order);
  const grouped = new Map(acts.map((a) => [a.id, []]));
  const shared = [];
  for (const n of nodes) {
    const actId = actOf(n);
    if (actId !== null && grouped.has(actId)) grouped.get(actId).push(n);
    else shared.push(n);
  }

  const nodeLine = (n) => `${sanitize(n.id)}["${escapeLabel(n.id)}"]:::${n.kind}`;
  for (const act of acts) {
    lines.push(`  subgraph sg_${sanitize(act.id)}["${escapeLabel(`Act ${act.order} — ${act.title}`)}"]`);
    for (const n of grouped.get(act.id)) lines.push(`    ${nodeLine(n)}`);
    lines.push("  end");
  }
  for (const n of shared) lines.push(`  ${nodeLine(n)}`);
  lines.push("");
  for (const e of edges) lines.push(`  ${sanitize(e.source)} -->|${e.field}| ${sanitize(e.target)}`);
  return `${lines.join("\n")}\n`;
}
```

`CLASS_STYLES`: ensure both v2 entries exist (Task 1/3 may have added them): `act: "fill:#343A40,color:#fff,stroke:#212529,stroke-width:1px"`, `lore: "fill:#66D9E8,color:#000,stroke:#0B7285,stroke-width:1px"`.

`renderMarkdown` prose: update the edge list sentence to name the v2 edge set (drop `prereq`, add `unlockedBy`, `actId`, `diedAt`, `anchor`; mention act subgraphs).

Then regenerate: `node scripts/gen_story_graph.mjs --write` and commit the artifact.

- [ ] **Step 4: Run** drift tests → PASS; `node scripts/gen_story_graph.mjs --check` → in sync; full scripts suite green.

- [ ] **Step 5: Commit** — `git commit -m "feat: mermaid act subgraphs + v2 edges (narrative v2 T4)"`

---

### Task 5: explorer v2 (mirror parity + act/lore UI)

**Files:**
- Modify: `tools/story-explorer/graph.mjs`, `tools/story-explorer/index.html`, `tools/story-explorer/tests/smoke.test.mjs`, `tools/story-explorer/README.md`

**Interfaces:**
- Consumes: the exact v2 edge set (Global Constraints).
- Produces: `KINDS = ['act','region','faction','character','arc','quest','event','dialogue','lore']`; `EDGE_SPECS` mirroring the gate edge-for-edge; smoke test asserting parity for all four new edge kinds.

- [ ] **Step 1: Write failing smoke tests** (extend `tests/smoke.test.mjs`, which loads the real `content/story/*.json` — remember the file map: `dialogue.json` and `lore.json` are singular):

```js
test("v2 edges present and prereq gone", () => {
  const g = buildGraph(files);
  const labels = new Set(g.edges.map((e) => e.label));
  for (const must of ["unlockedBy", "act", "diedAt", "anchor"]) assert.ok(labels.has(must), must);
  assert.ok(!labels.has("prereq"));
});

test("EDGE_SPECS parity: every gate edge kind is declared", () => {
  // parity proxy: seed exercises every edge kind; no dangling edges
  assert.deepEqual(danglingEdges(files), []);
  const g = buildGraph(files);
  assert.ok(g.nodes.some((n) => n.kind === "act"));
  assert.ok(g.nodes.some((n) => n.kind === "lore"));
});
```

- [ ] **Step 2: Run** `node --test tools/story-explorer/tests/*.test.mjs` — expect FAIL.

- [ ] **Step 3: Implement.**

`graph.mjs`:

```js
export const KINDS = ['act', 'region', 'faction', 'character', 'arc', 'quest', 'event', 'dialogue', 'lore']

const unlocks = (n) => (n.unlockedBy ?? []).map((u) => [u, 'unlockedBy'])
const EDGE_SPECS = {
  faction: (n) => (n.relationships ?? []).map((r) => [r.factionId, r.stance]),
  character: (n) => [
    [n.faction, 'of'],
    [n.region, 'in'],
    [n.diedAt, 'diedAt'],
  ],
  arc: (n) => [...(n.questIds ?? []).map((q) => [q, 'quest']), [n.actId, 'act']],
  quest: (n) => [
    [n.giver, 'giver'],
    [n.arcId, 'arc'],
    [n.faction, 'vs'],
    [n.region, 'at'],
    ...unlocks(n),
  ],
  event: (n) => [...(n.involves ?? []).map((i) => [i, 'involves']), [n.triggeredBy, 'triggeredBy'], ...unlocks(n)],
  dialogue: (n) => [[n.speaker, 'speaker'], [n.context, 'in'], ...unlocks(n)],
  lore: (n) => [[n.anchor, 'anchor']],
}
```

(Update the header comment: this table mirrors the gate's v2 edge set; keep the "single source of truth" note.)

`index.html` changes (exact):

1. CSS `:root` line 9: add `--act:#6c757d;--lore:#66d9e8;` and two chip rules after the dialogue one:
   `.chip[data-kind=act].on{border-color:var(--act);color:var(--act)}` / `.chip[data-kind=lore].on{border-color:var(--lore);color:var(--lore)}`
2. `COLORS` (line 53): add `act:'#6c757d'` and `lore:'#66d9e8'`.
3. `load()` filename map (line 63): `const filename = k === 'dialogue' ? 'dialogue.json' : k === 'lore' ? 'lore.json' : \`${k}s.json\``
4. `layout()` — after filling `byCol`, sort acts by story order: `byCol['act']?.sort((a,b)=>(a.data.order??0)-(b.data.order??0))`
5. Replace `prereqChain` with the unlock chain (both directions over `unlockedBy`):

```js
function unlockChain(id){ // node → full unlock ancestry + everything it (transitively) unlocks
  const hi=new Set(); const data=i=>G.byId.get(i)?.data
  const up=[id]; while(up.length){ const c=up.pop(); if(hi.has(c))continue; hi.add(c); for(const u of data(c)?.unlockedBy??[]) if(G.byId.has(u)) up.push(u) }
  const down=[id]
  while(down.length){ const c=down.pop(); for(const n of G.nodes){ if(hi.has(n.id))continue; if((n.data.unlockedBy??[]).includes(c)){ hi.add(n.id); down.push(n.id) } } }
  return hi
}
```

6. `select()` line 123: `const hi = (n.kind==='quest'||n.kind==='event'||n.kind==='dialogue') && (n.data.unlockedBy||…)` — simplest correct form: `const hi = ['quest','event','dialogue'].includes(n.kind) ? unlockChain(id) : new Set([...])` (keep the existing neighbor-set fallback expression for other kinds).
7. `select()` panel (line 129): after the summary `<p>`, insert lore rendering:
   `${n.kind==='lore'?`<p style="font-style:italic;border-left:3px solid var(--lore);padding-left:10px">${n.data.body}</p><div class="rel">thread: #${n.data.thread}</div>`:''}`
8. `filters()`: after the kind chips, append thread chips:

```js
  const threads=[...new Set(G.nodes.filter(n=>n.kind==='lore').map(n=>n.data.thread))].sort()
  threads.forEach(t=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=`#${t}`
    b.onclick=()=>{ const hi=new Set(); G.nodes.forEach(n=>{ if(n.kind==='lore'&&n.data.thread===t){ hi.add(n.id); if(G.byId.has(n.data.anchor)) hi.add(n.data.anchor) } }); render(hi) }
    f.appendChild(b)
  })
```

9. Aside hint (line 49): change "trace its prereq chain" → "trace its unlock chain".

`tools/story-explorer/README.md`: update kinds list, edge list, and the unlock-chain/thread-chip features (short — mirror the code).

- [ ] **Step 4: Run** `node --test tools/story-explorer/tests/*.test.mjs` → all green. Manual verify: `python3 -m http.server 7788 --bind 127.0.0.1` from repo root → open `http://127.0.0.1:7788/tools/story-explorer/index.html` → 9 columns render, act column ordered, clicking a lore node shows the body + thread, `#the-first-claim` chip highlights the two fragments + their anchors.

- [ ] **Step 5: Commit** — `git commit -m "feat: story explorer v2 — act/lore lanes, unlock chains, thread filter (narrative v2 T5)"`

---

### Task 6: authoring guide + final verification

**Files:**
- Modify: `content/story/README.md`

**Interfaces:** none produced; documents Tasks 1–5 exactly as shipped.

- [ ] **Step 1: Update `content/story/README.md`** — fact-check every claim against the shipped code, then: add `act` and `lore` to the kinds table (files `acts.json`/`lore.json`, id prefixes `act-`/`lore-`, required fields per the schemas); replace every `prereq` mention with `unlockedBy` (document: id-prefix semantics table, AND-only, cycle = FAIL); document character `status`/`diedAt` (+ the alive-with-diedAt FAIL); document act ordering rules (unique + contiguous 1..N, multiple arcs per act allowed) and the thread <2 WARN; update the agent authoring loop section (order: acts → regions/factions → characters → arcs → quests → events/dialogue → lore; run gate + `gen_story_graph.mjs --write` after edits); add one paragraph pointing at the Antagonist Doctrine + single-canon rule in `docs/superpowers/specs/2026-07-22-narrative-system-v2-design.md` as binding on epic authoring (sub-project B).

- [ ] **Step 2: Full verification sweep** (all from repo root unless noted):

```bash
node scripts/check_content.mjs                       # exit 0, 0 failures (3 pre-existing mobType WARNs)
node scripts/check_content.mjs --require-complete    # exit 0
node scripts/gen_story_graph.mjs --check             # in sync
cd scripts && node --test tests/*.test.mjs           # all green
cd .. && node --test tools/story-explorer/tests/*.test.mjs  # all green
```

Expected WARN inventory after this plan (document any others found): 3× map `mobType` unverified (pre-existing, until I-019).

- [ ] **Step 3: Commit** — `git commit -m "docs: story authoring guide v2 (narrative v2 T6)"`

---

## CI note

No `.github/workflows/ci.yml` change is required: the content gate, `gen_story_graph.mjs --check`, and the explorer smoke-test steps already run and automatically cover the v2 checks. If the scripts test-suite step is missing from CI (verify while in Task 6), add `node --test tests/*.test.mjs` (from `scripts/`) as a follow-up finding — do not silently extend CI in this plan.

## Post-plan self-review notes (resolved inline)

- Spec §4.1–4.4, §5, §6 map to Tasks 1, 2, 3, 4–5, and the seed edits inside 1–3 respectively; §7 (doctrine) lands as docs in Task 6; §8 exclusions honored (no runtime, no stances, no OR).
- Type consistency: `assertUnlockDag` + `buildQuestReachability` + `checkActOrdering` names used identically in Tasks 1–2 and the interfaces blocks; `STORY_KINDS` final order stated in Task 3 matches Task 5's `KINDS`.
- Deliberate cross-task easing: Tasks 1–3 keep the Mermaid artifact green by regenerating with placeholder styles; the full generator/explorer mirror moves in Tasks 4–5. The explorer smoke test's new-edge parity assertions land in Task 5 — between T2 and T5 the explorer simply renders no unlock edges (never wrong edges).
