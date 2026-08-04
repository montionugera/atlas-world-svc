# I-048 Season 1 Scope Cut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three artifacts in spec §3 — a decision record naming Season 1's content budget, a machine-readable budget file, and a report that measures the repo against it — so content work is sized against an adopted target instead of an unadopted 32-zone derivation.

**Architecture:** The budget is data (`content/season-1-budget.json`); measurement is a pure library (`scripts/lib/season1.mjs`) whose functions take a repo root and return counts; the CLI (`scripts/report_season1.mjs`) is a thin shell that reads the budget, calls the library, prints a table, and **always exits 0**. Budget lines that cannot be measured yet declare `blockedBy` instead of a measure, so the report says "blocked" rather than inventing a delta.

**Tech Stack:** Node 22 ESM (`"type": "module"`), `node:test` + `node:assert/strict` (the `scripts/` package's existing runner), no new dependencies.

## Global Constraints

- **Reporting only. `scripts/report_season1.mjs` must exit 0 on every path** — including a missing or malformed measured file. It is not a gate. (spec §3)
- **P1–P6 are not this plan's work.** They are prerequisites tracked as separate features. This plan may reference them by id; it must not implement them. (spec §4)
- No new npm dependencies. The `scripts/` package has exactly `ajv` and `js-yaml`.
- Tests run via `npm test --prefix scripts`, which is `node --test tests/*.test.mjs`.
- Existing gates must stay green: `node scripts/check_content.mjs` and `node scripts/check_asset_manifest.mjs`.
- Conventional commit subjects, kept short. Never `git commit --amend` — always a new commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/season-1-budget.json` | **Create.** The budget: one entry per line, each with a target and either a measure id or a `blockedBy` reason. The single source of the numbers. |
| `scripts/lib/season1.mjs` | **Create.** Pure measurement + row-building + rendering. Every function takes an explicit repo `root` so tests can point at a fixture. No process exit, no console. |
| `scripts/report_season1.mjs` | **Create.** CLI shell: parse args, read the budget, call the library, print, exit 0. |
| `scripts/tests/season1.test.mjs` | **Create.** Budget shape, measurement correctness against fixtures, blocked-line handling, and the exit-0 guarantee. |
| `scripts/tests/fixtures/season1/` | **Create.** A minimal fake repo root so measurement tests do not assert against live content that changes every release. |
| `docs/worldbuilding/DR-003-season-1-budget.md` | **Create.** The decision record. Cites DR-001 §6 and A1 §4.2 as parents, DR-004 and DR-005 as settled sub-decisions. |
| `.github/workflows/ci.yml` | **Modify.** One informational step that runs the report, satisfying spec §8(1) without gating. |

**Why the library/CLI split:** the CLI must call `process.exit(0)`, which makes it untestable by import. Keeping `buildRows` and `renderTable` in the library lets the tests assert on structure directly and reserve `execFileSync` for the one thing that genuinely needs a subprocess — the exit code.

---

## Task 1: The budget data file

**Files:**
- Create: `content/season-1-budget.json`
- Create: `scripts/tests/season1.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the budget document shape every later task reads —
  `{ version: 1, season: 1, cluster: 1, record: string, lines: Line[] }` where
  `Line = { id: string, label: string, target: number, source: string, measure?: string, blockedBy?: string }`.
  Exactly one of `measure` / `blockedBy` is present on each line.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/season1.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const budget = JSON.parse(readFileSync(join(ROOT, "content/season-1-budget.json"), "utf8"));

test("budget document has the expected envelope", () => {
  assert.equal(budget.version, 1);
  assert.equal(budget.season, 1);
  assert.equal(budget.cluster, 1);
  assert.equal(budget.record, "docs/worldbuilding/DR-003-season-1-budget.md");
  assert.ok(Array.isArray(budget.lines) && budget.lines.length > 0);
});

test("every line is well formed and ids are unique", () => {
  const ids = new Set();
  for (const line of budget.lines) {
    assert.equal(typeof line.id, "string", `line missing id: ${JSON.stringify(line)}`);
    assert.equal(ids.has(line.id), false, `duplicate line id: ${line.id}`);
    ids.add(line.id);
    assert.equal(typeof line.label, "string", `${line.id}: label must be a string`);
    assert.equal(Number.isInteger(line.target), true, `${line.id}: target must be an integer`);
    assert.equal(typeof line.source, "string", `${line.id}: source must cite where the number came from`);
    const measured = typeof line.measure === "string";
    const blocked = typeof line.blockedBy === "string";
    assert.ok(measured !== blocked, `${line.id}: needs exactly one of measure / blockedBy`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix scripts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../content/season-1-budget.json'`

- [ ] **Step 3: Write the budget file**

Create `content/season-1-budget.json`:

```json
{
  "version": 1,
  "season": 1,
  "cluster": 1,
  "record": "docs/worldbuilding/DR-003-season-1-budget.md",
  "lines": [
    {
      "id": "mob-bases",
      "label": "Implemented mob types (bases)",
      "target": 30,
      "measure": "mobBases",
      "source": "role-systems-designer-scale.md 1.3, scaled 32 zones to 10; pinned at 30 bases x 4 variants"
    },
    {
      "id": "bestiary-designs",
      "label": "Bestiary designs",
      "target": 116,
      "measure": "bestiaryDesigns",
      "source": "measured; no net-new designs, a re-band pass over ~54 stranded ones instead"
    },
    {
      "id": "quests-act-independent",
      "label": "Quests with no act or event gate",
      "target": 90,
      "measure": "actIndependentQuests",
      "source": "DR-005; giver-liveness is a manual canon read on top of this count"
    },
    {
      "id": "art-town",
      "label": "Town key art",
      "target": 6,
      "measure": "townArt",
      "source": "owner's art-class funding, 2026-08-01"
    },
    {
      "id": "art-bestiary",
      "label": "Bestiary art",
      "target": 30,
      "measure": "bestiaryArt",
      "source": "owner's art-class funding, 2026-08-01; one image per mob base"
    },
    {
      "id": "zones",
      "label": "Cluster-1 zones carrying a region id",
      "target": 10,
      "blockedBy": "P1 - keyspace unification; A1's ten zones have no region-* ids yet",
      "source": "A1-geography-cluster1.md 4.2"
    },
    {
      "id": "spawn-entries",
      "label": "Spawn entries",
      "target": 120,
      "blockedBy": "the variant axis does not exist on MobTypeConfig (spec 9 q2)",
      "source": "12 species per zone x 10 zones"
    },
    {
      "id": "world-state-systems",
      "label": "Observable world-state systems",
      "target": 1,
      "blockedBy": "P3 - buried-ground design",
      "source": "DR-001 6.4(1) and PX-V2: the bar is one, the current count is zero"
    }
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix scripts`
Expected: PASS — both new tests green, and every pre-existing test in `scripts/tests/` still green.

- [ ] **Step 5: Verify the existing gates are undisturbed**

Run: `node scripts/check_content.mjs && node scripts/check_asset_manifest.mjs`
Expected: both exit 0. A new file directly under `content/` must not perturb either gate — if it does, that is a finding, not a thing to work around.

- [ ] **Step 6: Commit**

```bash
git add content/season-1-budget.json scripts/tests/season1.test.mjs
git commit -m "feat(season-1): budget data file with shape tests"
```

- [ ] **Step 7: Quality gate** (global rule 7 — runs every task, not a permission stop)

1. **Review** — dispatch a fresh reviewer (code-reviewer agent or `/code-review`) on this task's diff alone. Ask specifically: is each of the eight targets traceable to its cited source, and is any line silently inventing a number?
2. **Refactor** — act on the findings while the diff is small.
3. **Re-verify** — re-run `npm test --prefix scripts` and both gates.

---

## Task 2: The measurement library

**Files:**
- Create: `scripts/lib/season1.mjs`
- Create: `scripts/tests/fixtures/season1/` (four small JSON files, below)
- Modify: `scripts/tests/season1.test.mjs` (append)

**Interfaces:**
- Consumes: the `Line` shape from Task 1.
- Produces:
  - `MEASURES: Record<string, (root: string) => number>` with keys `mobBases`, `bestiaryDesigns`, `actIndependentQuests`, `townArt`, `bestiaryArt`
  - `buildRows(budget: object, root: string) => Row[]` where `Row = Line & { actual: number | null, note: string }`
  - `renderTable(rows: Row[]) => string`

- [ ] **Step 1: Write the fixture repo root**

Create `scripts/tests/fixtures/season1/colyseus-server/generated/mob-types.json`:

```json
{ "version": 1, "mobTypes": ["balanced", "aggressive"] }
```

Create `scripts/tests/fixtures/season1/content/bestiary/bestiary.json`:

```json
[{ "id": "beast-one" }, { "id": "beast-two" }, { "id": "beast-three" }]
```

Create `scripts/tests/fixtures/season1/content/story/quests.json`:

```json
[
  { "id": "quest-free-root" },
  { "id": "quest-free-child", "unlockedBy": ["quest-free-root"] },
  { "id": "quest-act-gated", "unlockedBy": ["act-3"] },
  { "id": "quest-downstream-of-act", "unlockedBy": ["quest-act-gated"] },
  { "id": "quest-event-gated", "unlockedBy": ["event-bells-ring-true"] },
  { "id": "quest-cycle-a", "unlockedBy": ["quest-cycle-b"] },
  { "id": "quest-cycle-b", "unlockedBy": ["quest-cycle-a"] },
  { "id": "quest-mixed-gate", "unlockedBy": ["quest-free-root", "act-3"] },
  { "id": "quest-two-free-parents", "unlockedBy": ["quest-free-root", "quest-free-child"] }
]
```

`quest-mixed-gate` and `quest-two-free-parents` exist to discriminate the AND-gate: with only
singleton `unlockedBy` arrays, `.every()` and `.some()` are indistinguishable, so a regression
flipping the AND-gate to an OR-gate would pass unnoticed. `quest-two-free-parents` has two
free parents and must join the free set; `quest-mixed-gate` has one free parent and one act
gate and must never join — proving the semantics are AND, not OR.

Create `scripts/tests/fixtures/season1/game-client/assets/art/art-manifest.json`:

```json
{
  "version": 1,
  "entries": {
    "art:town-millcross": { "kind": "concept" },
    "art:town-gildmark": { "kind": "concept" },
    "art:class-mage": { "kind": "concept" }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Append to `scripts/tests/season1.test.mjs`:

```js
import { MEASURES, buildRows, renderTable } from "../lib/season1.mjs";

const FIXTURE = join(ROOT, "scripts/tests/fixtures/season1");

test("mobBases counts the codegen mob type ids", () => {
  assert.equal(MEASURES.mobBases(FIXTURE), 2);
});

test("bestiaryDesigns counts the top-level array", () => {
  assert.equal(MEASURES.bestiaryDesigns(FIXTURE), 3);
});

test("actIndependentQuests excludes act gates, event gates, their descendants and cycles", () => {
  // free: quest-free-root, quest-free-child, quest-two-free-parents (both of
  // its unlockedBy entries are themselves free). Everything else is gated,
  // downstream of a gate, or in a cycle that never resolves — including
  // quest-mixed-gate, whose unlockedBy mixes a free quest id with an act-*
  // id: this proves the AND-gate (every prerequisite must be free), since an
  // OR-gate (any prerequisite free) would wrongly admit it via quest-free-root.
  assert.equal(MEASURES.actIndependentQuests(FIXTURE), 3);
});

test("art measures count by key prefix", () => {
  assert.equal(MEASURES.townArt(FIXTURE), 2);
  assert.equal(MEASURES.bestiaryArt(FIXTURE), 0);
});

test("buildRows reports blocked lines without inventing a delta", () => {
  const doc = {
    lines: [
      { id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" },
      { id: "stuck", label: "S", target: 1, blockedBy: "P3 - buried-ground design", source: "s" },
    ],
  };
  const [measured, stuck] = buildRows(doc, FIXTURE);
  assert.equal(measured.actual, 2);
  assert.equal(measured.note, "3 short");
  assert.equal(stuck.actual, null);
  assert.match(stuck.note, /^blocked: P3/);
});

test("buildRows never throws when a measured file is missing", () => {
  const doc = { lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] };
  const [row] = buildRows(doc, join(ROOT, "scripts/tests/fixtures/does-not-exist"));
  assert.equal(row.actual, null);
  assert.match(row.note, /^unmeasurable:/);
});

test("renderTable emits a header and one line per row", () => {
  const out = renderTable(
    buildRows({ lines: [{ id: "measured", label: "M", target: 5, measure: "mobBases", source: "s" }] }, FIXTURE),
  );
  assert.match(out, /measured/);
  assert.match(out, /target/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --prefix scripts`
Expected: FAIL — `Cannot find module '.../scripts/lib/season1.mjs'`

- [ ] **Step 4: Write the library**

Create `scripts/lib/season1.mjs`:

```js
// Season 1 budget measurement (I-048). Pure: every function takes an explicit
// repo root so tests can point at a fixture instead of live content.
// Record: docs/worldbuilding/DR-003-season-1-budget.md
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readJsonAt(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

/** Implemented mob types, from the codegen artifact CI refreshes. */
export function mobBases(root) {
  const doc = readJsonAt(root, "colyseus-server/generated/mob-types.json");
  if (!Array.isArray(doc?.mobTypes)) throw new Error("mob-types.json: expected { mobTypes: string[] }");
  return doc.mobTypes.length;
}

/** Authored creature designs. The file is a top-level array. */
export function bestiaryDesigns(root) {
  const doc = readJsonAt(root, "content/bestiary/bestiary.json");
  if (!Array.isArray(doc)) throw new Error("bestiary.json: expected a top-level array");
  return doc.length;
}

/**
 * Quests reachable without an act-* or event-* unlock anywhere in their
 * transitive unlock chain. DR-001 6.4(4) makes the five acts permanently
 * unreachable, so a quest gated on one can never open. Computed as a LEAST
 * fixed point: a quest joins the free set only once every id it is unlocked by
 * is itself free, so unlock cycles correctly never join.
 *
 * Giver-liveness is deliberately NOT checked here — that is a manual read of
 * canon.md and belongs to the Archivist, not to a counter.
 */
export function actIndependentQuests(root) {
  const quests = readJsonAt(root, "content/story/quests.json");
  if (!Array.isArray(quests)) throw new Error("quests.json: expected a top-level array");
  const free = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of quests) {
      if (free.has(q.id)) continue;
      const unlocks = q.unlockedBy ?? [];
      if (unlocks.every((u) => u.startsWith("quest-") && free.has(u))) {
        free.add(q.id);
        changed = true;
      }
    }
  }
  return free.size;
}

function countArtPrefix(root, prefix) {
  const doc = readJsonAt(root, "game-client/assets/art/art-manifest.json");
  if (!doc?.entries || typeof doc.entries !== "object") {
    throw new Error("art-manifest.json: expected { entries: object }");
  }
  return Object.keys(doc.entries).filter((k) => k.startsWith(prefix)).length;
}

/** Town key art — one of the two art classes Season 1 funds. */
export function townArt(root) {
  return countArtPrefix(root, "art:town-");
}

/** Bestiary art — the other funded class. Zero today. */
export function bestiaryArt(root) {
  return countArtPrefix(root, "art:mob-");
}

export const MEASURES = { mobBases, bestiaryDesigns, actIndependentQuests, townArt, bestiaryArt };

/**
 * One row per budget line. A line that cannot be measured yet reports
 * actual = null and says why — the report must never invent a delta for
 * something nobody can count.
 */
export function buildRows(budget, root) {
  return budget.lines.map((line) => {
    if (line.blockedBy) return { ...line, actual: null, note: `blocked: ${line.blockedBy}` };
    const fn = MEASURES[line.measure];
    if (!fn) return { ...line, actual: null, note: `unknown measure: ${line.measure}` };
    try {
      const actual = fn(root);
      const note = actual >= line.target ? "met" : `${line.target - actual} short`;
      return { ...line, actual, note };
    } catch (err) {
      return { ...line, actual: null, note: `unmeasurable: ${err.message}` };
    }
  });
}

export function renderTable(rows) {
  const pad = (value, width) => String(value).padEnd(width);
  const out = [pad("line", 26) + pad("target", 8) + pad("actual", 8) + "note", "-".repeat(78)];
  for (const row of rows) {
    out.push(pad(row.id, 26) + pad(row.target, 8) + pad(row.actual ?? "-", 8) + row.note);
  }
  return out.join("\n");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix scripts`
Expected: PASS — all Task 1 and Task 2 tests green.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/season1.mjs scripts/tests/fixtures/season1 scripts/tests/season1.test.mjs
git commit -m "feat(season-1): measurement library with fixture-backed tests"
```

- [ ] **Step 7: Quality gate**

1. **Review** — fresh reviewer on this diff. Ask specifically: is the least-fixed-point in `actIndependentQuests` correct for cycles and for a quest whose `unlockedBy` mixes a quest id with an act id, and does any measure swallow an error it should surface?
2. **Refactor** — act on findings.
3. **Re-verify** — `npm test --prefix scripts`.

---

## Task 3: The report CLI

**Files:**
- Create: `scripts/report_season1.mjs`
- Modify: `scripts/tests/season1.test.mjs` (append)

**Interfaces:**
- Consumes: `buildRows`, `renderTable` from `scripts/lib/season1.mjs`; the budget file from Task 1.
- Produces: a CLI accepting `--root <path>` and `--budget <path>`, printing a table to stdout, **always exiting 0**.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/season1.test.mjs`:

```js
import { execFileSync } from "node:child_process";

const CLI = join(ROOT, "scripts/report_season1.mjs");

test("CLI prints every budget line and exits 0", () => {
  const out = execFileSync(process.execPath, [CLI], { encoding: "utf8" });
  for (const line of budget.lines) assert.match(out, new RegExp(line.id));
  assert.match(out, /Season 1 budget/);
});

test("CLI still exits 0 when every measured file is missing", () => {
  // The guarantee that makes this a report and not a gate.
  // --root also moves the default budget path, so --budget is passed
  // explicitly: the missing fixture root has no budget file to read.
  const out = execFileSync(
    process.execPath,
    [
      CLI,
      "--root",
      join(ROOT, "scripts/tests/fixtures/does-not-exist"),
      "--budget",
      join(ROOT, "content/season-1-budget.json"),
    ],
    { encoding: "utf8" },
  );
  assert.match(out, /unmeasurable:/);
});

test("CLI rejects an unknown flag with exit 2", () => {
  assert.throws(
    () => execFileSync(process.execPath, [CLI, "--nope"], { encoding: "utf8", stdio: "pipe" }),
    (err) => err.status === 2,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix scripts`
Expected: FAIL — `Cannot find module '.../scripts/report_season1.mjs'`

- [ ] **Step 3: Write the CLI**

Create `scripts/report_season1.mjs`:

```js
#!/usr/bin/env node
// Season 1 budget report (I-048). REPORTING ONLY: every input path exits 0
// except the deliberate process.exit(2) in parseArgs for an unknown flag or
// a flag missing its value.
// It is deliberately not a gate: the failure mode it exists to catch is
// authoring drift UPWARD toward a 32-zone continent, and a red floor check
// would be red for months and teach everyone to ignore it.
// Record: docs/worldbuilding/DR-003-season-1-budget.md
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows, renderTable } from "./lib/season1.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { root: ROOT, budget: null };
  const takeValue = (name, i) => {
    const v = argv[i];
    if (v === undefined) {
      console.error(`missing value for ${name}`);
      process.exit(2);
    }
    return v;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = resolve(takeValue(a, ++i));
    else if (a === "--budget") opts.budget = resolve(takeValue(a, ++i));
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  opts.budget ??= join(opts.root, "content/season-1-budget.json");
  return opts;
}

const opts = parseArgs(process.argv);

// A missing/malformed --budget file is still a report finding, not a crash:
// the "always exits 0" contract above covers every input path except the
// deliberate arg-parse exit(2) cases in parseArgs.
let budget;
try {
  budget = JSON.parse(readFileSync(opts.budget, "utf8"));
} catch (err) {
  console.log(`Season 1 budget — could not load ${opts.budget}: ${err.message}`);
  process.exit(0);
}
if (typeof budget !== "object" || budget === null || !Array.isArray(budget.lines)) {
  console.log(`Season 1 budget — could not load ${opts.budget}: expected an object with a "lines" array`);
  process.exit(0);
}
console.log(`Season ${budget.season} budget — cluster ${budget.cluster} — ${budget.record}`);
console.log(renderTable(buildRows(budget, opts.root)));
process.exit(0);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix scripts`
Expected: PASS.

- [ ] **Step 5: Capture the real output for the PR** (spec §8(1))

Run: `node scripts/report_season1.mjs`

Expected on **this branch** (`feat/F-025`, cut from `main` + `release/1.6`):

| line | target | actual | note |
|---|---|---|---|
| `mob-bases` | 30 | 6 | 24 short |
| `bestiary-designs` | 116 | – | `unmeasurable: ENOENT … content/bestiary/bestiary.json` |
| `quests-act-independent` | 90 | 8 | 82 short |
| `art-town` | 6 | 0 | 6 short |
| `art-bestiary` | 30 | 0 | 30 short |
| `zones`, `spawn-entries`, `world-state-systems` | — | – | `blocked: …` |

<div class="callout warn">
<strong>Two measures are dark on this branch, and that is expected — do not "fix" it.</strong>
<code>content/bestiary/bestiary.json</code> (116 designs) and the six <code>art:town-*</code> manifest
entries live on <strong>feat/F-024</strong>, which has not shipped into <code>release/1.6</code> yet.
This branch carries the 80-entry manifest (64 class, 9 cast, 7 race) and no bestiary at all.
<code>bestiary-designs</code> reporting <em>unmeasurable</em> and <code>art-town</code> reporting
<strong>0</strong> is the report behaving correctly. Once F-024 ships they become 116/116 and 6/6 with
no code change — that is the whole point of the graceful-degradation design. <strong>Verify this by
re-running the report after F-024 lands; do not merge feat/F-024 into this branch to make the numbers
look better.</strong>
</div>

**Paste the real output into the PR body**, including the unmeasurable lines — a report that only shows
its good numbers is not a report.

- [ ] **Step 6: Commit**

```bash
git add scripts/report_season1.mjs scripts/tests/season1.test.mjs
git commit -m "feat(season-1): budget report CLI, reporting only"
```

- [ ] **Step 7: Quality gate**

1. **Review** — fresh reviewer on this diff. Ask specifically: can any input path reach a non-zero exit other than the deliberate arg-parse exit 2, and does the `--budget` default resolve correctly when `--root` is also passed?
2. **Refactor** — act on findings.
3. **Re-verify** — `npm test --prefix scripts` and `node scripts/report_season1.mjs`.

---

## Task 4: The decision record and CI visibility

**Files:**
- Create: `docs/worldbuilding/DR-003-season-1-budget.md`
- Modify: `.github/workflows/ci.yml` (immediately after the `node scripts/check_content.mjs` step)

**Interfaces:**
- Consumes: the budget file (Task 1) and the report's real output (Task 3 step 5).
- Produces: the human-readable record `content/season-1-budget.json` points at via its `record` field.

- [ ] **Step 1: Write DR-003**

Create `docs/worldbuilding/DR-003-season-1-budget.md` containing, in this order:

1. **Header** — Level L2, Role Systems Designer (the numbers are that role's domain), date, and parents: `DR-001-L1-scope.md` §6 and §6.4, `A1-geography-cluster1.md` §4.2. Sub-decisions already settled: `DR-004-starter-ground.md`, `DR-005-act-axis.md`.
2. **What this supersedes** — the 32 zones / 384 species / 560 quests figures in `role-systems-designer-scale.md` §1.2–1.4 were derivations from a 24,000-unit continent, never adopted as a target. State that plainly.
3. **The budget table** — every line from `content/season-1-budget.json`, with its target, its measured actual from Task 3 step 5, and its cited source. The JSON is the source of truth; this table is its readable face.
4. **The weighting rule** — the Ashvale Front plus Millcross Ford, Emberdown and Hollowmarch carry ~60% of the 90 quests; the band floor (≥18 in bands 1–15, ≥6 exercising the burial verb) overrides the weighting where they conflict.
5. **The prerequisites** — P1–P6 from spec §4, each one line, each stating that the budget cannot be built toward until it lands.
6. **What this does not decide** — progression and XP, PvP, the reward law, the third register, the present-tense antagonist, and the two open questions owned by Systems Designer and Player Experience (spec §9 q2 and q3).

- [ ] **Step 2: Verify the record and the data agree**

Run: `node scripts/report_season1.mjs`
Expected: every line id printed appears in DR-003's table with the same target. A mismatch means the record drifted from the data on the day it was written — fix the record, never the data.

- [ ] **Step 3: Add the informational CI step**

Modify `.github/workflows/ci.yml`, immediately after the existing `node scripts/check_content.mjs` step:

```yaml
      # I-048: Season 1 budget report. Informational only — report_season1.mjs
      # always exits 0, so this step can never redden the build. It exists so
      # the target/actual delta is visible on every PR without anyone running it.
      - name: Season 1 budget report
        run: node scripts/report_season1.mjs
```

- [ ] **Step 4: Verify the workflow file still parses**

Run: `node --input-type=module -e "import yaml from 'js-yaml'; import {readFileSync} from 'node:fs'; yaml.load(readFileSync('.github/workflows/ci.yml','utf8')); console.log('ci.yml parses')"`
Expected: `ci.yml parses` (run from `scripts/` or with `NODE_PATH` set so `js-yaml` resolves — it is already a `scripts/` dependency).

- [ ] **Step 5: Render the record and read it**

Run: `bash ~/.claude/scripts/render-spec-md.sh docs/worldbuilding/DR-003-season-1-budget.md`
Expected: the HTML opens in Chrome. Read it — a record nobody can read is not a record. If the script silently no-ops because the path is not whitelisted, fall back to:
`pandoc docs/worldbuilding/DR-003-season-1-budget.md -s --toc --toc-depth=2 -H ~/.claude/spec-style.html -o docs/worldbuilding/DR-003-season-1-budget.html && open -a "Google Chrome" docs/worldbuilding/DR-003-season-1-budget.html`

- [ ] **Step 6: Commit**

```bash
git add docs/worldbuilding/DR-003-season-1-budget.md .github/workflows/ci.yml
git commit -m "docs(DR-003): adopt the Season 1 content budget"
```

- [ ] **Step 7: Quality gate**

1. **Review** — fresh reviewer on this diff. Ask specifically: does any number in DR-003 disagree with `content/season-1-budget.json`, and does the record claim anything as decided that spec §7 routes elsewhere?
2. **Refactor** — act on findings.
3. **Re-verify** — `npm test --prefix scripts`, `node scripts/check_content.mjs`, `node scripts/report_season1.mjs`.

---

## Self-review

**Spec coverage.** §3's three artifacts map to Tasks 1, 2+3, and 4. §5.1's numbers become budget lines — the measurable ones as `measure`, the rest as `blockedBy`. §5.2's weighting and band floor land in DR-003 part 4. §7's routed findings land in DR-003 part 6. §8's verification items map to Task 3 step 5 (report output in the PR), Task 2 (the report derives actuals by measuring rather than restating), Task 4 step 5 (rendered and read), and Task 4 step 1 (P1–P6 named). **Not covered by design:** §4's P1–P6 themselves and §9's two open questions — both excluded by the Global Constraints.

**Placeholder scan.** No TBD, no "handle errors appropriately", no "similar to Task N". Every code step carries the actual file content. DR-003 is specified as a six-part outline rather than verbatim prose because its table must be filled from the report's real output at write time — the outline names all six parts and what each must contain, so nothing is left to invention.

**Type consistency.** `Line` (Task 1) is extended by `Row` (Task 2) and consumed unchanged by Task 3. The `MEASURES` keys — `mobBases`, `bestiaryDesigns`, `actIndependentQuests`, `townArt`, `bestiaryArt` — match the `measure` values in the budget file exactly. `buildRows(budget, root)` and `renderTable(rows)` keep the same signatures in the library, the tests and the CLI.

**One risk worth naming.** `art:mob-*` is a key prefix no manifest entry uses yet, so `bestiaryArt` returns 0 by counting nothing rather than by measuring an absence. If the art pipeline later mints bestiary keys under a different prefix, the measure reads 0 forever and looks correct. Task 4's reviewer should check the prefix against whatever `intake-art.mjs` actually writes.
