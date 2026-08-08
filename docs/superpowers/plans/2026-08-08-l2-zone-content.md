# L2 Zone Content Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of cluster 1's ten zones a machine-checked content record — hazards, resources, landmarks, and the reason a player walks in — plus the gate, tests, world artifact and budget measure that prove the pass is complete.

**Architecture:** Ten `content/zones/zone-<id>.json` records are validated for *shape* by a deliberately permissive `content/schemas/zone-content.schema.json`, and for *content rules* by a new `checkZoneContent()` in `scripts/check_content.mjs` implementing rules Z1–Z7. A `zones(root)` measure in `scripts/lib/season1.mjs` counts records clearing the Z3 floors so `content/season-1-budget.json`'s `zones` line becomes measurable instead of blocked. `docs/worldbuilding/A2-zones-cluster1.md` is the human-readable derivation that the ten records are transcribed from.

**Tech Stack:** Node 26 ESM (`.mjs`), `node:test` + `node:assert/strict`, Ajv 8 (draft-07), JSON data under `content/`, Markdown under `docs/worldbuilding/`. No new dependencies.

---

## Global Constraints

- **Every command in this plan runs from the REPO ROOT, and there is no bare `cd` anywhere.** A bare `cd` is not scoped to one line — it persists for the rest of the fenced block, and the next line is always a repo-root-relative command (`node scripts/check_content.mjs`, `node scripts/report_season1.mjs`, `git add content/zones`). From inside `scripts/`, `node scripts/check_content.mjs` dies with `MODULE_NOT_FOUND`, and a *second* `cd scripts` fails outright (`cd: no such file or directory: scripts`), which short-circuits the `&&` so `npm test` never runs while `/tmp/t.out` keeps a **stale** previous run — the following grep then prints an old `ℹ fail 0` and a step that never executed reads as green. That is the same class of false-green as the `$?`-after-a-pipe trap below. If a directory change is ever genuinely wanted, wrap it in a subshell so it cannot leak: `(cd scripts && node -e '…')` — the form Task 3a Step 2 already uses.
- **Node test runner form.** `npm install --prefix scripts` then `npm test --prefix scripts` — `--prefix` is what `.github/workflows/ci.yml:77-78` itself runs, and it never changes cwd. **`node --test scripts/tests/` is BROKEN on Node 26** (MODULE_NOT_FOUND, exit 1). The only other working form is `node --test scripts/tests/*.test.mjs` from the repo root. This worktree runs **v26.5.0** (verified).
- **A fresh worktree has no `scripts/node_modules`.** Always `npm install --prefix scripts` (or `npm ci --prefix scripts`, what CI runs) before the first test run in a session.
- **The runner emits the SPEC reporter, not TAP — even when stdout is redirected to a file (measured).** There are **zero** `# pass` / `# fail` / `not ok` lines anywhere in its output. The real marker lines are `ℹ tests N`, `ℹ pass N`, `ℹ fail N`, with per-test `✔` (pass) and `✖` (fail) markers. **Every expectation in this plan is written against those markers.** Do not "fix" a step by reintroducing TAP shapes, and do **not** edit `scripts/package.json`'s test script to force `--test-reporter=tap`: `.github/workflows/ci.yml:78` and `scripts/integration.sh` both invoke `npm test` and would silently change format.
- **The canonical verify form — use it verbatim in every step that runs the suite** (no pipe, so the exit code is the runner's and not grep's; no `cd`, so the cwd is still the repo root on the next line):
  ```bash
  npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
  ```
  Measured from the repo root on this worktree: `exit=0`, `ℹ tests 191`, `ℹ pass 191`, `ℹ fail 0`, and `pwd` unchanged afterwards. On a RED step, add `grep -E "^✖" /tmp/t.out | head -40` to read the failures. On a GREEN step `exit=0` and `ℹ fail 0` are both required — neither alone is proof.
- **The measured baseline of this worktree, taken on the commit this plan was written against.** `npm test --prefix scripts` → **`ℹ tests 191`, `ℹ pass 191`, `ℹ fail 0`**, exit 0. `node scripts/check_content.mjs` → exit 0 printing exactly `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings`. **Every task states its pass-count and its gate-summary delta against these two real numbers, never against a remembered one.** If the branch has moved since, re-measure both before Task 1 and carry the new baseline forward instead.
- **NEVER write `$?` after a pipe** — it reports the last pipeline element, not your command. Redirect to a file or `/dev/null` and read `$?`, or run without a pipe. In zsh `${PIPESTATUS[0]}` is also empty (it is `$pipestatus[1]`).
- **The world artifact is `docs/worldbuilding/A2-zones-cluster1.md` — A2, NOT A3.** SWF §2 reserves `A3` for L3 (races, dungeons, camps, bosses), which is I-063's slot. Design §0 callout says so explicitly.
- **`resources[].kind` enum, exactly 8 values:** `crop, timber, ore, fuel, stone, water, forage, salvage` (spec §6).
- **`hazards[].effect` enum, exactly 7 values in this order:** `freeze, stun, burn, poison, regen, heal, damage` — copied from `content/schemas/map.schema.json` `#/properties/zoneHazards/items/properties/type/enum`, consumed by `ZoneEffectManager` (spec §2 item 3, §6).
- **`effect` is optional.** Z5 **WARNs** when a hazard has no `effect`; it **FAILs** only on a bad value (spec §7, D3).
- **Where the gate and the suite actually run — three different answers, and only one of them is "nowhere".**
  - **Gate 1 (`scripts/precheck.sh`) runs NEITHER `check_content.mjs` NOR the scripts suite.** Verified: `grep -n 'check_content' scripts/precheck.sh` returns nothing, and its only `npm test` lines are 102 (`colyseus-server`) and 125 (`client/react-client`) — neither is `scripts/`. Gate 1 will not catch either kind of red.
  - **CI (`.github/workflows/ci.yml:77-79`) runs BOTH on every push** — `npm ci --prefix scripts` on line 77, `npm test --prefix scripts` on line 78, then `node scripts/check_content.mjs` on line 79. So a pushed commit with a red suite or a red gate reddens CI. This is why every task boundary in this plan must be green *before* it is pushed; "nobody runs it" is false. **All three are lines of a single `run: |` block** (verified: one `run: |` at `ci.yml:76` covering 77-79), so the step runs them under one shell with `set -e` semantics — **a red suite short-circuits the step and `check_content.mjs` never executes**. Consequence when diagnosing: a CI failure that names only the suite is **not** evidence the gate is green — the gate produced no output at all. Fix the suite locally, then run the gate yourself before pushing again.
  - **Gate 2 (`scripts/integration.sh`) runs both, and runs the gate in a stricter mode than any other caller** — the scripts suite at line 87 (`content_tests`), and the gate at line 81 as `node scripts/check_content.mjs --require-complete`. That is the ship bar. No step in the original draft ever exercised that flag. `--require-complete` escalates in exactly two places (`checkStoryCoherence(..., requireComplete)` and the `opts.requireComplete ? fail : warn` ternary at `check_content.mjs:609`, character-key coverage), so Z5's plain `warn()` is **not** escalated — but that is a claim to *verify*, not to assume: run `node scripts/check_content.mjs --require-complete` and read the exit code before ship.
  Run `node scripts/check_content.mjs` by hand at every task's verify step, and `--require-complete` once in the final Verification.
- **Zone ids come from `content/maps/cluster1-geography.json#zones` and are never invented:** `meltwash-terrace, millcross-ford, rooktide-reach, thornveil, emberdown, gildmark-head, hollowmarch, ashvale-front, northern-icefield, cindervast`.
- **`content/maps/cluster1-geography.json` is never edited** (spec §12). Zone records reference it; nothing is written back.
- **`scripts/` is not prettier-formatted.** Husky/lint-staged is scoped to `colyseus-server/src/**/*.ts`. Do not run prettier over `scripts/lib/season1.mjs` or `scripts/check_content.mjs` — it reflows the file and buries the diff. `content/**/*.json` formatting is hand-maintained: 2-space indent, short scalar schemas on one line.
- **Never `git commit --amend`.** Always a new commit on top.

### Two cross-lane conflicts, resolved here — read before writing any code

**Conflict 1 — where the vocabulary rules live. RESOLVED: the schema is SHAPE-ONLY; the gate owns every Z-rule.**

`checkBestiaryPlacement()` (the model function) does `if (!validate(doc)) { fail; continue; }` — **a schema-invalid document never reaches a single rule**. So any constraint the schema duplicates makes the matching Z-rule *unreachable dead code*: you could delete it from `check_content.mjs` and the suite would stay green off the schema error. That is exactly the F-029 failure mode this repo has already been bitten by, and spec §7's Z-table names Z3/Z4/Z5/Z7 as **gate** rules.

Therefore `content/schemas/zone-content.schema.json` **must NOT** carry:

| Field | Schema says | Z-rule owns |
| --- | --- | --- |
| `hazards` / `resources` / `landmarks` | `{"type":"array"}` — **no `minItems`** | Z3 (the ≥2 floors) |
| `reasonToGo` | `{"type":"string"}` — **no `minLength`** | Z3 (non-empty, trim-aware) |
| nested `id` fields | `{"type":"string","minLength":1}` — **no `pattern`** | Z4 (kebab-case) |
| `hazards[].effect` | optional `{"type":"string"}` — **no `enum`** | Z5 (the seven runtime types) |
| `resources[].kind` | `{"type":"string"}` — **no `enum`** | Z7 (the eight kinds) |

The schema keeps `required` and `additionalProperties: false` at every level (spec §6). Four `reachability:` tests assert positively that a Z-violating document is schema-*valid*, so a later "tightening" goes red before it can silently defang a Z-rule. Precedent: `bestiary-placement.schema.json` deliberately omits depthTier-id uniqueness — see the comment at `bestiary-placement.test.mjs` G7.

**Consequence:** because the schema is permissive, **all** Z-rules run *after* the `validate`/`continue`, uniformly. Do **not** hoist Z3 above validation — with a shape-only schema a 1-hazard record is schema-valid and reaches Z3 naturally.

**Conflict 2 — the `version` field. RESOLVED: there is NO `version` field.** Spec §6's example record has none, and `additionalProperties: false` means adding one would reject every fixture in the test suite and every authored record. (`bestiary-placement.schema.json` has one, but that is that file's convention, not this one's.)

**Conflict 3 — message wording. RESOLVED: the test file's strings are the contract.** Every gate message below is stated verbatim in Task 4's Interfaces block. Assertions are `assert.match` on exact text; if you reword a message you must change the regex in lockstep — but do **not** weaken any assertion to a bare exit-code check.

### How Z2 is sequenced so the gate is never red across a commit

**Rule Z2 (every one of the ten zones has exactly one record) FAILS until all ten records exist.**

**Choice: author all ten records in ONE task (Task 3), which lands strictly BEFORE the task that introduces the gate (Task 4).** By the time `checkZoneContent()` exists, `content/zones/` already holds all ten, so Z2 is satisfied on its very first run.

**Why this ordering and not the alternative** ("make the task that introduces Z2 the same task that completes the tenth record"): the gate is ~120 lines of new logic with 41 tests, and the ten records are ~10 hand-authored world-content files. Fusing them makes one un-reviewable commit and forces the adversarial review to cover code and prose at once. Splitting keeps each diff reviewable, and the ordering — data first, gate second — is what keeps the tree green:

- After Task 1 (schema only): nothing reads the schema. Gate green.
- After Task 3 (ten records, no gate): `check_content.mjs` has no `checkZoneContent()`, so `content/zones/` is simply not looked at. Gate green.
- After Task 4 (gate): all ten records are present. Z2 passes on the first run. Gate green.

The **soft-skip** guard is what makes this safe for every *other* fixture: `checkZoneContent()` returns 0 before anything else if `content/zones/` is absent, and again if it holds no `zone-*.json`. Without that, all ~40 existing tests in `check_content.test.mjs` and `bestiary-placement.test.mjs` — whose fixtures have no `content/zones` — would see ten "geography zone X has no record" FAILs and go red.

---

## File Structure

| File | Created / Modified | Single responsibility |
| --- | --- | --- |
| `content/schemas/zone-content.schema.json` | **Create** | Draft-07 **shape** of one zone record: required fields, `additionalProperties:false` at every level. Owns no vocabulary and no cardinality. |
| `docs/worldbuilding/A2-zones-cluster1.md` | **Create** | The L2 world artifact. SWF §3 nine-part contract + the ten-zone derivation table (the authoring input for the records) + § alternates (prose only) + citation register. |
| `content/zones/zone-<id>.json` × 10 | **Create** | One record per geography zone: `zone`, `reasonToGo`, `hazards[]`, `resources[]`, `landmarks[]`. |
| `scripts/check_content.mjs` | **Modify** | Adds `ZONE_RESOURCE_KINDS` / `ZONE_HAZARD_EFFECTS` / `ZONE_ID_RE`, the two Z5 counters, `checkZoneContent(opts)` (Z1–Z7), one line in `main()`, the 5th param + two new output segments in `finish()` (the `zone-content:` line **guarded** so zone-less roots gain nothing), and renames `loadGeographyZones` to `readGeographyZones` behind a one-line memoizing wrapper so two consumers parse the geography once and a broken one FAILs once. |
| `scripts/tests/zone-content.test.mjs` | **Create** | Deliverable 4. Schema/reachability tests, soft-skip + wiring tests, and both polarities of Z1–Z7 driven through the real gate binary against hermetic tmpdir fixtures. **56 tests total** — 13 from Task 1, 4 from Task 3b, 39 from Task 4. |
| `scripts/lib/season1.mjs` | **Modify** | Adds `readdirSync` to the import, `ZONE_FILE`, `export function zones(root)`, and `zones` in the `MEASURES` registry. |
| `content/season-1-budget.json` | **Modify** | The `zones` line only: drop `blockedBy`, add `"measure": "zones"`, rewrite `label` and `source`. |
| `scripts/tests/season1.test.mjs` | **Modify** | Appends the 9-test `zones()` block + **three** import lines (`node:fs` extras, `node:os`'s `tmpdir`, `node:child_process`'s `execFileSync` — seven new bindings, all currently unbound in this file). No existing test is edited. |
| `scripts/tests/fixtures/season1/content/zones/*.json` | **Create** (6 files) | Fixture records for the measure: 2 complete, 1 short a hazard, 1 blank `reasonToGo`, 1 duplicate zone id, 1 non-record (`notes.json`). |
| `docs/worldbuilding/DR-003-season-1-budget.md` | **Modify** | **Five** places that still assert the `zones` line is blocked, in six edits — the §0 callout, the §3 table row, the "three blocked lines" sentence *and* its `zones` bullet (one place, two lines), the verbatim report block, and the P1 consequence cell. Two of them never use the word "blocked". |
| `content/story/canon.md` | **Modify** | §6.1 Keyspace register, "Open, not resolved:" paragraph — the sentence claiming the line stays `blockedBy`. |
| `content/README.md` | **Modify** | The `schemas/` inventory line, which omits both `bestiary-placement` and `zones`. |
| `docs/worldbuilding/idea-map.md` | **Modify** | The I-060 row's Output-artifact cell — the second carrier of the retracted alternates promise, named by design §0's D1 callout. |
| `.claude/idea_backlog/I-060-*/research.md`, `plan.md` | **Modify** | Deliverable 8 — headings still carry the pre-D1 title. **`spec.md` is already corrected in the repo and is deliberately not modified.** |

---

## Task 1: The shape-only zone-content schema

**Files:**
- Create: `content/schemas/zone-content.schema.json`
- Create (test): `scripts/tests/zone-content.test.mjs` — the schema + reachability half only

**Interfaces:**
- **Consumes:** nothing. This is the root of the dependency chain.
- **Produces:** the file path `content/schemas/zone-content.schema.json`, compiled by Task 4's gate via `compileSchema(join(opts.contentRoot, "schemas/zone-content.schema.json"), "zone-content schema", fail)` and by Task 1/3's tests via a local `compile()` helper.
- **Record shape produced (the contract every later task depends on):**
  ```
  { zone: string,
    reasonToGo: string,
    hazards:   [{ id, name, description, effect?, note? }],
    resources: [{ id, name, kind, description }],
    landmarks: [{ id, name, description, source? }] }
  ```
  **No `version` field.**
- **Test helpers produced (Tasks 3a/3b and 4 reuse them from this same file):** `ROOT`, `GATE`, `SCHEMA_PATH`, `GEOGRAPHY_PATH`, `ZONE_IDS`, `ZONE_BANDS`, `RESOURCE_KINDS`, `EFFECTS`, `ZONE_ID_RE`, `FIXTURE_KINDS_BY_ZONE`, `compile()`, `zoneRecord(id)`. **`FIXTURE_KINDS_BY_ZONE` is hermetic fixture data and is deliberately NOT the authored kind sets of Tasks 2/3 — see the comment at its definition.**
  - `SCHEMA_PATH` is what `compile()` reads; it is the only place the schema path is written in the test file.
  - `GEOGRAPHY_PATH` is the binding **Task 3b's `the committed records cover exactly the geography's zones` test reads** — it is a cross-task binding, not a Task-1-local constant, so do not inline it.
- **`ZONE_ID_RE` is written TWICE on purpose** — once here (the test file) and once in Task 4's patch B (the gate). The two copies are not the same variable and nothing in the language binds them. What binds them is one specific test: **Task 4's `Z4: the gate's kebab rule rejects leading, trailing and doubled hyphens`**, which drives three boundary values through the real gate binary, so a gate regex loosened to `/^[a-z0-9-]+$/` goes red even though this file's copy is unchanged. That is the same treatment `ZONE_FILE` gets from Task 5's filename-agreement test. Do not "deduplicate" the two regexes by importing one from the other — `check_content.mjs` calls `main()` and `process.exit()` at module scope and cannot be imported.

Steps:

- [ ] **Step 1: Write the failing test** — create `scripts/tests/zone-content.test.mjs` with the shared header plus the schema/reachability tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
// `readdirSync` is bound here and first used by Task 3b's directory-enumeration
// test — the one that proves content/zones/ holds exactly ten records and
// nothing else, the way Task 4's gate enumerates it.
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");
const SCHEMA_PATH = join(ROOT, "content/schemas/zone-content.schema.json");
const GEOGRAPHY_PATH = join(ROOT, "content/maps/cluster1-geography.json");

// I-060 spec §6 / §7. The ten cluster-1 zones, in geography order.
const ZONE_IDS = [
  "meltwash-terrace", "millcross-ford", "rooktide-reach", "thornveil", "emberdown",
  "gildmark-head", "hollowmarch", "ashvale-front", "northern-icefield", "cindervast",
];

// Real levelBands from content/maps/cluster1-geography.json#zones. No Z-rule
// reads them, but the fixture geography must be shaped like the real one.
const ZONE_BANDS = {
  "meltwash-terrace": [1, 10], "millcross-ford": [1, 15], "rooktide-reach": [10, 20],
  "thornveil": [15, 28], "emberdown": [25, 35], "gildmark-head": [30, 45],
  "hollowmarch": [35, 48], "ashvale-front": [10, 80], "northern-icefield": [55, 70],
  "cindervast": [65, 80],
};

// The closed resource-kind enum (spec §6). Z7 owns it; the SCHEMA must not.
const RESOURCE_KINDS = ["crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage"];

// The seven runtime zoneHazards types (content/schemas/map.schema.json
// #zoneHazards/items/type). Z5 owns this list; the schema must not.
const EFFECTS = ["freeze", "stun", "burn", "poison", "regen", "heal", "damage"];

// Z4's kebab-case shape. The gate owns the rule (the schema must not carry a
// `pattern`), but Tasks 3a/3b assert it over the committed records too, so the
// ten files are proven kebab-clean BEFORE the gate that enforces it exists.
const ZONE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Ten pairwise-DISTINCT resource-kind sets, one per zone, so the baseline
// fixture is Z6-clean by construction and every Z6 test has to manufacture the
// collision it asserts.
//
// DELIBERATELY NOT the shipped records' kind sets (see Task 2 §2.1 and Tasks
// 3a/3b). These are hermetic fixture values whose only requirement is to be ten
// pairwise-distinct sets. Three of Task 4's Z6 tests depend on `gildmark-head`
// being exactly {ore, stone} and on `hollowmarch` NOT being, so that the
// collision they manufacture is reachable; the `doesNotMatch(/resource-kind
// set/)` assertion in Task 4's Z3-resources test depends on the same thing.
// DO NOT "reconcile" this table with content/zones/*.json — syncing them is an
// obvious-looking cleanup that silently defangs three tests. Changing the
// authored sets must not change these; changing these must not change the
// authored sets.
const FIXTURE_KINDS_BY_ZONE = {
  "meltwash-terrace": ["water", "forage"],
  "millcross-ford": ["crop", "stone"],
  "rooktide-reach": ["salvage", "timber"],
  "thornveil": ["timber", "forage"],
  "emberdown": ["fuel", "crop"],
  "gildmark-head": ["ore", "stone"],
  "hollowmarch": ["ore", "fuel"],
  "ashvale-front": ["stone", "salvage"],
  "northern-icefield": ["water", "stone"],
  "cindervast": ["salvage", "ore"],
};

function compile() {
  return new AjvClass({ allErrors: true }).compile(
    JSON.parse(readFileSync(SCHEMA_PATH, "utf8")));
}

// A record that satisfies every Z-rule, sitting EXACTLY on the Z3 floors (2 of
// each) so any test that removes one element trips the floor and no test
// accidentally has slack.
function zoneRecord(id) {
  const [k1, k2] = FIXTURE_KINDS_BY_ZONE[id];
  return {
    zone: id,
    reasonToGo: `What a person walks into ${id} to take out again.`,
    hazards: [
      { id: `${id}-hazard-a`, name: `${id} hazard A`, description: "d", effect: "burn" },
      { id: `${id}-hazard-b`, name: `${id} hazard B`, description: "d", effect: "poison" },
    ],
    resources: [
      { id: `${id}-res-a`, name: `${id} resource A`, kind: k1, description: "d" },
      { id: `${id}-res-b`, name: `${id} resource B`, kind: k2, description: "d" },
    ],
    landmarks: [
      // `source` is optional (spec §6): A carries one, B deliberately does not,
      // so the pass case proves no rule silently requires it.
      {
        id: `${id}-mark-a`, name: `${id} landmark A`, description: "d",
        source: "docs/worldbuilding/A1-geography-cluster1.md#6",
      },
      { id: `${id}-mark-b`, name: `${id} landmark B`, description: "d" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Schema-vs-gate division of labour. The gate `continue`s past a schema-invalid
// document (checkBestiaryPlacement does the same), so ANY constraint the schema
// duplicates makes the corresponding Z-rule UNREACHABLE — it could be deleted
// from check_content.mjs and the suite would stay green off the schema error.
// These tests pin the division so that can never happen silently.
// ---------------------------------------------------------------------------

test("the baseline record validates", () => {
  const validate = compile();
  assert.ok(validate(zoneRecord("emberdown")), JSON.stringify(validate.errors, null, 2));
});

test("schema rejects an unknown top-level property", () => {
  assert.equal(compile()({ ...zoneRecord("emberdown"), surprise: true }), false);
});

test("schema rejects an unknown property inside a resource", () => {
  const doc = zoneRecord("emberdown");
  doc.resources[0].yield = 3;
  assert.equal(compile()(doc), false);
});

test("schema rejects a record with no reasonToGo", () => {
  const doc = zoneRecord("emberdown");
  delete doc.reasonToGo;
  assert.equal(compile()(doc), false);
});

test("schema rejects a resource with no kind, and a landmark with no description", () => {
  const validate = compile();
  const noKind = zoneRecord("emberdown");
  delete noKind.resources[0].kind;
  assert.equal(validate(noKind), false, "kind is required");
  const noDesc = zoneRecord("emberdown");
  delete noDesc.landmarks[0].description;
  assert.equal(validate(noDesc), false, "description is required");
});

test("reachability: the schema must NOT floor the arrays — Z3 owns the floors", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards = [doc.hazards[0]];
  doc.resources = [doc.resources[0]];
  doc.landmarks = [doc.landmarks[0]];
  doc.reasonToGo = "";
  assert.ok(validate(doc), `a below-floor record must be SCHEMA-valid so Z3 is the \
only thing that can reject it: ${JSON.stringify(validate.errors, null, 2)}`);
});

test("reachability: the schema must NOT pattern-lock item ids — Z4 owns kebab-case", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].id = "Seam_Damp";
  doc.resources[0].id = "Burning Stone";
  doc.landmarks[0].id = "TheAdits";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("reachability: the schema must NOT enum-lock hazard effect — Z5 owns the seven types", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].effect = "melt";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("reachability: the schema must NOT enum-lock resources[].kind — Z7 owns the enum", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.resources[0].kind = "gemstone";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema keeps `effect` optional — a hazard with none is a valid document", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  delete doc.hazards[0].effect;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema keeps `source` optional — an uncited landmark is a review question, not an error", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  delete doc.landmarks[0].source;
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

// `note` is the authoring-only field spec §6's example record carries, and
// thirteen of the twenty-three authored hazards use it to say why no runtime
// effect fits (Task 3a/3b). With `additionalProperties: false` at every level,
// deleting `note` from the schema would make all thirteen of those records
// schema-invalid — and no other test in this plan constructs a record with one,
// so the suite would stay green until someone hit it in content. This is that
// test.
test("schema accepts an optional authoring note on a hazard", () => {
  const validate = compile();
  const doc = zoneRecord("emberdown");
  doc.hazards[0].note = "authoring note; never player-facing";
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

// The schema deliberately stops here: uniqueness is cross-item, and the gate
// (Z4) owns it. Mirrors bestiary-placement.test.mjs's note that "the schema
// does not constrain depthTier id uniqueness". This test pins the division so
// a later reader does not "fix" the schema and leave Z4 untested.
test("schema does NOT catch duplicate ids within an array — that is Z4's job", () => {
  const doc = zoneRecord("emberdown");
  doc.hazards[1] = { ...doc.hazards[0] };
  assert.ok(compile()(doc), "duplicate detection belongs to the gate, not the schema");
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm install --prefix scripts
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
grep -E "^✖" /tmp/t.out | head -30
```
Expected failure: `exit=1`; `ℹ fail` is the count of the tests added in Step 1 and `ℹ pass 191` is unchanged (the other suites stay green); every `✖` line names a test from `zone-content.test.mjs`, each erroring with `ENOENT: no such file or directory, open '.../content/schemas/zone-content.schema.json'`.

- [ ] **Step 3: Write minimal implementation** — create `content/schemas/zone-content.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas zone content",
  "description": "One file per cluster-1 zone: why a player walks in, what threatens them, what they carry out, and what they remember seeing. A sibling to content/maps/cluster1-geography.json, which stays the authority on where a zone is (id, levelBand, polygon) and is never written back to. Shape only: the floors, the kebab-case ids, the hazard effect enum and the resource kind enum are gate rules Z3/Z4/Z5/Z7 in scripts/check_content.mjs, because a schema-invalid document never reaches them. I-060.",
  "type": "object",
  "required": ["zone", "reasonToGo", "hazards", "resources", "landmarks"],
  "additionalProperties": false,
  "properties": {
    "zone": { "type": "string", "minLength": 1 },
    "reasonToGo": { "type": "string" },
    "hazards": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "description"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "name": { "type": "string", "minLength": 1 },
          "description": { "type": "string", "minLength": 1 },
          "effect": { "type": "string" },
          "note": { "type": "string", "minLength": 1 }
        }
      }
    },
    "resources": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "kind", "description"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "name": { "type": "string", "minLength": 1 },
          "kind": { "type": "string" },
          "description": { "type": "string", "minLength": 1 }
        }
      }
    },
    "landmarks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "description"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "name": { "type": "string", "minLength": 1 },
          "description": { "type": "string", "minLength": 1 },
          "source": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
```
Expected: `exit=0`, `ℹ fail 0`, and `ℹ pass` at **204 or higher** — the measured baseline is `ℹ pass 191` / `ℹ fail 0`, and Step 1 adds thirteen tests, so a pass count below 204 means tests were dropped, not that the suite is green.

- [ ] **Step 5: Verify the untouched gate is still green** (evidence, not assumption)
```bash
node scripts/check_content.mjs; echo "exit=$?"
```
Expected: `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings` and `exit=0`. Nothing reads the new schema yet.

- [ ] **Step 6: Commit**
```bash
git add content/schemas/zone-content.schema.json scripts/tests/zone-content.test.mjs
git commit -m "feat(content): shape-only zone-content schema + reachability tests (I-060)"
```

- [ ] **Step 7: Independent adversarial review of this task's diff.** Dispatch a fresh subagent (or `/code-review`) scoped to `git show --stat HEAD` + the full diff. It must specifically check: does any keyword in the schema make a Z-rule unreachable? Is `additionalProperties:false` present at **every** object level? Does the record shape match spec §6 exactly, with no `version`?

- [ ] **Step 8: Refactor on the findings** — apply every finding. Do not carry any forward as "later".

- [ ] **Step 9: Re-verify** — re-run Steps 4 and 5 and paste the real output. Commit any refactor as a **new** commit (never `--amend`).

---

## Task 2: The world artifact — `A2-zones-cluster1.md`

**Files:**
- Create: `docs/worldbuilding/A2-zones-cluster1.md`
- Create (throwaway, **not committed**): `z6-check.mjs` in this session's scratchpad directory. Every invocation of it in this plan runs **from the repo root** — the script resolves the artifact through the cwd-relative `const ARTIFACT = "docs/worldbuilding/A2-zones-cluster1.md"`, so running it from anywhere else fails with ENOENT.
- Test: none (prose). Verified by grep-based gate checks and by the pairwise resource-kind check in Step 3.

**Interfaces:**
- **Consumes:** `docs/worldbuilding/A1-geography-cluster1.md` (§3.1 rivers, §4.2 the ten zones, §4.3 the Front's three ages, §4.4 the alternates, §6 the six town economies), `docs/worldbuilding/A2-ecology-thornveil.md` (Thornveil's landmarks and tiers — this artifact must not restate them differently), `content/maps/cluster1-geography.json`, `content/bestiary/bestiary.json` (mob lore lines), `content/maps/atlas-frontier.md` (`zoneHazards`), `content/story/style.md`, `content/story/canon.md`.
- **Produces:** the §2 derivation table, written out in full in Step 3 below, which is the **authoring input Tasks 3a/3b transcribe into the ten JSON records**. Every `reasonToGo`, hazard, resource and landmark in Tasks 3a/3b appears in this table with its `[C]` / `[D]` / `[N]` citation marker.
- **Exactly what the §2 table binds, and what it does not.** The table carries — and therefore binds, `grep -F`-findably — every **zone id**, **`reasonToGo`** (verbatim), **hazard id**, **hazard `effect`** (or `none`), **resource id**, **resource `kind`**, **landmark id**, **landmark `name`** and **landmark `source`** in the ten records. It carries **no cells at all** for the prose fields: hazard `name`, hazard `description`, hazard `note`, resource `name`, resource `description`, landmark `description`. Those ~120 strings are **authored in Tasks 3a/3b against `content/story/style.md`** and are reviewed for voice, not for table provenance. Do not brief a reviewer to grep them against this table — they are not in it, and a reviewer who is told they are will report ~140 false defects or learn to ignore the instruction.
- **Produces (binding on Tasks 3a/3b):** the ten resource-kind sets, already Z6-checked pairwise.
- **Produces (machine-readable):** **§2.1 is a fenced ` ```json ` block holding the ten `zone -> kinds` pairs** — the first ` ```json ` fence in the file. This is what makes Task 2 independently testable: Step 4's `z6-check.mjs` parses that fence out of the **committed artifact**, so editing the table into a collision goes red immediately instead of surviving until Task 4's first real-content gate run. A prose-only table would be two unchecked hand transcriptions in a row (author → table → JSON) with nothing between them.

Steps:

- [ ] **Step 1: Write the failing check** — before any prose, encode the Z6 resource-kind constraint as a runnable check in the scratchpad so the table is validated as it is written, not after ten JSON files exist. **The script has three modes and no ellipsis: `--naive` runs the built-in naive derivation (must go RED), `--corrected` runs the built-in corrected derivation (must go GREEN), and the default mode parses the ten pairs out of the COMMITTED artifact** so that once Step 3 lands, this check is a real test of a real deliverable rather than of a literal the author typed to please it.

**Bind the script's path ONCE, here, and use `"$Z6"` in every invocation below.** `node <scratchpad>/z6-check.mjs` is not a runnable command — `<` is a shell input redirect, so the shell tries to feed the script to `node` on stdin instead of executing it. Export the real path first (substitute this session's scratchpad directory for `<scratchpad>`; it is printed in the session's own environment notes):

```bash
export Z6="<scratchpad>/z6-check.mjs"   # e.g. /private/tmp/claude-502/<project>/<session>/scratchpad/z6-check.mjs
ls -l "$Z6"                              # must exist before any run below
```

`export` survives only within one shell session. Every later step that runs `node "$Z6"` — Task 2 Steps 2, 4 and 7, Task 3a Step 7, Task 3b Steps 5 and 8 — re-states the export line for that reason; if `$Z6` is empty, `node ""` fails immediately rather than silently doing nothing.

```js
// z6-check.mjs — throwaway, lives in this session's scratchpad, never committed.
import { readFileSync } from "node:fs";

const ARTIFACT = "docs/worldbuilding/A2-zones-cluster1.md";
const KINDS = ["crop","timber","ore","fuel","stone","water","forage","salvage"];

// The NAIVE derivation: what the canon-derived table yields before any fix, kept
// here in full so the red half of this red-green step is reproducible byte for
// byte. millcross-ford still carries A1 §6's scavenged cart-boards as `salvage`;
// gildmark-head, ashvale-front and cindervast all read "worked material somebody
// else left" as {salvage, stone}. That three-way tie is the collision.
const NAIVE = {
  "meltwash-terrace":  ["forage", "water"],
  "millcross-ford":    ["crop", "stone", "salvage"],
  "rooktide-reach":    ["salvage", "forage"],
  "thornveil":         ["water", "timber"],
  "emberdown":         ["fuel", "crop"],
  "gildmark-head":     ["salvage", "stone"],
  "hollowmarch":       ["timber", "ore"],
  "ashvale-front":     ["salvage", "stone"],
  "northern-icefield": ["water", "stone"],
  "cindervast":        ["salvage", "stone"],
};

// The CORRECTED derivation: three citation-backed edits, listed under Step 2.
const CORRECTED = {
  "meltwash-terrace":  ["forage", "water"],
  "millcross-ford":    ["crop", "stone"],
  "rooktide-reach":    ["salvage", "forage"],
  "thornveil":         ["water", "timber"],
  "emberdown":         ["fuel", "crop"],
  "gildmark-head":     ["salvage", "stone"],
  "hollowmarch":       ["timber", "ore"],
  "ashvale-front":     ["salvage", "crop"],
  "northern-icefield": ["water", "stone"],
  "cindervast":        ["salvage", "fuel"],
};

// Default mode: read the ten pairs out of the FIRST ```json fence in the
// committed artifact (its §2.1 block). This is the only mode that can catch the
// artifact drifting away from the sets the author validated.
function fromArtifact() {
  const md = readFileSync(ARTIFACT, "utf8");
  const m = md.match(/```json\n([\s\S]*?)```/);
  if (!m) { console.log(`NO §2.1 FENCE in ${ARTIFACT}`); process.exit(1); }
  return JSON.parse(m[1]);
}

const mode = process.argv[2] ?? "--artifact";
const SETS = mode === "--naive" ? NAIVE
  : mode === "--corrected" ? CORRECTED
  : fromArtifact();

const seen = new Map();
let bad = 0;
const zones = Object.entries(SETS);
if (zones.length !== 10) { console.log(`EXPECTED 10 zones, got ${zones.length}`); bad++; }
for (const [zone, kinds] of zones) {
  for (const k of kinds) if (!KINDS.includes(k)) { console.log(`BAD KIND ${zone}: ${k}`); bad++; }
  const key = [...new Set(kinds)].sort().join(",");
  // Do NOT overwrite on collision: the first zone to claim a key stays named in
  // every later message, so a three-way tie prints two stable, quotable lines.
  if (seen.has(key)) { console.log(`Z6 FAIL: ${seen.get(key)} and ${zone} share [${key}]`); bad++; }
  else seen.set(key, zone);
}
console.log(bad === 0 ? `Z6 OK: ten distinct kind sets (${mode})` : `Z6: ${bad} problems (${mode})`);
process.exit(bad ? 1 : 0);
```

- [ ] **Step 2: Run it red, then green** — the naive derivation first, so the reason for the three corrections is on the record, then the corrected one. (The default `--artifact` mode cannot run yet; the artifact does not exist until Step 3. It runs in Step 4.)
```bash
export Z6="<scratchpad>/z6-check.mjs"   # Step 1's binding; re-state it if the shell restarted
node "$Z6" --naive > /tmp/z6-naive.out 2>&1; echo "naive exit=$?"; cat /tmp/z6-naive.out
node "$Z6" --corrected > /tmp/z6-ok.out 2>&1; echo "corrected exit=$?"; cat /tmp/z6-ok.out
```
Expected on `--naive`, verbatim and in this order:
```
Z6 FAIL: gildmark-head and ashvale-front share [salvage,stone]
Z6 FAIL: gildmark-head and cindervast share [salvage,stone]
Z6: 2 problems (--naive)
```
with `naive exit=1`. Expected on `--corrected`: `Z6 OK: ten distinct kind sets (--corrected)` and `corrected exit=0`.

> **The three corrections, each citation-backed** (the `--naive` run above is what puts the reason on the record):
> - **millcross-ford** drops `salvage` → `{crop, stone}`. A1 §6's scavenged cart-boards describe *how the town is built*, not what its ground yields; C2 asks what a person carries **out**. This drops the pressure on `salvage` from four zones to three.
> - **ashvale-front** takes `crop` instead of `stone` → `{salvage, crop}`. `canon.md` §4: *"Embervale farms the Ashvale loam."* A1 §4.3 independently calls the southern lip *"settled, marked, grassed over."* **This collides with A1 §1/§3.1's alkali-flat reading and MUST be named in §13, not smoothed.** Fallback if the Archivist rejects it: `{salvage, forage}` **and** move rooktide off `forage` — do not leave both.
> - **cindervast** takes `fuel` instead of `stone` → `{salvage, fuel}`. `mob-cinderfall-giant`: *"the outer districts where the fires still find fuel."* Flagged `[D]`, two-step. Alternative if the Archivist prefers no derivation: keep `stone` and **add** `fuel` as a third — a 3-set is not identical to gildmark's 2-set, so Z6 passes by superset rather than by substitution.

- [ ] **Step 3: Write the artifact.** Header block copying `A2-ecology-thornveil.md`'s shape (Level L2 · Role Naturalist per roles-charter §2.2 · Political Economist's G3 veto named · Parents · Measured-from list). Then the sections, in this order — **all nine SWF §3 parts are mandatory; the artifact is rejected if any is missing**:

  `§0 Scope` (callout info: alternates are prose-only per D1; `atlas-frontier.md` untouched) · `§1 Provenance` · **`§2 The ten grounds` — the derivation table, written out below** · **`§2.1` — the machine-readable kind-set fence** · `§3 Claims C1–C5` (lift design §3 verbatim; **do not mint C6+**) · `§4 Causal links` (design §4 table) · `§5 Consequences, two per claim` (design §5) · `§6 The hazard vocabulary and its runtime binding` (the 7-value enum, `effect` optional, the absence-hazard class; cite `atlas-frontier.md`'s live `region-icefield` `freeze`/`stun` entries as the existence proof that `effect` is not aspirational) · `§7 The eight resource kinds → the A1 §6 town economy each maps to` (this is the G3 answer: every kind names who profits and who pays) · `§8 Distinctiveness` (the three river-country and two rim sets side by side, argued from town economies; plus the `{salvage, stone}` three-way collision and its fix) · `§9 Alternates, on paper only` (A1 §4.4's three sites + band + fork zone + design §9's Mermaid block) · `§10 Costs and limits` (see the §10 rule below) · `§11 Known-wrong` · `§12 What this does not change` · `§13 Contradiction rule + the live collisions` · `§14 Open questions` (design §16) · `§15 Citation register` (shape specified below).

  **The nine SWF §3 parts mapped onto these sixteen sections — this is the mapping Step 6's reviewer executes.** Sixteen sections are listed, nine of them are the mandatory SWF parts, and the other seven are this artifact's own additions. Without this mapping "all nine parts present" is not a checkable claim:

  | SWF §3 part | this artifact's section |
  | --- | --- |
  | 1 · Provenance | `§1 Provenance` |
  | 2 · Claims | `§3 Claims C1–C5` |
  | 3 · Causal links | `§4 Causal links` |
  | 4 · Consequences | `§5 Consequences, two per claim` |
  | 5 · Costs and limits | `§10 Costs and limits` |
  | 6 · Known-wrong | `§11 Known-wrong` |
  | 7 · What this does not change | `§12 What this does not change` |
  | 8 · Contradiction rule | `§13 Contradiction rule + the live collisions` |
  | 9 · Citation register | `§15 Citation register` |

  **This artifact's own additions, which SWF does not require and a reviewer must not report as surplus:** `§0 Scope`, `§2 The ten grounds`, `§2.1` the kind-set fence, `§6 The hazard vocabulary`, `§7 The eight resource kinds`, `§8 Distinctiveness`, `§9 Alternates`, `§14 Open questions`.

  **§15's shape is specified, not left to taste**, because Task 3a Step 6 and Task 3b Step 7 both check specific rows against it. One row per `[C]`/`[D]`/`[N]` marker in the §2 table — **20 landmark rows, 20 resource rows, 23 hazard rows and 10 `reasonToGo` rows (73 rows)** — with columns `claim | marker | cited file + section | the derivation step, if [D]`. Three rows are named by the downstream reviews and must be findable by id:
  - `spear-cane` — **[D]**, derivation step: `style.md` §4 gives `faction-thornveil` a throwing-spear harness; canon never says the raiders cut cane for the shafts.
  - `district-fuel` — **[D], two steps**, from `mob-cinderfall-giant`'s "the outer districts where the fires still find fuel".
  - `the-southern-lip-loam` — **[C]** on `canon.md` §4's literal "Embervale farms the Ashvale loam", with a cross-reference to §13 case 2 in the derivation column, because the citation is real *and* collides.

  **§10's Z5 blind spot must be named by enumeration, not by memory.** The zones that reach content-complete with **zero** mapped hazards are whichever ones `content/zones/` actually leaves at zero after Task 3b — derive them, do not copy a pair out of this plan. On the §2 table as written below that set is exactly **`millcross-ford` and `gildmark-head`**, and `ashvale-front` is *not* in it only because it carries a third hazard (`the-alkali-dust` → `burn`) on top of its two absences. If a reviewer removes that third hazard, `ashvale-front` joins the set and §10 must say so. Re-run the enumeration command in Task 3b Step 5 after any hazard edit and write down what it prints:
```bash
node -e 'const fs=require("fs");for(const f of fs.readdirSync("content/zones").sort()){const d=JSON.parse(fs.readFileSync("content/zones/"+f));const m=d.hazards.filter(h=>h.effect!==undefined).length;if(m===0)console.log(`zero mapped: ${d.zone}`);}'
```

  **§2 — The ten grounds.** Write this table into the artifact verbatim. It is the authoring input Tasks 3a/3b transcribe. **What it binds:** every zone id, `reasonToGo`, hazard id, hazard `effect`, resource id, resource `kind`, landmark id, landmark `name` and landmark `source` in the ten records is a cell here, written in the **exact form the record carries** — a landmark `source` cell reads `docs/worldbuilding/A1-geography-cluster1.md#4.2`, not `A1 §4.2`, so `grep -F` of a record's value hits the table. **What it does not bind:** hazard `name`, hazard `description`, hazard `note`, resource `name`, resource `description` and landmark `description` have no cells here at all; that prose is authored in Tasks 3a/3b against `style.md` and is reviewed for voice. The last column's `[C]`/`[D]`/`[N]` citations are *provenance shorthand for this artifact's own argument* (`A1 §4.2 zone 1`) and are deliberately not record strings. Legend: **[C]** transcribed from canon · **[D]** derived one step from canon (the step is named) · **[N]** needs invention. Hazard `→ effect` maps to one of the seven runtime `zoneHazards` types; **`none`** is an absence-hazard (design C3) which Z5 WARNs by design and which carries an authoring `note` saying why no enum value fits.

  | zone | reasonToGo | hazards (id → effect) | resources (id, kind) | landmarks (id, name, source) | citation |
  | --- | --- | --- | --- | --- | --- |
  | `meltwash-terrace` | The last drained ground before the crossing: grass for the stock, gravel underfoot, and a camp that is still standing when the water goes down. | `meltwater-cold` → `freeze`<br>`the-thaw-rise` → none | `cropped-grass`, `forage`<br>`the-braided-heads`, `water` | `the-expedition-camp`, "The expedition camp", `content/maps/cluster1-geography.json#camps[expedition-camp]`<br>`the-gravel-bars`, "The gravel bars", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] throughout (A1 §4.2 zone 1, A1 §3.1); the `freeze` mapping is [D] |
  | `millcross-ford` | One crossing serves the whole land, and everything waiting on it has to be fed, stabled and ferried here. | `high-water-at-the-ford` → none<br>`the-millrace` → none | `race-milled-grain`, `crop`<br>`the-quarry-face`, `stone` | `the-cart-queue`, "The cart queue", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-mill-wheel-housing`, "The mill-wheel housing", `docs/worldbuilding/A1-geography-cluster1.md#6` | [C] (A1 §6; `mob-chaff-crawler`, `mob-quarrystone-beetle`, `mob-millrace-lurker`). **Zero mapped hazards — §10's named case.** Mill collision → §13 |
  | `rooktide-reach` | Everything moving between sea and river changes hulls here, and whatever goes over the side in the change stays on the flats. | `the-turning-tide` → none<br>`the-low-water-mud` → `stun` | `old-plank`, `salvage`<br>`cut-reed`, `forage` | `the-barge-cranes`, "The barge-cranes", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-rook-flats`, "The rook flats", `docs/worldbuilding/A1-geography-cluster1.md#6` | [C] (A1 §3.1, A1 §6, `mob-thatch-mite`, `mob-tideflat-nipper`); reed→`forage` is [D] (the enum has no reed); the `stun` mapping is [D] |
  | `thornveil` | The one ground no road overlooks, which is why the people who do not want to be overlooked are in it. | `the-thorn-wall` → `damage`<br>`no-through-stream` → none | `cane-sap`, `water`<br>`spear-cane`, `timber` | `the-heartwood`, "The heartwood", `docs/worldbuilding/A2-ecology-thornveil.md#6.2`<br>`the-crown-thickets`, "The crown thickets", `docs/worldbuilding/A2-ecology-thornveil.md#6.3` | [C] except `spear-cane`: **[D], the weakest cell in the table** — `style.md` §4 gives `faction-thornveil` a throwing-spear harness, canon never says they cut cane for the shafts. §15 must carry it as [D], not as a transcribed fact |
  | `emberdown` | The only hillside in the land where the fuel and the food come out of the same ground. | `seam-damp` → `poison`<br>`the-ember-pits` → `burn` | `burning-stone`, `fuel`<br>`ledge-loam`, `crop` | `the-terraced-ledges`, "The terraced ledges", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-adits`, "The adits", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] (A1 §4.2 zone 5, A1 §6, `canon.md` §4, `mob-slagheap-grub`, `mob-emberpit-digger`); bad air in a worked adit is [D] |
  | `gildmark-head` | The only door the sea has, with half a day of mudflat in front of it holding everything that missed the door. | `the-moving-sandbars` → none<br>`the-salt` → none | `beached-cargo`, `salvage`<br>`dressed-headland-stone`, `stone` | `the-mirror-tower`, "The mirror tower", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-mires-bar`, "The mire's bar", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] (A1 §3.1 Saltmire, A1 §6, A1 §7.1, `mob-bound-war-beast`); `dressed-headland-stone` is [D] — canon names no quarry. **Zero mapped hazards — §10's second named case.** **Name it "The mire's bar", never "the bar"** |
  | `hollowmarch` | Where the timber and the ore both start, behind the only wall in the land that was never taken down. | `the-open-moor` → none<br>`the-outer-fields` → `poison`<br>`hollow-stakes` → none | `the-timber-line`, `timber`<br>`the-ore-heads`, `ore` | `the-tally-boards`, "The tally boards", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-palisade-line`, "The palisade line", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] (A1 §3.3, A1 §4.2 zone 7, A1 §6, `canon.md` §4, `mob-hollowmoor-giant`, `mob-graveturf-creeper`, `mob-palisade-borer`); the `poison` mapping is [D] |
  | `ashvale-front` | The only ground both towns reach in a day and neither can hold, which is why four seasons of what either army carried is still lying on it. | `no-water-on-it` → none<br>`no-cover-for-a-days-crossing` → none<br>`the-alkali-dust` → `burn` | `abandoned-arms`, `salvage`<br>`the-southern-lip-loam`, `crop` | `the-grave-rows`, "The grave rows", `docs/worldbuilding/A1-geography-cluster1.md#4.3`<br>`the-abandoned-cut-lines`, "The abandoned cut lines", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] (A1 §3.2 item 3, A1 §4.2 zone 8, A1 §4.3, `mob-warscar-titan`, `mob-trench-gnawer`); the `burn` mapping is [D]; **`crop` rests on `canon.md` §4's literal "Embervale farms the Ashvale loam" and COLLIDES with A1 §1/§3.1 — §13 case 2** |
  | `northern-icefield` | Every river in the land starts under this shelf, and the company at the gate on its lip has been standing there since the city behind it fell. | `the-cold` → `freeze`<br>`the-white-weather` → `stun`<br>`the-crevasses` → none | `the-meltwater-heads`, `water`<br>`the-gravel-head`, `stone` | `the-oath-gate`, "The oath-gate", `docs/worldbuilding/A1-geography-cluster1.md#4.2`<br>`the-crevasse-shelf`, "The crevasse shelf", `docs/worldbuilding/A1-geography-cluster1.md#4.2` | [C] throughout. **The two mapped hazards are not derived — they are already live** in `content/maps/atlas-frontier.md`'s `zoneHazards` for `region-icefield` (`freeze` ×2, `stun` with `castTime: 400`). Cite that, do not re-derive |
  | `cindervast` | A city the weapon took without knocking it down: intact mortar, no rubble in the streets, and what the people in it were carrying still where they dropped it. | `the-afterglow` → `poison`<br>`a-city-with-nobody-in-it` → none | `relic-scrap`, `salvage`<br>`district-fuel`, `fuel` | `the-giving-king-statues`, "The Giving King statues", `docs/worldbuilding/A1-geography-cluster1.md#6`<br>`the-dead-gate`, "The dead gate", `content/maps/cluster1-geography.json#towns[cindervast].wallsOnly.gateAt` | [C] (A1 §4.2 zone 10, A1 §6, `mob-soot-wrapped-scavenger`, `mob-relicglow-moth`, `mob-relicslag-crawler`); `district-fuel` is [D], two steps from `mob-cinderfall-giant`; the `poison` mapping is [D]. **Name it "The dead gate", never "the gate"** |

  **What the table adds up to** — state this in §6 and re-derive it from `content/zones/` in Task 3b Step 5 rather than trusting it: **23 hazards, of which 10 carry a runtime `effect` and 13 do not**; 20 resources across ten pairwise-distinct kind sets; 20 landmark names, all distinct. Two landmark near-misses are deliberate and must be held: *"The gravel bars"* (zone 1) vs *"The mire's bar"* (zone 6), and *"The oath-gate"* (zone 9) vs *"The dead gate"* (zone 10).

  **§2.1 — resource-kind sets, machine-readable.** Write this as the **first ` ```json ` fenced block in the artifact**, immediately under the §2 table. `z6-check.mjs` in its default mode parses exactly this fence, so the table and the check can never silently disagree:

```json
{
  "meltwash-terrace":  ["forage", "water"],
  "millcross-ford":    ["crop", "stone"],
  "rooktide-reach":    ["salvage", "forage"],
  "thornveil":         ["water", "timber"],
  "emberdown":         ["fuel", "crop"],
  "gildmark-head":     ["salvage", "stone"],
  "hollowmarch":       ["timber", "ore"],
  "ashvale-front":     ["salvage", "crop"],
  "northern-icefield": ["water", "stone"],
  "cindervast":        ["salvage", "fuel"]
}
```

  **Three live collisions must be named in §13, not smoothed:**
  1. **D1** — I-060's title vs `A1` §4.4, resolved in A1's favour.
  2. **The Ashvale loam.** `canon.md` §4 *"Embervale farms the Ashvale loam"* puts farmable loam on the Front; A1 §1/§3.1 read the same loam as the west rim's and call the flat alkali with no catchment. Load-bearing here because the Z6 fix gives `ashvale-front` the kind `crop` on canon's literal sentence. Archivist holds the veto.
  3. **Millcross's mill.** `mob-millstone-warden` says *"When the mill burned…"*; A1 §6 describes the mill-wheel housing in the present tense. Either two mills or one rebuilt — Millcross's landmark record depends on which.

  **Cite `canon.md` by SECTION HEADING, never by line number** (recurring citation-drift lesson; this repo has been bitten three times).

- [ ] **Step 4: Verify — run the gate checks by hand and paste the output**
```bash
# G4 — the style.md banned-word list. Handoff/meta scope may say "boss"
# (A2-ecology-thornveil.md does, twice); WORLD PROSE may not.
grep -nEi '\b(okay|guys|tech|percent|boss)\b' docs/worldbuilding/A2-zones-cluster1.md
# G7 — read every hit and confirm each proper noun already exists in the corpus.
grep -nEo '\b[A-Z][a-z]+\b' docs/worldbuilding/A2-zones-cluster1.md | sort -u | head -60
# The two landmark near-misses Z6 will police in Task 4:
grep -n 'the mire.s bar\|gravel bars\|oath-gate\|dead gate' docs/worldbuilding/A2-zones-cluster1.md
# Z6 against the COMMITTED artifact — default mode parses §2.1's fence out of the
# real file, so this is a test of the deliverable, not of a scratchpad literal.
export Z6="<scratchpad>/z6-check.mjs"   # Step 1's binding; re-state it if the shell restarted
node "$Z6" > /tmp/z6-artifact.out 2>&1; echo "exit=$?"; cat /tmp/z6-artifact.out
# The §2 table must carry a row for every zone — the transcription contract
# Tasks 3a/3b depend on. Zero output before "row check done" means all ten landed.
for z in meltwash-terrace millcross-ford rooktide-reach thornveil emberdown \
         gildmark-head hollowmarch ashvale-front northern-icefield cindervast; do
  grep -qF "\`$z\`" docs/worldbuilding/A2-zones-cluster1.md || echo "MISSING ROW: $z"
done; echo "row check done"
# The commit boundary must be SHOWN green, not reasoned green (Global Constraints:
# "Run `node scripts/check_content.mjs` by hand at every task's verify step").
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
node scripts/check_content.mjs; echo "exit=$?"
```
Expected for those last two: **unchanged from Task 1 Step 4 / Step 5** — `exit=0`, `ℹ fail 0`, `ℹ pass` the same 204 Task 1 Step 4 recorded, and `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings` with `exit=0`. This task writes only under `docs/worldbuilding/`, which neither the suite nor the gate (whose `contentRoot` is `content/`) reads — but that is the *reason to expect* green, not the evidence for it, and these two commands are what turn the one into the other. Any movement here is a regression from something else, not from this task.

Expected for the greps: the banned-word grep returns **either nothing, or only lines inside §14's handoff prose**; every capitalised token traceable to A1 / `canon.md` / `bestiary.json` / `style.md`; the landmark grep shows **"the mire's bar"** (not "the bar") and **"the dead gate"** (not "the gate"); `z6-check` prints `Z6 OK: ten distinct kind sets (--artifact)` with `exit=0` — **if it instead prints `NO §2.1 FENCE`, the artifact was written without the machine-readable block and Task 2 is not done**; the §2 table has ten data rows.

- [ ] **Step 5: Commit**
```bash
git add docs/worldbuilding/A2-zones-cluster1.md
git commit -m "docs(worldbuilding): A2 zones of cluster 1 — the ten grounds (I-060)"
```

- [ ] **Step 6: Independent adversarial review of this task's diff.** Fresh subagent, briefed as the **Archivist + Cliché Auditor + Namer**. It must check: all nine SWF §3 parts present **using Step 3's nine-onto-sixteen mapping table** (walk the mapping row by row; the seven listed additions are not surplus); **§15 carries all 73 rows in the specified four columns, including the three named rows `spear-cane` [D], `district-fuel` [D] two-step, and `the-southern-lip-loam` [C] with its §13 cross-reference**; G1 swap test; G5 — every `[C]` quote actually appears in the cited file (verify by grep, do not take the citation on trust); G7 — zero real-world proper nouns; the three collisions named rather than smoothed; the Thornveil section not contradicting `A2-ecology-thornveil.md`'s four tiers or `[15,28]` band; `thornveil`'s "spear cane" flagged `[D]`/`[N]` rather than promoted to a transcribed fact.

- [ ] **Step 7: Refactor on the findings** — if any resource kind changed, edit **§2.1's fence and the §2 table together** and re-run `node "$Z6"` in its default (artifact) mode (`export Z6="<scratchpad>/z6-check.mjs"` first if the shell restarted); a kind changed in the table but not the fence is exactly the drift this check exists to catch. If any hazard, resource or landmark **id** changed, it must change in §2's table before Tasks 3a/3b transcribe it — the records are downstream of this table, never the other way round.

- [ ] **Step 8: Re-verify** — re-run every command in Step 4 and paste real output. New commit.

---

## Task 3a: The first five zone records

> **Naming note for the rest of this plan.** Tasks 3a and 3b together are what every later section calls **"Task 3"**. Wherever Task 4, Task 5 or the Verification section says "the ten records from Task 3", it means the state of the tree after **3b**.

**Files:**
- Create: `content/zones/zone-meltwash-terrace.json`, `zone-millcross-ford.json`, `zone-rooktide-reach.json`, `zone-thornveil.json`, `zone-emberdown.json`
- **No test file is touched in this task.** `scripts/tests/zone-content.test.mjs` is unchanged, so `npm test` and `check_content.mjs` are both bit-for-bit unchanged from Task 1's green state.

**Interfaces:**
- **Consumes:** `content/schemas/zone-content.schema.json` (Task 1) for shape; `docs/worldbuilding/A2-zones-cluster1.md` §2 (Task 2) as the authoring input, cell by cell; `content/maps/cluster1-geography.json#zones` for the ids.
- **Produces:** five records at `content/zones/zone-<id>.json`, each already Z1–Z7-clean, verified by a throwaway validator rather than by the suite (the suite's committed-content tests assert all ten and therefore only land in 3b).

**Why Task 3 is split in two, and why the split is safe.** The invariant the sequencing rests on is **"all ten records exist before Task 4 lands"** — *not* "all ten records land in one commit". Those are different claims, and only the first one is true. Nothing reads `content/zones/` until 3b's tests and Task 4's `checkZoneContent()`: `check_content.mjs` has no zone checker yet, so the directory is simply not looked at, and no test file mentions it. Any number of commits inside Task 3 is therefore gate-green and suite-green. **The earlier draft's justification for one mega-commit — "a partial `content/zones/` would leave Task 4's very first run red" — is false as stated**; it is only true of a split that *crosses* Task 4, which this one does not. Splitting matters because the defects these files can carry (kebab-case ids, landmark-name collisions, kind-set collisions, voice) are all prose-level and only findable by reading, and one reviewer given ten hand-authored world-content files plus a README edit plus four tests in a single sitting will not find them — which is the exact un-reviewable diff this plan says elsewhere it is avoiding.

Steps:

- [ ] **Step 1: Write the five records.** Transcribe from the artifact's §2 table, one cell at a time. Every string obeys `style.md`: Ashen Vigil register, short sentences, plain concrete nouns, one-read rule, **no word from the ban list** (`okay, guys, tech, percent, boss`), counts not percentages ("one crate in five"). Every absence hazard (no `effect`) carries a `note` saying why no runtime type fits — that note is authoring-only and never player-facing.

`content/zones/zone-meltwash-terrace.json`:

```json
{
  "zone": "meltwash-terrace",
  "reasonToGo": "The last drained ground before the crossing: grass for the stock, gravel underfoot, and a camp that is still standing when the water goes down.",
  "hazards": [
    {
      "id": "meltwater-cold",
      "name": "Meltwater cold",
      "description": "Water off the shelf, milk-grey with rock flour. It takes the use out of a man's hands in the time it takes to wade one braid.",
      "effect": "freeze"
    },
    {
      "id": "the-thaw-rise",
      "name": "The thaw rise",
      "description": "The braids run hard in thaw and near-dry in deep cold. Ground that carried a cart last week carries nothing this week.",
      "note": "Absence hazard: a river coming up displaces people, it does not tick on them. No runtime zoneHazards type fits."
    }
  ],
  "resources": [
    {
      "id": "cropped-grass",
      "name": "Cropped grass",
      "kind": "forage",
      "description": "Short turf between the braids, kept down by the stock that waits here for the crossing."
    },
    {
      "id": "the-braided-heads",
      "name": "The braided heads",
      "kind": "water",
      "description": "Gravel-bedded channels, fordable on foot in a dozen places, and the cleanest water on the road."
    }
  ],
  "landmarks": [
    {
      "id": "the-expedition-camp",
      "name": "The expedition camp",
      "description": "Tents, picket lines and a stove that is never let out, set back from the highest braid.",
      "source": "content/maps/cluster1-geography.json#camps[expedition-camp]"
    },
    {
      "id": "the-gravel-bars",
      "name": "The gravel bars",
      "description": "Pale banks of washed stone standing out of the water, with willow scrub taking hold along their spines.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

`content/zones/zone-millcross-ford.json`:

```json
{
  "zone": "millcross-ford",
  "reasonToGo": "One crossing serves the whole land, and everything waiting on it has to be fed, stabled and ferried here.",
  "hazards": [
    {
      "id": "high-water-at-the-ford",
      "name": "High water at the ford",
      "description": "In thaw the ford goes under and the carts stop where they stand. Nothing crosses until the ferrymen say it crosses.",
      "note": "Absence hazard: ground that cannot be crossed is a wall, not a tick. No runtime zoneHazards type fits."
    },
    {
      "id": "the-millrace",
      "name": "The millrace",
      "description": "A cut channel running fast and flat under the wheel housing. The current hides the shape of whatever is standing in it.",
      "note": "Absence hazard: a current is not in the seven-value enum, and `damage` would read as a burn or a bite."
    }
  ],
  "resources": [
    {
      "id": "race-milled-grain",
      "name": "Race-milled grain",
      "kind": "crop",
      "description": "Grain brought in by cart and ground at the race. The dust of it settles on every yard behind the mill."
    },
    {
      "id": "the-quarry-face",
      "name": "The quarry face",
      "kind": "stone",
      "description": "Cut stone off the face west of the town, worked in lifts by crews who down tools when the beetles come up."
    }
  ],
  "landmarks": [
    {
      "id": "the-cart-queue",
      "name": "The cart queue",
      "description": "The first thing on the road: waggons standing nose to tail, sometimes a mile out from the town.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-mill-wheel-housing",
      "name": "The mill-wheel housing",
      "description": "The one tall thing in the town, timber and iron over the race, and the only roof visible from the far bank.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    }
  ]
}
```

`content/zones/zone-rooktide-reach.json`:

```json
{
  "zone": "rooktide-reach",
  "reasonToGo": "Everything moving between sea and river changes hulls here, and whatever goes over the side in the change stays on the flats.",
  "hazards": [
    {
      "id": "the-turning-tide",
      "name": "The turning tide",
      "description": "The sea pushes up as far as the landing twice a day and pulls back out. A boat left on the wrong side of it sits until evening.",
      "note": "Absence hazard: a tide moves the ground, it does not apply an effect to a body. No runtime zoneHazards type fits."
    },
    {
      "id": "the-low-water-mud",
      "name": "The low-water mud",
      "description": "Grey mud a foot deep where the boats sit at low water. It takes a boot first and then the leg, and holds a man where he stands.",
      "effect": "stun"
    }
  ],
  "resources": [
    {
      "id": "old-plank",
      "name": "Old plank",
      "kind": "salvage",
      "description": "Hull boards, cleats and sound timber pulled off the barges in the hull change and sewn into new building."
    },
    {
      "id": "cut-reed",
      "name": "Cut reed",
      "kind": "forage",
      "description": "Reed cut off the brackish fringe at low water, bundled for thatch and for winter bedding."
    }
  ],
  "landmarks": [
    {
      "id": "the-barge-cranes",
      "name": "The barge-cranes",
      "description": "Timber jibs standing over the pilings, one to each berth, with the hull-change gear stacked beneath them.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-rook-flats",
      "name": "The rook flats",
      "description": "Open mud south of the landing, black with rooks working it at every low water.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    }
  ]
}
```

`content/zones/zone-thornveil.json` — **must not contradict `A2-ecology-thornveil.md`**, which already fixed the heartwood, the crown thickets, the four-tier depth model and the `[15, 28]` band under gate rule G8:

```json
{
  "zone": "thornveil",
  "reasonToGo": "The one ground no road overlooks, which is why the people who do not want to be overlooked are in it.",
  "hazards": [
    {
      "id": "the-thorn-wall",
      "name": "The thorn wall",
      "description": "Mature bramble, continuous and taller than a man, closing every sightline. Going through it costs skin and going round it costs a day.",
      "effect": "damage"
    },
    {
      "id": "no-through-stream",
      "name": "No through-stream",
      "description": "The upland sheds its water to either side and keeps none of it. A party that carries none finds none.",
      "note": "Absence hazard: the harm is what is missing. Nothing in the runtime enum expresses an absence."
    }
  ],
  "resources": [
    {
      "id": "cane-sap",
      "name": "Cane sap",
      "kind": "water",
      "description": "Sap drawn from cut cane, the only reliable water in the veil and the reason a camp can hold ground with no stream."
    },
    {
      "id": "spear-cane",
      "name": "Spear cane",
      "kind": "timber",
      "description": "Straight cane, cut green and dried standing, worked into shafts for the throwing spears the raiders carry."
    }
  ],
  "landmarks": [
    {
      "id": "the-heartwood",
      "name": "The heartwood",
      "description": "A single old tree at the centre of the veil, with the bramble running out from it in every direction.",
      "source": "docs/worldbuilding/A2-ecology-thornveil.md#6.2"
    },
    {
      "id": "the-crown-thickets",
      "name": "The crown thickets",
      "description": "The high cane above the heartwood, dense enough to stand on and thin enough to see out of.",
      "source": "docs/worldbuilding/A2-ecology-thornveil.md#6.3"
    }
  ]
}
```

  **`spear-cane` is the weakest cell in the whole table and must stay flagged.** `style.md` §4 gives `faction-thornveil` a throwing-spear harness; canon never says the raiders cut cane for the shafts. It ships as a one-step derivation with its `[D]` marker recorded in the artifact's §2 table and §15 citation register. Do **not** quietly promote it to a transcribed fact — F-033's finding was that four of six defects came from added detail.

`content/zones/zone-emberdown.json`:

```json
{
  "zone": "emberdown",
  "reasonToGo": "The only hillside in the land where the fuel and the food come out of the same ground.",
  "hazards": [
    {
      "id": "seam-damp",
      "name": "Seam damp",
      "description": "Air that has sat in a worked adit overnight. It puts a man on the floor before he knows he is short of breath.",
      "effect": "poison"
    },
    {
      "id": "the-ember-pits",
      "name": "The ember pits",
      "description": "Waste poured off from the forges and left to cool on open ground. It holds its heat for days.",
      "effect": "burn"
    }
  ],
  "resources": [
    {
      "id": "burning-stone",
      "name": "Burning stone",
      "kind": "fuel",
      "description": "Seam coal cut by hand out of the adits and carried down the ledges in baskets."
    },
    {
      "id": "ledge-loam",
      "name": "Ledge loam",
      "kind": "crop",
      "description": "Terrace soil, warm from the seam beneath it and shallow enough to turn with a hand fork."
    }
  ],
  "landmarks": [
    {
      "id": "the-terraced-ledges",
      "name": "The terraced ledges",
      "description": "Six or seven cut steps of field and roof stacked above the town, a stair of slate seen from the road.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-adits",
      "name": "The adits",
      "description": "Square black mouths opening straight into the hillside between one ledge and the next.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

- [ ] **Step 2: Verify the five records with a throwaway validator** — no test file changes, so the evidence has to come from a one-off run. This checks exactly what Task 4's Z3, Z4 and Z7 will later check, on the five files that exist now.
```bash
(cd scripts && node -e '
const Ajv = require("ajv"), fs = require("fs");
const AjvClass = Ajv.default ?? Ajv;
const validate = new AjvClass({ allErrors: true }).compile(
  JSON.parse(fs.readFileSync("../content/schemas/zone-content.schema.json", "utf8")));
const ids = ["meltwash-terrace","millcross-ford","rooktide-reach","thornveil","emberdown"];
const KINDS = ["crop","timber","ore","fuel","stone","water","forage","salvage"];
const EFFECTS = ["freeze","stun","burn","poison","regen","heal","damage"];
const RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
let bad = 0;
for (const id of ids) {
  const d = JSON.parse(fs.readFileSync(`../content/zones/zone-${id}.json`, "utf8"));
  if (!validate(d)) { console.log(`SCHEMA ${id}: ${JSON.stringify(validate.errors)}`); bad++; }
  if (d.zone !== id) { console.log(`ZONE FIELD ${id}: got "${d.zone}"`); bad++; }
  if (d.reasonToGo.trim() === "") { console.log(`EMPTY reasonToGo ${id}`); bad++; }
  for (const f of ["hazards","resources","landmarks"]) {
    if (d[f].length < 2) { console.log(`FLOOR ${id}.${f} = ${d[f].length}`); bad++; }
    const seen = new Set();
    for (const it of d[f]) {
      if (!RE.test(it.id)) { console.log(`KEBAB ${id}.${f}: "${it.id}"`); bad++; }
      if (seen.has(it.id)) { console.log(`DUP ${id}.${f}: "${it.id}"`); bad++; }
      seen.add(it.id);
    }
  }
  for (const r of d.resources)
    if (!KINDS.includes(r.kind)) { console.log(`KIND ${id}: "${r.kind}"`); bad++; }
  for (const h of d.hazards)
    if (h.effect !== undefined && !EFFECTS.includes(h.effect)) { console.log(`EFFECT ${id}: "${h.effect}"`); bad++; }
}
console.log(bad ? `${bad} problems` : "5 records clean");
process.exit(bad ? 1 : 0);
') > /tmp/z3a.out 2>&1; echo "exit=$?"; cat /tmp/z3a.out
```
Expected: `exit=0` and the single line `5 records clean`.

- [ ] **Step 3: Verify the voice and naming constraints by hand** (evidence, per rule 2)
```bash
# G4 — style.md's ban list. No hit is the pass case.
grep -rnEi '\b(okay|guys|tech|percent|boss)\b' content/zones/ > /tmp/ban.out 2>&1; echo "banned-word exit=$?"; cat /tmp/ban.out
# G7 — every capitalised token in the authored prose. SWF §4's G7 scope explicitly
# covers place and item names, i.e. these JSON files, not only the markdown.
grep -rhoE '\b[A-Z][a-z]+\b' content/zones/ | sort -u
```
Expected: the ban grep prints nothing with `banned-word exit=1` (grep found no match — that is the pass case). The G7 list must contain **zero real-world country, city, people, language or religion nouns**; in these five records every capitalised token is either sentence-initial or the first word of a hazard/resource/landmark `name`, and no in-corpus proper noun appears at all. Any token you cannot place in one of those two buckets must be cited to A1, `canon.md`, `bestiary.json` or `style.md` — or renamed before the commit.

- [ ] **Step 4: Prove nothing else moved** — this task must leave the suite and the gate byte-identical to Task 1's green state.
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
node scripts/check_content.mjs; echo "exit=$?"
```
Expected: `exit=0`, `ℹ fail 0`, and `ℹ pass` **exactly** the number Task 1 Step 4 recorded (204 if nothing else has landed) — no test file was touched, so any change here is a regression. `check_content.mjs` still prints `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings` with `exit=0`: the gate has no `checkZoneContent()` yet, so a half-populated `content/zones/` is invisible to it. That is the whole reason this split is safe.

- [ ] **Step 5: Commit**
```bash
git add content/zones
git commit -m "feat(content): zone records for the five river-country and rim zones (I-060)"
```

- [ ] **Step 6: Independent adversarial review of this task's diff.** Fresh subagent, briefed as **Archivist + Political Economist + Cliché Auditor**, scoped to five files. It must check: **every id, `kind`, `effect`, landmark `name` and landmark `source` in the record is `grep -F`-findable in the artifact's §2 table** (the table's landmark-source cells carry the full `docs/worldbuilding/…#4.2` form the records carry, so a literal grep hits) **and every `reasonToGo` matches its §2 cell verbatim** — those are the only fields the table binds; the prose fields (hazard `name`/`description`/`note`, resource `name`/`description`, landmark `description`) are **not** in the table and are reviewed for **voice against `style.md`**, not for table provenance. Also: no `reasonToGo` that says "adventure awaits" or "rich hunting grounds" — each must name a thing carried **out** (C2) or a thing only this ground has; every resource has a named taker and a named loser (G3); no banned word; `spear-cane` still carried as `[D]` in §2 and §15 and not upgraded to fact; `thornveil` not contradicting `A2-ecology-thornveil.md`'s tiers or its `[15, 28]` band; `the-gravel-bars` reading as gravel banks and not as anything else.

- [ ] **Step 7: Refactor on the findings** — apply every finding. If any id, name or kind changed, **change the artifact's §2 table and §2.1 fence in the same commit**, then re-run BOTH of these from the repo root:

```bash
export Z6="<scratchpad>/z6-check.mjs"   # Task 2 Step 1's binding; re-state it if the shell restarted
# (a) the artifact is still internally consistent — ten pairwise-distinct sets
node "$Z6" > /tmp/z6-artifact.out 2>&1; echo "z6 exit=$?"; cat /tmp/z6-artifact.out
# (b) the records that exist so far still match the artifact's §2.1 fence. This
# is the transcription the artifact-mode z6-check CANNOT see: it compares the
# fence to itself, never to content/zones/. Runs on whatever records exist —
# five now, ten after Task 3b.
node -e '
const fs=require("fs");
const md=fs.readFileSync("docs/worldbuilding/A2-zones-cluster1.md","utf8");
const fence=JSON.parse(md.match(/```json\n([\s\S]*?)```/)[1]);
let bad=0;
for(const f of fs.readdirSync("content/zones").filter(f=>/^zone-.+\.json$/.test(f)).sort()){
  const d=JSON.parse(fs.readFileSync("content/zones/"+f,"utf8"));
  const rec=[...new Set(d.resources.map(r=>r.kind))].sort().join(",");
  const art=[...new Set(fence[d.zone]??[])].sort().join(",");
  if(rec!==art){console.log(`KIND DRIFT ${d.zone}: record [${rec}] vs artifact [${art}]`);bad++;}
}
console.log(bad?`${bad} drifts`:"records match the artifact fence");
process.exit(bad?1:0);
' > /tmp/fence.out 2>&1; echo "fence exit=$?"; cat /tmp/fence.out
```

Expect `z6 exit=0` with `Z6 OK: ten distinct kind sets (--artifact)`, and `fence exit=0` with `records match the artifact fence`.

- [ ] **Step 8: Re-verify** — re-run Steps 2, 3 and 4 and paste the real output. New commit, never `--amend`.

---

## Task 3b: The remaining five zone records, and the committed-content tests

**Files:**
- Create: `content/zones/zone-gildmark-head.json`, `zone-hollowmarch.json`, `zone-ashvale-front.json`, `zone-northern-icefield.json`, `zone-cindervast.json`
- Modify (test): `scripts/tests/zone-content.test.mjs` — append the **five** committed-content tests
- Modify: `content/README.md` — the `schemas/` inventory line

**Interfaces:**
- **Consumes:** everything Task 3a consumes, plus Task 3a's five records (the committed-content tests assert all ten at once, which is why they land here and not in 3a).
- **Produces:** the complete `content/zones/` — ten records at `content/zones/zone-<id>.json`. Task 4's `checkZoneContent()` reads exactly this directory with the filter `/^zone-.+\.json$/`; Task 5's `zones(root)` counts distinct `doc.zone` values from the same directory.
- **Produces (binding):** the ten resource-kind sets fixed in Task 2 §2.1, **twenty distinct landmark names** (Z6), and **twenty-three hazards whose mapped/unmapped split is measured in Step 5, not asserted from memory**.

**This is the commit that satisfies Z2.** After it, `content/zones/` holds all ten records, so when Task 4 introduces `checkZoneContent()` the Z2 completeness rule passes on its very first run. Nothing between Task 3a and here can leave a red gate, because no gate and no test reads `content/zones/` until this task's own tests land.

Steps:

- [ ] **Step 1: Write the failing test** — append to `scripts/tests/zone-content.test.mjs`:

```js
// ---------------------------------------------------------------------------
// The committed content. These are the only tests that read the real files;
// everything below (Task 4) runs on a hermetic fixture.
// ---------------------------------------------------------------------------

test("every committed zone record validates against the committed schema", () => {
  const validate = compile();
  for (const id of ZONE_IDS) {
    const path = join(ROOT, `content/zones/zone-${id}.json`);
    assert.ok(existsSync(path), `missing ${path}`);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    assert.ok(validate(doc), `${id}: ${JSON.stringify(validate.errors, null, 2)}`);
    assert.equal(doc.zone, id);
  }
});

test("the committed records cover exactly the geography's zones", () => {
  const geo = JSON.parse(readFileSync(GEOGRAPHY_PATH, "utf8"));
  assert.deepEqual([...geo.zones.map((z) => z.id)].sort(), [...ZONE_IDS].sort());
});

// ENUMERATES the directory instead of addressing it by constructed name. Every
// other test in this block loops `ZONE_IDS` and reads
// `content/zones/zone-${id}.json`, so a file nobody named is invisible to all of
// them — and Task 4's checkZoneContent does the opposite, reading
// `readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f))`. A leftover
// experiment (`zone-emberdown-copy.json`), a macOS duplicate
// (`zone-thornveil 2.json`), or a record whose filename and `zone` field
// disagree all match the gate's filter, all get committed by
// `git add content/zones`, and all pass the by-name tests — the first thing to
// see them would be Task 4 Step 7's real-content run, AFTER the gate is
// committed. This test closes the record set before the gate that enforces it
// exists.
test("content/zones holds exactly the ten records and nothing else", () => {
  const files = readdirSync(join(ROOT, "content/zones"))
    .filter((f) => /^zone-.+\.json$/.test(f)).sort();
  assert.deepEqual(files, ZONE_IDS.map((id) => `zone-${id}.json`).sort(),
    "an extra or misnamed zone-*.json is invisible to the by-name tests but fatal to Z1/Z2");
});

// Z3's floors, Z4's id rules and Z6's distinctiveness, asserted against the
// COMMITTED records rather than only against fixtures. Task 4's gate enforces
// these for anyone editing later; this pins that the ten shipped records were
// correct on the day they landed, without waiting for a hand-run of
// check_content.mjs.
//
// Z4 is covered HERE and not only in Task 4 on purpose. If a record with
// `id: "The Adits"` or two hazards sharing an id first detonated at Task 4's
// real-content gate run, the remedy would be editing content/zones/*.json after
// the gate had already been committed. Proving the records kebab-clean before
// the gate exists moves that failure one task earlier, where the records are
// still the task under edit. Z1's orphan branch and Z2's duplicate branch are
// pre-proven by the directory-enumeration test above, not by this one. Task 4's
// "Files:" block additionally carries a remedy-only row permitting a record edit
// for anything that still reaches its Step 7 — the three defences are layered,
// none of them is claimed to be complete on its own.
test("every committed record clears the Z3 floors and the Z4 id rules", () => {
  for (const id of ZONE_IDS) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    assert.ok(doc.reasonToGo.trim() !== "", `${id}: empty reasonToGo`);
    for (const f of ["hazards", "resources", "landmarks"]) {
      assert.ok(doc[f].length >= 2, `${id}: ${doc[f].length} ${f}, needs at least 2`);
      const seen = new Set();
      for (const item of doc[f]) {
        assert.match(item.id, ZONE_ID_RE, `${id}: ${f} id "${item.id}" is not kebab-case`);
        assert.equal(seen.has(item.id), false, `${id}: duplicate ${f} id "${item.id}"`);
        seen.add(item.id);
      }
    }
  }
});

test("the committed records have ten distinct resource-kind sets and no shared landmark name", () => {
  const kindSets = new Map();
  // DELIBERATELY STRICTER THAN Z6. The gate's Z6 landmark rule fires only when a
  // name is shared ACROSS zones (`if (shared.length > 1)`), so one zone repeating
  // a name inside its own list passes the gate. This flat Map rejects that too.
  // Keeping it stricter is the choice: twenty landmarks, twenty names, no
  // exceptions. If this ever fails on an intra-zone repeat, fix the record — do
  // not relax the test to match the gate.
  const names = new Map();
  for (const id of ZONE_IDS) {
    const doc = JSON.parse(readFileSync(join(ROOT, `content/zones/zone-${id}.json`), "utf8"));
    for (const r of doc.resources)
      assert.ok(RESOURCE_KINDS.includes(r.kind), `${id}: bad kind "${r.kind}"`);
    for (const h of doc.hazards)
      if (h.effect !== undefined)
        assert.ok(EFFECTS.includes(h.effect), `${id}: bad effect "${h.effect}"`);
    const key = [...new Set(doc.resources.map((r) => r.kind))].sort().join(",");
    assert.equal(kindSets.get(key), undefined, `${id} shares kind set [${key}] with ${kindSets.get(key)}`);
    kindSets.set(key, id);
    for (const l of doc.landmarks) {
      const k = l.name.trim().toLowerCase();
      assert.equal(names.get(k), undefined, `landmark "${l.name}" in both ${names.get(k)} and ${id}`);
      names.set(k, id);
    }
  }
  assert.equal(kindSets.size, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
grep -E "^✖" /tmp/t.out; grep -A4 "every committed zone record" /tmp/t.out | head -20
```
Expected failure: `exit=1` and **`ℹ fail 4`, not 5.** Five tests were added, but only four of them can fail here:
- `✖ every committed zone record validates against the committed schema` — carries `AssertionError [ERR_ASSERTION]: missing /…/content/zones/zone-gildmark-head.json` (Task 3a's five exist; `ZONE_IDS` is in geography order, so `gildmark-head` is the first missing one).
- `✖ every committed record clears the Z3 floors and the Z4 id rules` — throws `ENOENT` on the same file.
- `✖ the committed records have ten distinct resource-kind sets and no shared landmark name` — same `ENOENT`.
- `✖ content/zones holds exactly the ten records and nothing else` — the directory exists (Task 3a created it) and `readdirSync` succeeds, so this one fails on the `deepEqual`: five filenames found, ten expected. It is red here for the right reason and goes green only when the tenth record lands in Step 3.
- **`✔ the committed records cover exactly the geography's zones` is GREEN from the start** and always was: it reads only `content/maps/cluster1-geography.json` and the literal `ZONE_IDS`, neither of which depends on `content/zones/`. That is correct, not a bug — it is the test that pins `ZONE_IDS` against the geography, and its being green here proves the ten ids were never invented.

- [ ] **Step 3: Write the remaining five records** — same rules as Task 3a Step 1: transcribed cell by cell from the artifact's §2 table, Ashen Vigil register, no banned word, every absence hazard carrying a `note` that says why no runtime type fits.

`content/zones/zone-gildmark-head.json` — **its first-sight landmark is "The mire's bar", never "the bar"**: A1 §6's own phrasing reads as a drinking bar out of context, fails `style.md`'s one-read rule, and sits one letter from meltwash's "The gravel bars".

```json
{
  "zone": "gildmark-head",
  "reasonToGo": "The only door the sea has, with half a day of mudflat in front of it holding everything that missed the door.",
  "hazards": [
    {
      "id": "the-moving-sandbars",
      "name": "The moving sandbars",
      "description": "The bars in the mire shift between one tide and the next. No road crosses them and no chart holds good for a season.",
      "note": "Absence hazard: a hazard of navigation. Nothing in the runtime enum expresses ground that has moved since the last chart."
    },
    {
      "id": "the-salt",
      "name": "The salt",
      "description": "Every seaward face is tarred black against it, and everything left untarred goes soft inside a winter.",
      "note": "Absence hazard: slow ruin of material, not a tick on a body."
    }
  ],
  "resources": [
    {
      "id": "beached-cargo",
      "name": "Beached cargo",
      "kind": "salvage",
      "description": "Crates and gear off the wrecked hulls, coming up on the beach a week after they go over the side."
    },
    {
      "id": "dressed-headland-stone",
      "name": "Dressed headland stone",
      "kind": "stone",
      "description": "Squared block cut off the standing rock and worked into the harbour terraces at the bottom of the town."
    }
  ],
  "landmarks": [
    {
      "id": "the-mirror-tower",
      "name": "The mirror tower",
      "description": "A slim square shaft with a glazed cap that catches the sun at an hour when nothing else does.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-mires-bar",
      "name": "The mire's bar",
      "description": "The long sand shoal across the mouth of the mire, gulls standing on it and wrecked hulls half-buried along its length.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

`content/zones/zone-hollowmarch.json`:

```json
{
  "zone": "hollowmarch",
  "reasonToGo": "Where the timber and the ore both start, behind the only wall in the land that was never taken down.",
  "hazards": [
    {
      "id": "the-open-moor",
      "name": "The open moor",
      "description": "Between the ore heads and the gate there is no cover for a mile. What comes down off the moor comes when the wind turns, and the wind turning is the only warning anyone gets.",
      "note": "Absence hazard: no cover and no warning. The runtime enum has no value for exposure."
    },
    {
      "id": "the-outer-fields",
      "name": "The outer fields",
      "description": "Ground beyond the palisade where the burial details work. What crawls out of it is burned where it stands.",
      "effect": "poison"
    },
    {
      "id": "hollow-stakes",
      "name": "Hollow stakes",
      "description": "A stake in the line that answers hollow has been eaten from the inside. It gets pulled and replaced before dark.",
      "note": "Absence hazard: structural failure of the wall, not an environmental effect on a body."
    }
  ],
  "resources": [
    {
      "id": "the-timber-line",
      "name": "The timber line",
      "kind": "timber",
      "description": "Old standing wood running up the rim, felled in lengths and dragged down to the palisade crews."
    },
    {
      "id": "the-ore-heads",
      "name": "The ore heads",
      "kind": "ore",
      "description": "Worked heads at the top of the timber line, the ore carried down the same track the trunks come down."
    }
  ],
  "landmarks": [
    {
      "id": "the-tally-boards",
      "name": "The tally boards",
      "description": "Planed boards at the gate, waist high and covered edge to edge in knife-cut marks, one to a name.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-palisade-line",
      "name": "The palisade line",
      "description": "A continuous line of sharpened trunks along the rim, standing since before anyone now at the gate was born.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

`content/zones/zone-ashvale-front.json` — the zone spec §7 and claim C3 hold up as the absence-hazard exemplar. It carries **three** hazards: its two absences and one mapped, so it is not a third zero-mapped zone. If a reviewer strips `the-alkali-dust`, the artifact's §10 must be rewritten to name three zones, not two.

```json
{
  "zone": "ashvale-front",
  "reasonToGo": "The only ground both towns reach in a day and neither can hold, which is why four seasons of what either army carried is still lying on it.",
  "hazards": [
    {
      "id": "no-water-on-it",
      "name": "No water on it",
      "description": "Rain sinks and comes back alkaline. A party crossing carries every drop it drinks.",
      "note": "Absence hazard: design claim C3's own worked example. Thirst is what this ground does, and the runtime enum has no value for it."
    },
    {
      "id": "no-cover-for-a-days-crossing",
      "name": "No cover for a day's crossing",
      "description": "Level, treeless and pale from edge to edge. Whatever steps onto it can be seen from the moment it steps on.",
      "note": "Absence hazard: being visible for a full day is not a tick."
    },
    {
      "id": "the-alkali-dust",
      "name": "The alkali dust",
      "description": "Wind lifts the flat and lays it grey on everything. It takes the eyes first and then the skin at the collar and the cuffs.",
      "effect": "burn"
    }
  ],
  "resources": [
    {
      "id": "abandoned-arms",
      "name": "Abandoned arms",
      "kind": "salvage",
      "description": "Shields, plate and burial stones left where they fell through four seasons of fighting, and never carried off by either side."
    },
    {
      "id": "the-southern-lip-loam",
      "name": "The southern lip loam",
      "kind": "crop",
      "description": "The one settled edge of the flat, marked and grassed over, with loam deep enough to turn."
    }
  ],
  "landmarks": [
    {
      "id": "the-grave-rows",
      "name": "The grave rows",
      "description": "Straight lines of marked stones running across the flat, laid in three ages and none of them finished.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.3"
    },
    {
      "id": "the-abandoned-cut-lines",
      "name": "The abandoned cut lines",
      "description": "Trench works both towns dug and neither held, filling with dust a hand's depth a year.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

`content/zones/zone-northern-icefield.json` — **`freeze` and `stun` are not derived here.** They are already running in `content/maps/atlas-frontier.md`'s `zoneHazards` for `region-icefield` (two `freeze` entries and one `stun` with `castTime: 400`). Cite that; do not re-derive it and do not edit `atlas-frontier.md`.

```json
{
  "zone": "northern-icefield",
  "reasonToGo": "Every river in the land starts under this shelf, and the company at the gate on its lip has been standing there since the city behind it fell.",
  "hazards": [
    {
      "id": "the-cold",
      "name": "The cold",
      "description": "Standing air off the old ice. It takes the hands, then the feet, then the judgement, in that order and quickly.",
      "effect": "freeze"
    },
    {
      "id": "the-white-weather",
      "name": "The white weather",
      "description": "Ground and sky go one colour and a man loses which way he came in. It takes a person's sense of direction first and their warmth second.",
      "effect": "stun"
    },
    {
      "id": "the-crevasses",
      "name": "The crevasses",
      "description": "Splits in the old ice, bridged over with snow and invisible until the bridge goes. Every sled is sounded ahead of its own runners.",
      "note": "Absence hazard: a fall, not a field effect. The runtime enum has nothing for ground that is not there."
    }
  ],
  "resources": [
    {
      "id": "the-meltwater-heads",
      "name": "The meltwater heads",
      "kind": "water",
      "description": "Braids running out from under the shelf, the head of every river in the basin and clean the whole year."
    },
    {
      "id": "the-gravel-head",
      "name": "The gravel head",
      "kind": "stone",
      "description": "Old stone under the ice, exposed in bands where the shelf has drawn back, with no soil over it at all."
    }
  ],
  "landmarks": [
    {
      "id": "the-oath-gate",
      "name": "The oath-gate",
      "description": "A gate frame in the south lip with no gate hung in it and no wall on either side, and a sentinel still holding it.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    },
    {
      "id": "the-crevasse-shelf",
      "name": "The crevasse shelf",
      "description": "The broken front of the old ice, standing over stone and split from edge to edge.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#4.2"
    }
  ]
}
```

`content/zones/zone-cindervast.json` — **its gate is "The dead gate", never "the gate"**: `northern-icefield` already owns "The oath-gate", and A1 §2.1's X8 deliberately ties the two together, so an unqualified name reads as one landmark in two zones and Z6 either fires or, worse, does not.

```json
{
  "zone": "cindervast",
  "reasonToGo": "A city the weapon took without knocking it down: intact mortar, no rubble in the streets, and what the people in it were carrying still where they dropped it.",
  "hazards": [
    {
      "id": "the-afterglow",
      "name": "The afterglow",
      "description": "A violet light that shows at dusk on the north faces. What stands in it long enough stops wanting to eat.",
      "effect": "poison"
    },
    {
      "id": "a-city-with-nobody-in-it",
      "name": "A city with nobody in it",
      "description": "No water drawn, no fire kept and nobody to carry a man out. Everything a town does for the people inside it, this one stopped doing.",
      "note": "Absence hazard: the absence of a town's services. Nothing in the runtime enum expresses it."
    }
  ],
  "resources": [
    {
      "id": "relic-scrap",
      "name": "Relic scrap",
      "kind": "salvage",
      "description": "Worked metal and glass dug out of the ruin districts and carried out in sacks by the crews that come back."
    },
    {
      "id": "district-fuel",
      "name": "District fuel",
      "kind": "fuel",
      "description": "What the outer districts still burn: dry roof timber, and stored coal in cellars the fires have not reached."
    }
  ],
  "landmarks": [
    {
      "id": "the-giving-king-statues",
      "name": "The Giving King statues",
      "description": "One in every square, holding a child, upright and undamaged in a city where everything else was taken.",
      "source": "docs/worldbuilding/A1-geography-cluster1.md#6"
    },
    {
      "id": "the-dead-gate",
      "name": "The dead gate",
      "description": "The city's own gate, held now from the outside, with the wall standing clean on either side of it.",
      "source": "content/maps/cluster1-geography.json#towns[cindervast].wallsOnly.gateAt"
    }
  ]
}
```

  Three bindings that are easy to get wrong and are already settled:
  - **The expedition camp belongs to `meltwash-terrace` only.** `cluster1-geography.json#camps[expedition-camp]` carries `"zone": "meltwash-terrace"`, even though `canon.md` §4 calls it "Millcross's expedition camp" and two bestiary designs carry `region: millcross` while describing the meadow. Assign camp and meadow landmarks by the **geography data**, never by a bestiary `region` key. Listing it in `millcross-ford` as well would fire Z6 on a duplicated landmark name.
  - **`district-fuel` is a two-step derivation** from `mob-cinderfall-giant` ("the outer districts where the fires still find fuel"). It ships flagged `[D]` in the artifact's §2 table and §15 register.
  - **`the-southern-lip-loam` rests on `canon.md` §4's literal sentence** and collides with A1 §1/§3.1's alkali-flat reading. The collision is named in the artifact's §13; the record does not smooth it.

  Also fix the pre-existing inventory drift in `content/README.md` (one line, honest, not scope creep):
```
- `schemas/` — JSON Schema v7 for validation (character, story, map, bestiary placement, zone content).
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
node scripts/check_content.mjs; echo "exit=$?"
```
Expected: `exit=0` and `ℹ fail 0` from the suite, with `ℹ pass` **exactly five above** whatever Task 1 Step 4 recorded (209 if nothing else has landed) — this task adds five tests and Task 3a added none. `check_content.mjs` still prints `content-gate: 12 sheets, 1 maps, 158 story, 1 placements, 0 failures, 0 warnings` with `exit=0` — the gate has no `checkZoneContent()` yet, so it does not look at `content/zones/` at all. That is the intended interim state, not a miss.

- [ ] **Step 5: Measure the content by hand** (evidence, per rule 2). **This step is the single source of truth for the hazard census.** No number below is asserted from memory or copied out of this plan: the one-liner prints what the ten records actually contain, and *that* is the figure Task 4's expected gate output and the final Verification section must match. Never edit shipped world content to hit a number written in advance.
```bash
# G4 — style.md's ban list, over all ten records. No hit is the pass case.
grep -rnEi '\b(okay|guys|tech|percent|boss)\b' content/zones/ > /tmp/ban.out 2>&1; echo "banned-word exit=$?"; cat /tmp/ban.out
# G7 — every capitalised token in the authored prose (SWF §4's G7 scope explicitly
# covers place and item names, so it covers these ten files, not only the markdown).
grep -rhoE '\b[A-Z][a-z]+\b' content/zones/ | sort -u
# The hazard census, and the invariants that are actually pinned by a rule.
node -e '
const fs = require("fs");
let m = 0, u = 0, total = 0; const zero = [];
for (const f of fs.readdirSync("content/zones").sort()) {
  const d = JSON.parse(fs.readFileSync("content/zones/" + f, "utf8"));
  total += d.hazards.length;
  for (const h of d.hazards) (h.effect === undefined ? u++ : m++);
  if (d.hazards.every((h) => h.effect === undefined)) zero.push(d.zone);
}
// NOT `total === m + u` — that is an identity by construction (both loops walk
// the same array) and can never be false. These three CAN fail, and each says
// something different when it does.
const zeroList = zero.join(", ");
console.log(`mapped=${m} unmapped=${u} total=${total}`);
console.log(`zero-mapped zones: ${zeroList || "(none)"}`);
console.log(`check zero-mapped === "gildmark-head, millcross-ford": ${zeroList === "gildmark-head, millcross-ford"}`);
console.log(`check total === 23: ${total === 23}`);
console.log(`check mapped === 10: ${m === 10}`);
process.exit(zeroList === "gildmark-head, millcross-ford" && total === 23 && m === 10 ? 0 : 1);
' > /tmp/census.out 2>&1; echo "census exit=$?"; cat /tmp/census.out
# The records vs the ARTIFACT. z6-check's artifact mode compares §2.1's fence to
# ITSELF (are its own ten sets pairwise distinct); Task 3b's suite compares the
# ten records to THEMSELVES (pairwise distinct, ten of them). Nothing compares
# the two, so transcribing ashvale-front as {salvage, forage} instead of the
# fence's {salvage, crop} leaves every other check green and the artifact quietly
# lying about the content it is the authoring input for. This is that check.
node -e '
const fs=require("fs");
const md=fs.readFileSync("docs/worldbuilding/A2-zones-cluster1.md","utf8");
const fence=JSON.parse(md.match(/```json\n([\s\S]*?)```/)[1]);
let bad=0;
for(const f of fs.readdirSync("content/zones").filter(f=>/^zone-.+\.json$/.test(f)).sort()){
  const d=JSON.parse(fs.readFileSync("content/zones/"+f,"utf8"));
  const rec=[...new Set(d.resources.map(r=>r.kind))].sort().join(",");
  const art=[...new Set(fence[d.zone]??[])].sort().join(",");
  if(rec!==art){console.log(`KIND DRIFT ${d.zone}: record [${rec}] vs artifact [${art}]`);bad++;}
}
console.log(bad?`${bad} drifts`:"records match the artifact fence");
process.exit(bad?1:0);
' > /tmp/fence.out 2>&1; echo "fence exit=$?"; cat /tmp/fence.out
```
Expected:
- the ban grep prints nothing with `banned-word exit=1` (grep found no match — that is the pass case);
- the G7 list contains **zero real-world country, city, people, language or religion nouns**. Across all ten records the only in-corpus proper noun is **`Giving`/`King`** (from "The Giving King statues", A1 §6); every other capitalised token is sentence-initial or the first word of a hazard/resource/landmark `name`. Any token outside those three buckets must be cited or renamed before the commit.
- the census prints `census exit=0` with **all three `check …` lines `true`** — `zero-mapped === "gildmark-head, millcross-ford"` (the pair the artifact's §10 names, in `readdirSync().sort()` order, which is filename order), `total === 23` and `mapped === 10`. Each of these can fail; each says something different when it does.
- `fence exit=0` and `records match the artifact fence` — the ten records' kind sets are identical to the artifact's §2.1 fence, zone by zone.
- **Write the printed `mapped=… unmapped=… total=…` triple and the `zero-mapped zones:` list into this task's evidence.** On the §2 table as authored above they come out as `mapped=10 unmapped=13 total=23` and `zero-mapped zones: gildmark-head, millcross-ford`. **A mismatch means a record drifted from the §2 table, and one of the two must be corrected — decide which is right, then fix it and re-run both this step and Task 2 Step 4. Never edit shipped world content merely to hit a number.** Then carry the **measured** numbers forward — Task 4's `zone-content: N of M hazards have no runtime effect` must equal `unmapped` of `total` from this run, and the artifact's §10 must name exactly the zones in the `zero-mapped` list.

- [ ] **Step 6: Commit**
```bash
git add content/zones content/README.md scripts/tests/zone-content.test.mjs
git commit -m "feat(content): remaining five zone records + committed-content tests (I-060)"
```

- [ ] **Step 7: Independent adversarial review of this task's diff.** Fresh subagent, briefed as **Archivist + Political Economist + Cliché Auditor**, scoped to five records + one README line + four tests. It must check: every string traceable to a cell of the artifact's §2 table (verify by grep, do not take it on trust); no `reasonToGo` that says "adventure awaits" or "rich hunting grounds" — each must name a thing carried **out** (C2) or a thing only this ground has; every resource has a named taker and a named loser (G3); no banned word; **all twenty landmark names distinct across the ten records, with "The mire's bar" ≠ "The gravel bars" and "The dead gate" ≠ "The oath-gate" held deliberately**; the ten kind sets pairwise distinct and identical to the artifact's §2.1 fence; `the-southern-lip-loam`'s canon collision named in §13 rather than smoothed; no record listing the expedition camp outside `meltwash-terrace`.

- [ ] **Step 8: Refactor on the findings.** If any id, name or kind changed, change the artifact's §2 table **and** §2.1 fence in the same commit and re-run Task 2 Step 4's artifact-mode `z6-check.mjs`.

- [ ] **Step 9: Re-verify** — re-run Steps 4 and 5, paste real output, and re-record the census triple if it moved. New commit, never `--amend`.

---

## Task 4: The gate — `checkZoneContent()`, rules Z1–Z7

**Files:**
- Modify: `scripts/check_content.mjs`
- Modify (test): `scripts/tests/zone-content.test.mjs` — append the fixture-driven Z1–Z7 suite

**Interfaces:**
- **Consumes:** `existsSync`, `readdirSync`, `join`, `readJson(path, label, fail)`, `compileSchema(path, label, fail)`, `findDuplicateGroups(items, keyFn)`, `loadGeographyZones(path)`, `fail(msg)`, `warn(msg)` — **all already in scope in `check_content.mjs`. Add no imports.**
- **Produces — the exact public surface later tasks and tests depend on:**
  - `function checkZoneContent(opts) -> number` — the count of accepted records. `opts.contentRoot` is the only field read.
  - `const ZONE_RESOURCE_KINDS: string[8]`, `const ZONE_HAZARD_EFFECTS: string[7]`, `const ZONE_ID_RE: RegExp` — module-level.
  - `let zoneHazardsTotal`, `let zoneHazardsUnmapped` — module-level counters beside `failures`/`warnings`.
  - `function readGeographyZones(path)` — the **renamed** body of today's `loadGeographyZones`, byte-identical inside; `loadGeographyZones(path)` becomes a one-line memoizing wrapper over it (Step 3, patch A2). `checkBestiaryPlacement`'s call site is untouched. This exists because `checkZoneContent` makes the geography a **second** consumer's dependency: without the memo the file is parsed twice per run and a shape-invalid geography prints its FAIL **twice**, reporting one defect as two.
  - `function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0, zoneCount = 0)` — **a 5th positional parameter**, plus a `, ${zoneCount} zones` segment in the summary and one new aggregate line. **The aggregate line is guarded** (`if (zoneCount > 0 || zoneHazardsTotal > 0)`): a content root that ships no zone content must not gain a `zone-content: 0 of 0 …` line, which would print a measurement of a thing that was never measured onto all ~20 fixtures in `check_content.test.mjs` and `bestiary-placement.test.mjs`. Two tests pin the guard in both directions.
- **Produces — the message strings, which ARE the contract** (`assert.match` on exact text; label = content-relative path, matching the `bestiary/` and `maps/` precedent):

| rule | message |
| --- | --- |
| Z1 | `zones/<file>: zone "<id>" not in cluster1-geography.json#zones` — `<file>` is the whole filename, which already starts with `zone-`; the emitted text for `zone-nowhere.json` is `zones/zone-nowhere.json: …`, exactly like every other row |
| Z2 missing | `zones: geography zone "<id>" has no record in content/zones/` |
| Z2 duplicate | `zones: zone "<id>" has N records (<file>, <file>)` — filenames sorted |
| Z3 floor | `zones/<file>: zone "<id>" has N hazards\|resources\|landmarks, needs at least 2` |
| Z3 reason | `zones/<file>: zone "<id>" has an empty reasonToGo` |
| Z4 kebab | `zones/<file>: hazard\|resource\|landmark id "<id>" is not kebab-case` — **singular noun** |
| Z4 duplicate | `zones/<file>: duplicate hazard\|resource\|landmark id "<id>" (N entries)` — **singular noun** |
| Z5 WARN | `zones/<file>: hazard "<id>" has no effect — authored but not expressible at runtime` |
| Z5 FAIL | `zones/<file>: hazard "<id>" effect "<v>" is not a runtime zoneHazards type (valid: freeze, stun, burn, poison, regen, heal, damage)` |
| Z5 aggregate | `zone-content: N of M hazards have no runtime effect` — its own line in `finish()`, **printed only when the root has zone content** (`zoneCount > 0 || zoneHazardsTotal > 0`) |
| Z6 landmark | `zones: landmark name "<name>" appears in zones "<a>", "<b>"` — zone ids sorted |
| Z6 kind set | `zones: resource-kind set (<sorted kinds, ", "-joined>) is shared by zones "<a>", "<b>"` |
| Z7 | `zones/<file>: resource "<id>" kind "<v>" is not a resource kind (valid: crop, timber, ore, fuel, stone, water, forage, salvage)` |

Steps:

- [ ] **Step 1: Write the failing test** — append to `scripts/tests/zone-content.test.mjs`, after the Task 3 block:

```js
const GEOGRAPHY = {
  zones: ZONE_IDS.map((id) => ({ id, name: id, levelBand: ZONE_BANDS[id] })),
};

// All ten records, keyed by filename. `mutators` is zoneId -> (record) => void,
// applied after construction so a test can reach into a nested array.
function allZones(mutators = {}) {
  const files = {};
  for (const id of ZONE_IDS) {
    const rec = zoneRecord(id);
    if (mutators[id]) mutators[id](rec);
    files[`zone-${id}.json`] = rec;
  }
  return files;
}

// `zones: null` = do not create content/zones at all (the soft-skip path).
// `geography: null` = write a literal JSON `null` (the shape-invalid path).
function fixture({ zones = {}, geography = GEOGRAPHY, zoneSchema = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "zone-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/maps"), { recursive: true });
  const schemas = ["character.schema.json", "map.schema.json"];
  if (zoneSchema) schemas.push("zone-content.schema.json");
  for (const s of schemas)
    cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
  writeFileSync(join(dir, "content/maps/cluster1-geography.json"), JSON.stringify(geography));
  if (zones !== null) {
    mkdirSync(join(dir, "content/zones"), { recursive: true });
    for (const [name, body] of Object.entries(zones))
      writeFileSync(join(dir, "content/zones", name), JSON.stringify(body));
  }
  // Hermeticity: every external artifact the gate reads is a fixture, so these
  // tests can never silently track the live committed files.
  writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
  writeFileSync(join(dir, "spawn-areas.json"), JSON.stringify({ version: 1, areas: [] }));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      "--mob-types", join(dir, "mob-types.json"),
      "--spawn-areas", join(dir, "spawn-areas.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

// ---------------------------------------------------------------------------
// Wiring + the soft-skip contract. checkZoneContent MUST skip a content root
// with no zones/ dir: every fixture in check_content.test.mjs and
// bestiary-placement.test.mjs lacks one, and Z2 would otherwise fire ten
// missing-record FAILs into unrelated suites.
// ---------------------------------------------------------------------------

test("no content/zones directory skips silently", () => {
  const r = runGate(fixture({ zones: null, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /0 zones/);
});

test("a content/zones directory with no zone-*.json skips silently", () => {
  const r = runGate(fixture({ zones: {}, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.match(r.out, /0 zones/);
});

test("the ten valid records pass, are counted, and raise nothing", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /10 zones/);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.doesNotMatch(r.out, /WARN/);
});

// The two halves of the finish() guard. The `zone-content:` line reports a
// ratio; on a root that ships no zone content there is no ratio, and printing
// `0 of 0` would put a measurement of an unmeasured thing onto every fixture in
// check_content.test.mjs and bestiary-placement.test.mjs. season1.mjs's
// buildRows keeps the same discipline (`actual: null`, never 0, when nothing is
// countable). These two tests pin the guard in BOTH directions, so neither
// removing it nor inverting it can pass.
test("the zone-content line is ABSENT on a root with no zone content", () => {
  const r = runGate(fixture({ zones: null, zoneSchema: false }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /zone-content:/);
  assert.match(r.out, /0 zones/);
});

test("the zone-content line is PRESENT once the root has zone records", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /^zone-content: 0 of 20 hazards have no runtime effect$/m);
});

// readJson cannot distinguish "recorded a FAIL" from "parsed to a JSON-falsy
// value"; readGeographyZones checks the failure count for that reason. A
// literal `null` must be ONE shape-invalid FAIL — never a silent skip that
// would leave Z1 and Z2 unenforced, and never TWO, which is what an unmemoized
// loadGeographyZones would print now that checkBestiaryPlacement and
// checkZoneContent both ask for the geography. The count assertion is the only
// thing that can catch a regression on the memo (Step 3, patch A2).
test("a geography parsing to null is one shape-invalid FAIL, not a skip and not two", () => {
  const r = runGate(fixture({ zones: allZones(), geography: null }));
  assert.equal(r.code, 1);
  assert.match(r.out, /geography: .* is shape-invalid/);
  assert.equal(
    (r.out.match(/is shape-invalid/g) ?? []).length, 1,
    `one broken geography must be reported once, not once per consumer:\n${r.out}`);
});

test("a schema-invalid record FAILs and its Z-rules are skipped, not crashed on", () => {
  const zones = allZones();
  zones["zone-emberdown.json"].surprise = true;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: schema /);
});

// --------------------------------- Z1 --------------------------------------
// The fixture keeps all ten real records present and adds an ELEVENTH file, so
// Z2's completeness rule is fully satisfied and Z1 is the only rule that can
// reject this root. Delete Z1 from the gate and this root exits 0.
test("Z1: a record naming a zone the geography does not have fails", () => {
  const zones = allZones();
  const orphan = zoneRecord("emberdown");
  orphan.zone = "nowhere";
  orphan.resources = [
    { id: "nowhere-res-a", name: "A", kind: "crop", description: "d" },
    { id: "nowhere-res-b", name: "B", kind: "timber", description: "d" },
  ];
  orphan.landmarks = [
    { id: "nowhere-mark-a", name: "nowhere landmark A", description: "d" },
    { id: "nowhere-mark-b", name: "nowhere landmark B", description: "d" },
  ];
  zones["zone-nowhere.json"] = orphan;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-nowhere\.json: zone "nowhere" not in cluster1-geography\.json#zones/);
});

test("Z1: all ten geography zone ids are accepted", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /not in cluster1-geography/);
});

// --------------------------------- Z2 --------------------------------------
// Every surviving record is fully valid, so nothing but Z2 can reject this
// root. Delete Z2 and a nine-tenths-finished cluster passes — the one thing Z2
// exists to make impossible.
test("Z2: a geography zone with no record fails", () => {
  const zones = allZones();
  delete zones["zone-thornveil.json"];
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones: geography zone "thornveil" has no record in content\/zones\//);
  assert.match(r.out, /9 zones/);
  assert.doesNotMatch(r.out, /not in cluster1-geography/);
});

test("Z2: two records claiming the same zone fail", () => {
  const zones = allZones();
  const dup = zoneRecord("emberdown");
  // Non-colliding kind set and landmark names, so Z6 cannot supply the exit-1.
  dup.resources[0].kind = "timber";
  dup.resources[1].kind = "stone";
  dup.landmarks[0].name = "emberdown landmark C";
  dup.landmarks[1].name = "emberdown landmark D";
  zones["zone-emberdown-copy.json"] = dup;
  const r = runGate(fixture({ zones }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: zone "emberdown" has 2 records \(zone-emberdown-copy\.json, zone-emberdown\.json\)/);
});

test("Z2: exactly ten records, one per zone, is the passing shape", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.match(r.out, /10 zones/);
  assert.doesNotMatch(r.out, /has no record in content\/zones\//);
  assert.doesNotMatch(r.out, /has 2 records/);
});

// --------------------------------- Z3 --------------------------------------
// The baseline sits EXACTLY on the floors, so each test removes one element.
test("Z3: fewer than two hazards fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards = [z.hazards[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 hazards, needs at least 2/);
});

test("Z3: fewer than two resources fails", () => {
  // Dropping res-b leaves emberdown's kind set {fuel} — still distinct from
  // every other zone's, so Z6 cannot be what rejects this root.
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources = [z.resources[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 resources, needs at least 2/);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

test("Z3: fewer than two landmarks fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks = [z.landmarks[0]]; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has 1 landmarks, needs at least 2/);
});

test("Z3: an empty reasonToGo fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.reasonToGo = "   "; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: zone "emberdown" has an empty reasonToGo/);
});

test("Z3: exactly two of each, with a reasonToGo, is legal", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /needs at least 2|empty reasonToGo/);
});

// --------------------------------- Z4 --------------------------------------
test("Z4: a non-kebab-case hazard id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].id = "Seam_Damp"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: hazard id "Seam_Damp" is not kebab-case/);
});

test("Z4: a non-kebab-case resource id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].id = "Burning Stone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: resource id "Burning Stone" is not kebab-case/);
});

test("Z4: a non-kebab-case landmark id fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks[0].id = "TheAdits"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: landmark id "TheAdits" is not kebab-case/);
});

test("Z4: two hazards sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[1].id = z.hazards[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate hazard id "emberdown-hazard-a"/);
});

test("Z4: two resources sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[1].id = z.resources[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate resource id "emberdown-res-a"/);
});

test("Z4: two landmarks sharing an id fail", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.landmarks[1].id = z.landmarks[0].id; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones\/zone-emberdown\.json: duplicate landmark id "emberdown-mark-a"/);
});

// The other polarity: "unique within their array" is not "unique within the
// file". A gate that pooled all three arrays would reject this legal record.
test("Z4: one id string reused across two DIFFERENT arrays is legal", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => {
      z.hazards[0].id = "the-adits";
      z.resources[0].id = "the-adits";
      z.landmarks[0].id = "the-adits";
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /duplicate .* id/);
});

test("Z4: ids with digits and multiple segments are legal kebab-case", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].id = "seam-damp-2"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /is not kebab-case/);
});

// --------------------------------- Z5 --------------------------------------
// THE SUBTLE ONE. An exit-code-only test cannot tell a correct WARN from a
// wrongly-escalated FAIL, so this asserts all three of: exit 0, the WARN text,
// and the total absence of FAIL.
test("Z5: a hazard with no effect is a WARN, not a FAIL", () => {
  const r = runGate(fixture({ zones: allZones({
    "ashvale-front": (z) => { delete z.hazards[0].effect; },
  }) }));
  assert.equal(r.code, 0, `a missing effect must not fail the gate:\n${r.out}`);
  assert.match(
    r.out,
    /WARN\s+zones\/zone-ashvale-front\.json: hazard "ashvale-front-hazard-a" has no effect/);
  assert.doesNotMatch(r.out, /FAIL/);
  assert.match(r.out, /10 zones/);
});

// Spec §7: "the implementation must print that count, not swallow it." The
// per-hazard WARN alone does not satisfy that, and the generic `N warnings`
// conflates zone hazards with character-coverage warns.
test("Z5: the unmapped-hazard count is printed as an aggregate", () => {
  const r = runGate(fixture({ zones: allZones({
    "ashvale-front": (z) => { delete z.hazards[0].effect; delete z.hazards[1].effect; },
    cindervast: (z) => { delete z.hazards[0].effect; },
  }) }));
  assert.equal(r.code, 0);
  assert.match(r.out, /zone-content: 3 of 20 hazards have no runtime effect/);
});

test("Z5: an effect outside the seven runtime types fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].effect = "melt"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones\/zone-emberdown\.json: hazard "emberdown-hazard-a" effect "melt" is not a runtime zoneHazards type \(valid: freeze, stun, burn, poison, regen, heal, damage\)/);
});

test("Z5: every one of the seven runtime types is accepted with no WARN", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => {
      z.hazards = EFFECTS.map((e, i) => ({
        id: `emberdown-hazard-${i}`, name: `H${i}`, description: "d", effect: e,
      }));
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /WARN/);
  assert.doesNotMatch(r.out, /is not a runtime zoneHazards type/);
  assert.match(r.out, /zone-content: 0 of 25 hazards have no runtime effect/);
});

// The gate's ZONE_HAZARD_EFFECTS is a hand-copy of the runtime enum. If the two
// ever drift, `effect` becomes a fiction field pretending to be a binding.
//
// This must assert against the GATE's list, not against this file's `EFFECTS`
// constant. `check_content.mjs` cannot be imported — it calls `main()` and
// `process.exit()` at module scope — so the gate's list is reachable only
// through its observable surface: the `(valid: …)` tail of the Z5 FAIL message,
// which the implementation builds with `ZONE_HAZARD_EFFECTS.join(", ")`. Parsing
// that tail and deep-equalling it against BOTH map.schema.json's enum AND
// `EFFECTS` binds all three lists in one assertion, so deleting a value from
// ZONE_HAZARD_EFFECTS goes red. (An earlier draft of this test compared the
// schema to `EFFECTS` only — the gate could have dropped a value and stayed
// green.)
function validListFrom(out, re) {
  const m = out.match(re);
  assert.ok(m, `no "(valid: …)" list in gate output:\n${out}`);
  return m[1].split(", ");
}

test("Z5: the GATE's effect list equals map.schema.json's zoneHazards enum", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.hazards[0].effect = "melt"; },
  }) }));
  assert.equal(r.code, 1);
  const gateList = validListFrom(
    r.out, /is not a runtime zoneHazards type \(valid: ([^)]+)\)/);
  const map = JSON.parse(readFileSync(join(ROOT, "content/schemas/map.schema.json"), "utf8"));
  const runtime = map.properties.zoneHazards.items.properties.type.enum;
  assert.deepEqual(gateList, runtime, "gate's ZONE_HAZARD_EFFECTS drifted from map.schema.json");
  assert.deepEqual(gateList, EFFECTS, "gate's ZONE_HAZARD_EFFECTS drifted from this file's EFFECTS");
});

// The Z7 mirror. There is no schema to compare against — the eight kinds are
// design §6's own vocabulary and this file's RESOURCE_KINDS is their only other
// written copy — so this pins the gate's ZONE_RESOURCE_KINDS to it. Without
// this test, ZONE_RESOURCE_KINDS is asserted nowhere except inside the one
// message regex that would be edited in lockstep with it.
test("Z7: the GATE's kind list equals the eight-value resource-kind enum", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "gemstone"; },
  }) }));
  assert.equal(r.code, 1);
  const gateList = validListFrom(
    r.out, /is not a resource kind \(valid: ([^)]+)\)/);
  assert.deepEqual(gateList, RESOURCE_KINDS, "gate's ZONE_RESOURCE_KINDS drifted from spec §6");
  assert.equal(gateList.length, 8);
});

// --------------------------------- Z6 --------------------------------------
// DECIDED, and the two places are deliberately NOT symmetric: the GATE fires
// only on a landmark name shared ACROSS zones (`if (shared.length > 1)`), so a
// zone repeating a name inside its own list passes Z6; Task 3b's
// committed-content test uses one FLAT name Map across all ten records and
// rejects that too. The stricter of the two was chosen for the committed
// content — twenty landmarks, twenty names, no exceptions — and the looser one
// for the gate, because "this zone lists the same rock twice" is an authoring
// slip in one file, not a cross-zone identity failure worth failing every
// consumer's content root over. If Task 3b's test ever fires on an intra-zone
// repeat, fix the record; do not relax it to match the gate, and do not tighten
// the gate to match it.
//
// Only the landmark name collides — kind sets stay {fuel,crop} vs {ore,fuel}.
test("Z6: a landmark name appearing in two zones fails", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.landmarks[0].name = "emberdown landmark A"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: landmark name "emberdown landmark A" appears in zones "emberdown", "hollowmarch"/);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

// Only the kind set collides — every landmark name stays zone-prefixed.
test("Z6: two zones with an identical resource-kind set fail", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "ore"; z.resources[1].kind = "stone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones: resource-kind set \(ore, stone\) is shared by zones "gildmark-head", "hollowmarch"/);
  assert.doesNotMatch(r.out, /landmark name/);
});

test("Z6: an identical kind set in a different order still fails", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "stone"; z.resources[1].kind = "ore"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zones: resource-kind set \(ore, stone\) is shared by zones "gildmark-head", "hollowmarch"/);
});

test("Z6: kind sets that overlap without being identical are legal", () => {
  const r = runGate(fixture({ zones: allZones({
    hollowmarch: (z) => { z.resources[0].kind = "ore"; z.resources[1].kind = "timber"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

test("Z6: repeating one kind inside a single zone is legal and dedupes to a set", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "fuel"; z.resources[1].kind = "fuel"; },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /resource-kind set/);
});

test("Z6: ten distinct landmark-name sets and ten distinct kind sets pass", () => {
  const r = runGate(fixture({ zones: allZones() }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /landmark name .* appears in zones|resource-kind set/);
});

// --------------------------------- Z7 --------------------------------------
test("Z7: a resource kind outside the enum fails", () => {
  const r = runGate(fixture({ zones: allZones({
    emberdown: (z) => { z.resources[0].kind = "gemstone"; },
  }) }));
  assert.equal(r.code, 1);
  assert.match(
    r.out,
    /zones\/zone-emberdown\.json: resource "emberdown-res-a" kind "gemstone" is not a resource kind \(valid: crop, timber, ore, fuel, stone, water, forage, salvage\)/);
});

test("Z7: all eight enum kinds are accepted", () => {
  const r = runGate(fixture({ zones: allZones({
    // The full eight-kind set is distinct from every zone's pair, so Z6 stays
    // quiet and Z7 is the only rule under test.
    cindervast: (z) => {
      z.resources = RESOURCE_KINDS.map((k, i) => ({
        id: `cindervast-res-${i}`, name: `R${i}`, kind: k, description: "d",
      }));
    },
  }) }));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /is not a resource kind/);
  assert.match(r.out, /10 zones/);
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
grep -E "^✖" /tmp/t.out | head -40
```
Expected failure: `exit=1` and a **floor of 25** `✖` lines — not an exact count, because several of this step's tests are legitimately green before any implementation exists. Exactly these eight are green at this point, and each for a stated reason:

| test | why it is green with no implementation |
| --- | --- |
| `Z1: all ten geography zone ids are accepted` | asserts only `code === 0` + `doesNotMatch` |
| `Z3: exactly two of each, with a reasonToGo, is legal` | same |
| `Z4: one id string reused across two DIFFERENT arrays is legal` | same |
| `Z4: ids with digits and multiple segments are legal kebab-case` | same |
| `Z6: kind sets that overlap without being identical are legal` | same |
| `Z6: repeating one kind inside a single zone is legal and dedupes to a set` | same |
| `Z6: ten distinct landmark-name sets and ten distinct kind sets pass` | same |
| `the zone-content line is ABSENT on a root with no zone content` | `finish()` prints no `zone-content:` line at all yet, so "absent" holds vacuously — its polarity partner (`… is PRESENT once the root has zone records`) is what must be red |

The **shape** is what to check, and it is stricter than the count: every test that asserts a `N zones` substring must be red (the soft-skip and pass-case tests fail on `assert.match(r.out, /0 zones|10 zones/)` because `finish()` prints no `zones` segment yet), every test that asserts `assert.equal(r.code, 1)` must be red (it receives `0`, because no rule exists), and both `the GATE's effect list …` / `the GATE's kind list …` tests must be red at the `assert.equal(r.code, 1)` line — **not** at the `deepEqual`, because there is no `(valid: …)` message to parse yet. **Any test naming a Z-rule that is GREEN at this point and is not in the table above is not testing that rule — fix the test before writing a line of the implementation.**

- [ ] **Step 3: Write minimal implementation — patch A: the Z5 counters and the geography memo.** **Anchor every edit in this task on exact text, never on a line number.** Patch A1 shifts everything below it by +6 and patch A2 by a further +7, so any line number quoted for a later step is stale by the time that step runs.

**Patch A1 — the counters.** In `scripts/check_content.mjs`, find the four-line block that begins `const failures = [];` and ends `const warn = (m) => warnings.push(m);` (it sits immediately below `loadGeographyZones`'s closing brace), and replace those four lines with:

```js
const failures = [];
const warnings = [];
// I-060 Z5: hazards authored vs hazards the runtime can express. Module-level
// alongside failures/warnings because finish() prints the ratio — design §7
// makes that count the only signal of how much of the authored world the
// engine can express, so it must never be swallowed into the warning total.
let zoneHazardsTotal = 0;
let zoneHazardsUnmapped = 0;
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
```

**Patch A2 — memoize the geography load.** `checkZoneContent()` makes `checkBestiaryPlacement()` no longer the only consumer of the geography, and today's `loadGeographyZones` re-reads and re-validates on every call: two parses per run, and on a broken geography the SAME `geography: … is shape-invalid` FAIL text pushed **twice** — one defect reported as two, in both the failure count and the printed output. Fix it by renaming the existing function and putting a memo in front of it. Find the line `function loadGeographyZones(path) {` and change **only** that line to `function readGeographyZones(path) {` — the body below it is untouched, byte for byte — then insert directly **above** the renamed function:

```js
// I-060: two checkers now need the geography (checkBestiaryPlacement and
// checkZoneContent). Memoized on `path` so it is parsed once per run and a
// shape-invalid geography records its FAIL once rather than once per consumer.
// `has()`, not a truthiness test: `null` is the legitimate cached failure
// result and must not be retried (retrying is exactly what double-FAILs).
const geographyZonesCache = new Map();
function loadGeographyZones(path) {
  if (!geographyZonesCache.has(path))
    geographyZonesCache.set(path, readGeographyZones(path));
  return geographyZonesCache.get(path);
}
```

`checkBestiaryPlacement`'s existing call site keeps calling `loadGeographyZones` and is not edited. The memo is pinned by the `a geography parsing to null is one shape-invalid FAIL, not a skip and not two` test in Step 1, which asserts the match count is exactly `1`.

- [ ] **Step 4: Write minimal implementation — patch B: `checkZoneContent()`.** Insert VERBATIM immediately after `checkBestiaryPlacement()`'s closing brace and before `function finish(`. **No new imports.**

```js
// I-060: L2 zone content. `kind` is a closed enum drawn from what canon already
// says cluster 1 lives on (design §6); `effect` is the seven runtime zoneHazards
// types, whose source of truth is
// content/schemas/map.schema.json #/properties/zoneHazards/items/properties/type/enum
// (consumed by colyseus-server ZoneEffectManager). Restated here deliberately:
// this gate must not depend on a map schema the content root may not ship. A
// test asserts the two lists are equal so the copy cannot drift silently.
const ZONE_RESOURCE_KINDS = ["crop", "timber", "ore", "fuel", "stone", "water", "forage", "salvage"];
const ZONE_HAZARD_EFFECTS = ["freeze", "stun", "burn", "poison", "regen", "heal", "damage"];
const ZONE_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// I-060: the zone-content gate, rules Z1-Z7 (design §7). Zone content is
// OPTIONAL content — a root with no zones/ dir, or none matching zone-*.json,
// skips silently (mirrors checkBestiaryPlacement's soft-skip; without it every
// fixture in check_content.test.mjs and bestiary-placement.test.mjs would take
// ten Z2 FAILs). Once ONE file exists the whole cluster is checked STRICTLY:
// Z2 asserts every zone in the geography has exactly one record, so a
// half-finished pass cannot go green. That is what bounds the per-zone cost.
//
// Two passes. Z1/Z3/Z4/Z5/Z7 are per-record and run in pass 1; Z2 and Z6 are
// cross-file — "this landmark name is taken" and "this zone is missing" are
// only answerable once every record is in hand — so pass 1 collects the
// accepted records and pass 2 checks them against each other.
//
// The schema is deliberately SHAPE-ONLY (see zone-content.schema.json's own
// description): because a schema-invalid doc `continue`s past every rule
// below, any constraint duplicated in the schema would make its Z-rule
// unreachable dead code. The floors, the kebab pattern and both enums
// therefore live here and nowhere else.
function checkZoneContent(opts) {
  const dir = join(opts.contentRoot, "zones");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => /^zone-.+\.json$/.test(f)).sort();
  if (!files.length) return 0;

  // Skip BEFORE touching the schema: a content root that never adopted zone
  // content must not FAIL with "zone-content schema: cannot read/parse".
  const validate = compileSchema(
    join(opts.contentRoot, "schemas/zone-content.schema.json"),
    "zone-content schema", fail);
  if (!validate) return 0;

  // REQUIRED once a zone file exists: Z1 and Z2 are both assertions against
  // the Cartographer's geography, which is the authority on which zones exist.
  const zones = loadGeographyZones(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!zones) return 0;

  const records = []; // { label, file, doc } for every valid record naming a real zone

  for (const file of files) {
    const label = `zones/${file}`;
    // readJson cannot distinguish "recorded a FAIL" from "parsed to a
    // JSON-falsy value" — a file holding literal `null` parses fine — so the
    // failure count, not the return value, is what says whether to continue.
    const before = failures.length;
    const doc = readJson(join(dir, file), label, fail);
    if (failures.length > before) continue;

    if (!validate(doc)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream rules assume a valid shape
    }

    // Z1 — the zone exists in the Cartographer's geography. This is also the
    // "no orphans" half of Z2. Unlike checkBestiaryPlacement's G1 this does
    // NOT continue: Z3/Z4/Z5/Z7 are purely intra-record, so bailing here would
    // hide real defects behind one typo. The orphan is FAILed and simply not
    // pushed into `records`, which withholds it from Z2, Z6 and the count.
    const known = zones.has(doc.zone);
    if (!known) fail(`${label}: zone "${doc.zone}" not in cluster1-geography.json#zones`);

    // Z3 — floors (design D4). Owned here, not by the schema: Ajv would emit
    // "/hazards must NOT have fewer than 2 items" and would reject the doc
    // before any other Z-rule could speak.
    for (const field of ["hazards", "resources", "landmarks"]) {
      if (doc[field].length < 2)
        fail(`${label}: zone "${doc.zone}" has ${doc[field].length} ${field}, needs at least 2`);
    }
    if (doc.reasonToGo.trim() === "")
      fail(`${label}: zone "${doc.zone}" has an empty reasonToGo`);

    // Z4 — ids kebab-case and unique WITHIN their own array. Uniqueness across
    // sibling ids is not expressible in draft-07 (uniqueItems compares whole
    // objects and would miss two hazards sharing an id but differing by one
    // word of description), so this rule owns it. "Within the array", not
    // within the file: one id string may legally appear in all three arrays.
    for (const [field, noun] of [["hazards", "hazard"], ["resources", "resource"], ["landmarks", "landmark"]]) {
      const arr = doc[field];
      for (const item of arr)
        if (!ZONE_ID_RE.test(item.id))
          fail(`${label}: ${noun} id "${item.id}" is not kebab-case`);
      for (const [id, group] of findDuplicateGroups(arr, (i) => i.id))
        fail(`${label}: duplicate ${noun} id "${id}" (${group.length} entries)`);
    }

    // Z5 — the optional `effect` binds an authored hazard to a runtime type.
    // A bad value is a FAIL; an ABSENT one is only a WARN (design D3), because
    // the Ashvale Front's defining hazard is an absence the engine cannot
    // express. That WARN is the accepted blind spot: a zone can be
    // content-complete with zero implementable hazards, so the ratio is
    // counted here and printed by finish() rather than swallowed.
    for (const h of doc.hazards) {
      zoneHazardsTotal++;
      if (h.effect === undefined) {
        zoneHazardsUnmapped++;
        warn(`${label}: hazard "${h.id}" has no effect — authored but not expressible at runtime`);
      } else if (!ZONE_HAZARD_EFFECTS.includes(h.effect)) {
        fail(`${label}: hazard "${h.id}" effect "${h.effect}" is not a runtime zoneHazards type (valid: ${ZONE_HAZARD_EFFECTS.join(", ")})`);
      }
    }

    // Z7 — resource kinds come from the closed enum.
    for (const r of doc.resources) {
      if (!ZONE_RESOURCE_KINDS.includes(r.kind))
        fail(`${label}: resource "${r.id}" kind "${r.kind}" is not a resource kind (valid: ${ZONE_RESOURCE_KINDS.join(", ")})`);
    }

    if (known) records.push({ label, file, doc });
  }

  // --- pass 2: the cross-file rules -----------------------------------------

  // Z2 — completeness, the direct analogue of the placement gate's G4. The
  // geography is the authority; every zone it declares must have exactly one
  // record. Missing = the pass is half-finished; duplicated = two files claim
  // the same ground. (An orphan was already FAILed by Z1 and is not here.)
  for (const [zone, group] of findDuplicateGroups(records, (r) => r.doc.zone))
    fail(`zones: zone "${zone}" has ${group.length} records (${group.map((r) => r.file).sort().join(", ")})`);

  // Iterates the geography, NOT the files: the whole point of Z2 is the zone
  // that was never written.
  const covered = new Set(records.map((r) => r.doc.zone));
  for (const id of zones.keys())
    if (!covered.has(id)) fail(`zones: geography zone "${id}" has no record in content/zones/`);

  // Z6 — distinctiveness (design D4/C5). Terrain is too coarse an axis to keep
  // ten zones apart — three of them are "river-country" — so identity is
  // enforced here rather than left to taste. Names compare trimmed and
  // case-insensitively: "The Adits" and "the adits" are the same landmark to a
  // player. Only a name spanning two DIFFERENT zones fires; a zone repeating a
  // name inside its own list is deliberately not covered by any Z-rule.
  const landmarkUses = [];
  for (const r of records)
    for (const l of r.doc.landmarks)
      landmarkUses.push({ zone: r.doc.zone, name: l.name, key: l.name.trim().toLowerCase() });
  for (const [, group] of findDuplicateGroups(landmarkUses, (u) => u.key)) {
    const shared = [...new Set(group.map((u) => u.zone))].sort();
    if (shared.length > 1)
      fail(`zones: landmark name "${group[0].name.trim()}" appears in zones ${shared.map((z) => `"${z}"`).join(", ")}`);
  }

  // Compared as a SET: deduped and sorted, so {stone,ore} is {ore,stone} and a
  // zone listing two resources of one kind has a one-element set.
  const kindSets = records.map((r) => ({
    zone: r.doc.zone,
    key: [...new Set(r.doc.resources.map((x) => x.kind))].sort().join(", "),
  }));
  for (const [key, group] of findDuplicateGroups(kindSets, (s) => s.key))
    fail(`zones: resource-kind set (${key}) is shared by zones ${group.map((s) => s.zone).sort().map((z) => `"${z}"`).join(", ")}`);

  return records.length;
}
```

- [ ] **Step 5: Write minimal implementation — patch C: `main()` and `finish()`.** **Anchor on text, not line numbers** — patches A1, A2 and B have all landed above `main()` by now, so any line number written before them is wrong. Find these two consecutive lines at the end of `main()`:

```js
  const placementCount = checkBestiaryPlacement(opts);
  return finish(sheetCount, mapCount, story.count, placementCount);
```

and replace them with:

```js
  const placementCount = checkBestiaryPlacement(opts);
  const zoneCount = checkZoneContent(opts);
  return finish(sheetCount, mapCount, story.count, placementCount, zoneCount);
```

Then find `function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0) {` and replace that function entirely (the WARN/FAIL loops and the exit rule are unchanged; only the 5th param and the two output additions are new):

```js
function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0, zoneCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  // I-060 design §7: Z5's WARN is an accepted blind spot, so the ratio it
  // measures is printed as its own line. The generic warning total conflates
  // it with character-coverage and story-orphan warns and is not that signal.
  //
  // GUARDED. A content root with no zone content has no ratio to report, and
  // `0 of 0` would print a measurement of a thing that was never measured onto
  // every fixture in check_content.test.mjs and bestiary-placement.test.mjs.
  // That is the opposite of the discipline the rest of this codebase keeps —
  // season1.mjs's buildRows returns `actual: null`, never 0, when nothing is
  // countable. Two tests pin this in both directions (ABSENT on the soft-skip
  // fixture, PRESENT on the ten-record fixture), so the guard cannot be
  // removed or inverted silently.
  if (zoneCount > 0 || zoneHazardsTotal > 0)
    console.log(`zone-content: ${zoneHazardsUnmapped} of ${zoneHazardsTotal} hazards have no runtime effect`);
  console.log(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${placementCount} placements, ${zoneCount} zones, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}
```

The `, ${zoneCount} zones` segment is **unguarded** — it appears on every root, including `0 zones`. That is deliberate and is what the two soft-skip tests assert on: a count of records found is answerable on any root, a ratio of hazards is not.

- [ ] **Step 6: Run test to verify it passes**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
```
Expected: `exit=0`, `ℹ fail 0`, and `ℹ pass` **≥ 247** — measured baseline `ℹ pass 191`, plus Task 1's thirteen, Task 3b's four and this task's thirty-nine (191 + 13 + 4 + 39 = 247). Anything below 247 means tests were dropped rather than added. **Every pre-existing suite must still be green** — `check_content.test.mjs` and `bestiary-placement.test.mjs` fixtures have no `content/zones`, so the soft-skip carries them, and the guarded `zone-content:` line means they gain no new output at all; no existing test asserts the whole summary line, only substrings such as `/1 placements/`.

- [ ] **Step 7: Verify against the real content root, in both modes** (no pipe, so `$?` is honest). The second command is the form **Gate 2 runs at ship** (`scripts/integration.sh:81`); this is the only step in the plan that exercises it before the release gate does, and it is what proves D3's warn-not-fail ruling survives `--require-complete`.
```bash
node scripts/check_content.mjs > /tmp/gate.out 2>&1; echo "exit=$?"; tail -3 /tmp/gate.out
grep -c 'has no effect' /tmp/gate.out; grep 'zone-content:' /tmp/gate.out
node scripts/check_content.mjs --require-complete > /tmp/gate-rc.out 2>&1; echo "rc exit=$?"; grep -c '^FAIL' /tmp/gate-rc.out; tail -2 /tmp/gate-rc.out
```
Expected — **four invariants, not four literals. No hazard census is written here in advance**, because no rule pins one: Z3 floors each zone at ≥2 hazards and says nothing about the total, so the only authority on the numbers is what **Task 3b Step 5's census one-liner actually printed** over the committed records.

1. `exit=0`, and the summary line ends `…, 10 zones, 0 failures, N warnings`. **`10 zones` and `0 failures` are the acceptance signal for Z2** — the ten records from Tasks 3a/3b satisfy it on the gate's first run.
2. A line matching `^zone-content: [0-9]+ of [0-9]+ hazards have no runtime effect`, whose two numbers **equal the `unmapped` and `total` recorded in Task 3b Step 5**. Its `M` is ≥ 20 (ten zones × the Z3 floor of two).
3. `grep -c 'has no effect'` equals that line's first number, and — since Z5 is the only new `warn()` — equals the summary's `N warnings` (today's baseline is `0 warnings`, so N is purely the zone WARNs).
4. `rc exit=0` with `grep -c '^FAIL'` printing `0` and the same `10 zones, 0 failures` summary: every unmapped hazard is still a **WARN** under `--require-complete`. `--require-complete` escalates in exactly two places (`checkStoryCoherence(…, requireComplete)` and the `opts.requireComplete ? fail : warn` at `check_content.mjs:609`, character-key coverage), neither of which touches Z5's plain `warn()` — that is a reason to expect this to pass, not a substitute for running it.

**If the numbers disagree with Task 3b Step 5, a record drifted after that step ran — re-run the census and fix the record. Never edit shipped world content to hit a number written into a plan in advance.**

- [ ] **Step 8: Commit**
```bash
git add scripts/check_content.mjs scripts/tests/zone-content.test.mjs
git commit -m "feat(gate): checkZoneContent Z1-Z7 for L2 zone content (I-060)"
```

- [ ] **Step 9: Independent adversarial review of this task's diff — TWO briefs, two fresh subagents, dispatched in parallel.** This is the heaviest task in the plan (~130 lines of new gate logic, a changed `finish()` signature and output shape, a renamed shared helper, ~40 tests), and it carries the review weight Task 6 gave up when it was folded into Task 5. One reviewer covering both halves is how a blast-radius defect gets missed behind a rules defect.

  **Brief A — the F-029 deletion test over Z1–Z7.** For each of Z1, Z2, Z3, Z4, Z5, Z6, Z7 in turn: delete the rule from `checkZoneContent()`, run `npm test --prefix scripts`, and confirm **at least one test goes red**; restore it before the next. A rule whose deletion leaves the suite green is untested and the review fails. Also: is the soft-skip two-stage (dir, then files)? Is `compileSchema` called *after* both guards? Does Z1 avoid `continue`? Does Z2's coverage half iterate `zones.keys()` and not the files? Does Z6 dedupe **and** sort? Are all message strings byte-identical to the Interfaces table above? Do the two `(valid: …)` drift tests parse the **gate's** output rather than re-asserting a constant against itself?

  **Brief B — `finish()` / `main()` / `loadGeographyZones` blast radius.** Everything that consumes the gate's output or the renamed helper: (a) grep `scripts/tests/check_content.test.mjs` and `scripts/tests/bestiary-placement.test.mjs` for any assertion on the whole summary line, an output **line count**, `split("\n")`, `.at(-1)`, or a `doesNotMatch` broad enough to catch the new segment — **this was true when the plan was written (only substring matches such as `/1 placements/`, plus one `doesNotMatch(r.out, /FAIL/)` at `check_content.test.mjs:230`) and must be re-checked against the tree as it now stands, not taken from this sentence**; (b) confirm the guarded `zone-content:` line is genuinely absent on a zone-less root and that both polarity tests exist; (c) confirm the 5th positional parameter defaults to `0` so any caller passing four arguments still works; (d) confirm `readGeographyZones`'s body is byte-identical to the pre-rename `loadGeographyZones` and that **every** call site still resolves — `grep -n 'GeographyZones' scripts/check_content.mjs` must show exactly the wrapper, the renamed definition, and the two checkers' calls; (e) confirm nothing outside `scripts/check_content.mjs` referenced `loadGeographyZones` before the rename (`grep -rn 'loadGeographyZones' scripts/`).

- [ ] **Step 10: Refactor on the findings.**

- [ ] **Step 11: Re-verify** — re-run Steps 6 and 7, paste real output. New commit.

---

## Task 5: The budget measure, the documents that assert it is blocked, and backlog hygiene

**Files:**
- Modify: `scripts/lib/season1.mjs`
- Modify: `content/season-1-budget.json`
- Modify (test): `scripts/tests/season1.test.mjs`
- Create: `scripts/tests/fixtures/season1/content/zones/{zone-emberdown,zone-thornveil,zone-hollowmarch,zone-cindervast,zone-emberdown-second-file,notes}.json`
- Modify: `docs/worldbuilding/DR-003-season-1-budget.md`
- Modify: `content/story/canon.md`
- Modify (Task 6, folded in — see below): `docs/worldbuilding/idea-map.md`, `.claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/research.md`, `.claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/plan.md`

**Task 6 rides in this task's commit.** Task 6 is documentation hygiene with no consumer — it produces nothing any other task reads — and a separate five-step review gate for two H1 rewrites and one table cell is review weight spent in the wrong place. It stays a numbered task below so its content is written out in full, but its steps are executed inside this task: its edits land in Step 8's commit, and its review is the single self-check line added to Step 9's brief. The weight this frees is reallocated to Task 4, whose review is split into two parallel briefs.

**Interfaces:**
- **Consumes:** `content/zones/zone-<id>.json` (Task 3); the private `readJsonAt(root, rel)` helper already in `season1.mjs`; `buildRows(budget, root)` and `renderTable(rows)`, already exported.
- **Produces:** `export function zones(root) -> number` — the count of **distinct** `doc.zone` values whose record clears the Z3 floors. Registered as `MEASURES.zones`, consumed by `buildRows` via `content/season-1-budget.json`'s `"measure": "zones"`.
- **Contract to honour, all three verified by execution:**
  1. `buildRows` short-circuits on `blockedBy` **before** looking at `measure` — a line with both returns `note: "blocked: …"`. And `season1.test.mjs`'s envelope test asserts `measured !== blocked`. **`blockedBy` must be deleted, not accompanied.**
  2. `buildRows` returns `{ ...line, actual, note }` with the computed note spread **last** — an authored `note` key in the JSON is silently destroyed. **The caveat goes in `source`.**
  3. Measures **throw** on shape violations (`<file>: expected <shape>`); `buildRows` catches and renders `unmeasurable: <message>`, so the report still exits 0. This is the library's discipline — **not** `check_content.mjs`'s `fail()`/failure-count discipline. Do not mix them.

Steps:

- [ ] **Step 1: Write the failing test** — create the six fixture files under `scripts/tests/fixtures/season1/content/zones/` (2 complete: `emberdown`, `thornveil`; 1 short a hazard: `hollowmarch`; 1 with `"reasonToGo": "   "`: `cindervast`; 1 complete duplicate of emberdown: `zone-emberdown-second-file.json`; 1 non-record: `notes.json` holding `["not a zone record; the zone-<id>.json filter must skip this file entirely"]`). Then append to `scripts/tests/season1.test.mjs` the block below.

**THREE import lines, seven new bindings — count them before running anything.** `scripts/tests/season1.test.mjs` today imports only `{ test }`, `assert`, `{ readFileSync } from "node:fs"`, `{ join, resolve, dirname } from "node:path"` and `{ fileURLToPath } from "node:url"` — **nothing from `node:os` or `node:child_process`, and no `writeFileSync` anywhere**. The block below needs all three modules:

- `writeFileSync` and `tmpdir` are both called inside `zoneRoot()`. Leave either unbound and three of the nine new tests — including the 10/10 report row that is spec §17's acceptance signal for Deliverable 5 — throw `ReferenceError` before a single assertion runs.
- `execFileSync` is called by the gate/measure filename-agreement test at the end of the block, which spawns the real gate binary.

A second `import … from "node:fs"` with disjoint names is legal ESM and does not disturb the existing `readFileSync` import. None of the seven names collides with anything already bound in the file.

```js
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// I-060: the zones measure. Ids come from the geography rather than a literal
// list, so a change to the ten cannot silently pass this file.
const GEOGRAPHY_ZONE_IDS = JSON.parse(
  readFileSync(join(ROOT, "content/maps/cluster1-geography.json"), "utf8"),
).zones.map((z) => z.id);

/** A Z3-complete record: two hazards, two resources, two landmarks, a reason. */
const completeRecord = (zone) => ({
  zone,
  reasonToGo: `why anyone walks into ${zone}`,
  hazards: [{ id: "h-one" }, { id: "h-two" }],
  resources: [{ id: "r-one" }, { id: "r-two" }],
  landmarks: [{ id: "l-one" }, { id: "l-two" }],
});

/** Throwaway root holding exactly the given content/zones files. */
function zoneRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "season1-zones-"));
  mkdirSync(join(root, "content/zones"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(root, "content/zones", name), JSON.stringify(body));
  }
  return root;
}

test("zones counts only records clearing the Z3 floors, once per zone", () => {
  // The fixture holds five zone-*.json files: emberdown and thornveil are
  // complete; hollowmarch has one hazard; cindervast's reasonToGo is blank
  // whitespace; zone-emberdown-second-file.json is a complete DUPLICATE of
  // emberdown. Two distinct zones clear the floors.
  assert.equal(MEASURES.zones(FIXTURE), 2);
});

test("zones ignores files that are not named zone-<id>.json", () => {
  // notes.json sits in the same directory and is a top-level array — it would
  // throw the shape error if the filename filter were dropped, so this test
  // fails loudly rather than silently if the regex is loosened.
  assert.ok(existsSync(join(FIXTURE, "content/zones/notes.json")));
  assert.equal(MEASURES.zones(FIXTURE), 2);
});

test("zones throws on a zone file that is not a record object", () => {
  const root = zoneRoot({ "zone-thornveil.json": ["not", "an", "object"] });
  try {
    assert.throws(() => MEASURES.zones(root), /zone-thornveil\.json: expected a zone record object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("zones throws on a record with no zone id — identity is what it counts by", () => {
  const root = zoneRoot({ "zone-thornveil.json": { reasonToGo: "x", hazards: [], resources: [], landmarks: [] } });
  try {
    assert.throws(() => MEASURES.zones(root), /zone-thornveil\.json: expected a non-empty string "zone"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildRows reports a missing content/zones as unmeasurable, never a crash", () => {
  // The report's always-exits-0 contract has to hold for the new measure too:
  // zones() throws ENOENT when content/zones is absent, and buildRows absorbs it.
  const doc = { lines: [{ id: "zones", label: "Z", target: 10, measure: "zones", source: "s" }] };
  const [row] = buildRows(doc, join(ROOT, "scripts/tests/fixtures/does-not-exist"));
  assert.equal(row.actual, null);
  assert.match(row.note, /^unmeasurable: ENOENT/);
});

test("the budget's zones line is measured, not blocked, and states what it counts", () => {
  const line = budget.lines.find((l) => l.id === "zones");
  assert.equal(line.measure, "zones");
  assert.equal(line.blockedBy, undefined);
  // Design §8: the premise is REWRITTEN, not silently dropped. The source must
  // say what the count is keyed on, and that the keyspace rename is still owed.
  assert.match(line.source, /geography zone id/);
  assert.match(line.source, /I-056 item 4/);
});

test("no budget line carries a note key — buildRows computes note and would clobber it", () => {
  // Verified against buildRows: `{ ...line, actual, note }` puts the computed
  // note last, so an authored note in the JSON never reaches the report. Any
  // caveat belongs in `source`, which survives the spread.
  for (const line of budget.lines) {
    assert.equal(line.note, undefined, `${line.id}: put the caveat in source, not note`);
  }
});

// The record-filename regex is written TWICE — `ZONE_FILE` in scripts/lib/
// season1.mjs and an inline `/^zone-.+\.json$/` in checkZoneContent() — and
// nothing structurally binds them. Widening one to `zones-*.json`, or narrowing
// one to demand kebab-case, would make the gate and the budget count different
// file sets, and the divergence would not be visible from the two numbers
// (the gate reports records.length, the measure reports floor-passing distinct
// zone ids). This test is the binding: one directory, four filenames chosen to
// sit on every edge of the pattern, and both implementations must agree that
// exactly ONE of them is a record.
test("the gate and the zones measure agree on which filenames are records", () => {
  const root = mkdtempSync(join(tmpdir(), "season1-filter-"));
  try {
    mkdirSync(join(root, "content/schemas"), { recursive: true });
    mkdirSync(join(root, "content/maps"), { recursive: true });
    mkdirSync(join(root, "content/zones"), { recursive: true });
    // The same three schemas Task 4's fixture() copies, plus the geography:
    // checkZoneContent needs zone-content.schema.json and the geography, and
    // copying character/map schemas keeps the unrelated checkers on a fixture
    // rather than half-reading the real tree.
    for (const rel of [
      "content/schemas/zone-content.schema.json",
      "content/schemas/character.schema.json",
      "content/schemas/map.schema.json",
      "content/maps/cluster1-geography.json",
    ]) writeFileSync(join(root, rel), readFileSync(join(ROOT, rel), "utf8"));

    // `zone-emberdown.json` is the ONLY record. The other three sit one
    // character off the pattern on three different sides: no hyphen, a plural
    // stem, and no `zone` stem at all.
    const record = completeRecord("emberdown");
    record.hazards = [{ id: "h-one", name: "H one", description: "d", effect: "burn" },
                      { id: "h-two", name: "H two", description: "d", effect: "poison" }];
    record.resources = [{ id: "r-one", name: "R one", kind: "fuel", description: "d" },
                        { id: "r-two", name: "R two", kind: "crop", description: "d" }];
    record.landmarks = [{ id: "l-one", name: "L one", description: "d" },
                        { id: "l-two", name: "L two", description: "d" }];
    const decoy = ["not a zone record; both filename filters must skip this file"];
    writeFileSync(join(root, "content/zones/zone-emberdown.json"), JSON.stringify(record));
    writeFileSync(join(root, "content/zones/zone.json"), JSON.stringify(decoy));
    writeFileSync(join(root, "content/zones/zones-x.json"), JSON.stringify(decoy));
    writeFileSync(join(root, "content/zones/notes.json"), JSON.stringify(decoy));

    // The measure: one record, and no throw — a throw here would mean one of
    // the three decoys got through the filter and hit the shape check.
    assert.equal(MEASURES.zones(root), 1);

    // The gate over the SAME directory. It exits 1 (nine geography zones have
    // no record, and this root ships no characters or story), which is
    // irrelevant — the assertion is on the `N zones` count, which is
    // checkZoneContent()'s own view of how many files were records.
    let out;
    try {
      out = execFileSync(process.execPath, [
        join(ROOT, "scripts/check_content.mjs"),
        "--content-root", join(root, "content"),
      ], { encoding: "utf8" });
    } catch (e) {
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.match(out, /, 1 zones,/, `the gate must see exactly one record too:\n${out}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the report's zones row reads 10/10 met once all ten records clear the floors", () => {
  const root = zoneRoot(
    Object.fromEntries(GEOGRAPHY_ZONE_IDS.map((id) => [`zone-${id}.json`, completeRecord(id)])),
  );
  try {
    const row = buildRows(budget, root).find((r) => r.id === "zones");
    assert.equal(row.actual, 10);
    assert.equal(row.note, "met");
    assert.equal(
      renderTable([row]).split("\n").at(-1),
      "zones                     10      10      met",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
grep -E "^✖" /tmp/t.out; grep -B1 -A6 "zones counts only records" /tmp/t.out | head -25
```
Expected: `exit=1` with a non-zero `ℹ fail`, and `✖` lines for the new `season1.test.mjs` tests. **The imports resolve first** — with all seven bindings in place the module loads cleanly and every failure below is the real, intended one, not a `ReferenceError: writeFileSync is not defined` at the first `zoneRoot()` call. If any `✖` carries a `ReferenceError`, an import was dropped: fix that before reading anything else in this output.

The named failures:
- `✖ zones counts only records clearing the Z3 floors, once per zone` — `TypeError: MEASURES.zones is not a function` (the export does not exist yet).
- `✖ zones ignores files that are not named zone-<id>.json`, `✖ zones throws on a zone file that is not a record object`, `✖ zones throws on a record with no zone id — identity is what it counts by` — same `TypeError`, each raised through `assert.throws`/`assert.equal` on the missing export.
- `✖ the budget's zones line is measured, not blocked, and states what it counts` — `Expected values to be strictly equal: undefined !== 'zones'` (the line still carries `blockedBy`, not `measure`).
- `✖ buildRows reports a missing content/zones as unmeasurable, never a crash` — `buildRows` renders `unknown measure: zones`, so `row.note` does not match `/^unmeasurable: ENOENT/`.
- `✖ the gate and the zones measure agree on which filenames are records` — `TypeError` on `MEASURES.zones`; it fails **before** the gate is spawned, so nothing in this run depends on Task 4 having landed.
- `✖ the report's zones row reads 10/10 met once all ten records clear the floors` — same `TypeError`.
- `✔ no budget line carries a note key` is **green from the start**: it reads only the committed budget, which has never carried a `note` key. That is correct — it is a regression guard, not a red-green test.

- [ ] **Step 3: Write minimal implementation — `scripts/lib/season1.mjs`, three edits.**

Edit 1 — anchor on the text, not the line number: replace `import { readFileSync } from "node:fs";` with `import { readFileSync, readdirSync } from "node:fs";`. (It is the file's first import; `join` on the next line is already imported and is not touched.)

Edit 2, insert after `bestiaryArt()` and before `MEASURES`:

```js
// I-060: only files named zone-<something>.json are records. A README, a
// schema copy or an editor scratch file sharing the directory is not a zone
// and must not be counted as one.
const ZONE_FILE = /^zone-.+\.json$/;

/**
 * Zone content records that clear the Z3 floors of the L2 zone-content design
 * (docs/superpowers/specs/2026-08-08-l2-zone-content-design.md §7): at least
 * two hazards, at least two resources, at least two landmarks, and a
 * non-blank reasonToGo. Counts DISTINCT `zone` ids, so two files claiming the
 * same zone can never read as two of the ten.
 *
 * Keyed on the geography zone id ("emberdown"), NOT on a runtime region-* id.
 * That keying is what makes the line measurable at all, and it does not stand
 * in for the X12 keyspace rename (I-056 item 4), which is still owed.
 *
 * It deliberately does NOT enforce the other Z-rules: that the zone exists in
 * cluster1-geography.json (Z1), that all ten are present (Z2), kebab-case ids
 * (Z4), a hazard `effect` that maps to a runtime type (Z5), landmark-name and
 * resource-kind distinctiveness across zones (Z6), or the resource kind enum
 * (Z7). Those belong to checkZoneContent() in scripts/check_content.mjs — a
 * counter that also gates reports a number nobody can reproduce by reading
 * the files.
 */
export function zones(root) {
  const dir = join(root, "content/zones");
  const complete = new Set();
  for (const file of readdirSync(dir).filter((f) => ZONE_FILE.test(f)).sort()) {
    const rel = `content/zones/${file}`;
    const doc = readJsonAt(root, rel);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc))
      throw new Error(`${rel}: expected a zone record object`);
    if (typeof doc.zone !== "string" || doc.zone === "")
      throw new Error(`${rel}: expected a non-empty string "zone"`);
    const meetsFloor = (v) => Array.isArray(v) && v.length >= 2;
    if (
      typeof doc.reasonToGo === "string" &&
      doc.reasonToGo.trim() !== "" &&
      meetsFloor(doc.hazards) &&
      meetsFloor(doc.resources) &&
      meetsFloor(doc.landmarks)
    )
      complete.add(doc.zone);
  }
  return complete.size;
}
```

Edit 3: `export const MEASURES = { mobBases, bestiaryDesigns, actIndependentQuests, townArt, bestiaryArt, zones };`

- [ ] **Step 4: Write minimal implementation — the budget line.** In `content/season-1-budget.json`, find the object whose `"id"` is `"zones"` — its five body lines are `"id"`, `"label": "Cluster-1 zones carrying a region id"`, `"target": 10`, `"blockedBy": "P1 - keyspace unification; …"`, `"source": "A1-geography-cluster1.md 4.2"` — and replace that whole object with:

```json
    {
      "id": "zones",
      "label": "Cluster-1 zones with a complete content record",
      "target": 10,
      "measure": "zones",
      "source": "A1-geography-cluster1.md 4.2; counts content/zones/zone-<id>.json records passing the Z3 floors, keyed on the geography zone id (emberdown) rather than a runtime region-* id; the X12 region-* keyspace rename (I-056 item 4) remains separately owed"
    },
```
(`blockedBy` is deleted; its premise is relocated into `source`, which is what design §8's "rewrite the premise, do not silently drop the field" requires. Budget `source` strings are plain ASCII — no `§`, no `×`, no em dashes.)

- [ ] **Step 5: Run test to verify it passes**
```bash
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out
node scripts/report_season1.mjs
```
Expected: `exit=0` and `ℹ fail 0` from the suite, and the report's zones row reads exactly `zones                     10      10      met` (5 chars + 21 spaces + `10` + 6 spaces + `10` + 6 spaces + `met`; `renderTable`'s `idWidth` is `Math.max(26, …)` and the longest id `quests-act-independent` is 24, so no other row shifts).

- [ ] **Step 6: Fix the downstream documents that now assert something false** — this is not scope creep, it is `canon.md` §6's same-commit contradiction rule.

**`docs/worldbuilding/DR-003-season-1-budget.md` — FIVE places, not three; six edits, because place 3 is a sentence and the bullet under it.** The draft named three; a grep of the real file finds five, and two of the five are the ones the naive verification grep cannot see. Each is quoted below by its text, with the exact rewrite. (Line numbers are given only as a search hint and will drift as the earlier edits land — match on the text.)

  1. **The §0 "Parent records resolved" callout** (~line 9). It currently ends:
     > `zones` stays blocked — see `I-056` §6.1: it needs the `region-*` keyspace rename *and* a `zones` measure function, which `scripts/lib/season1.mjs` does not have.

     **Both halves become false in this commit** — the measure function now exists, and the line is measured. Replace that sentence with:
     > `zones` is no longer blocked: `scripts/lib/season1.mjs` now exports a `zones` measure and the line reports **10/10 met**, counted on the geography zone id. The `region-*` keyspace rename (`I-056` §6.1, item 4) is still separately owed and still blocks quest-region authoring.

  2. **The §3 table row** (~line 62). Currently:
     > `| `zones` — cluster-1 zones carrying a region id | **10** | — *(blocked)* | — | `A1-geography-cluster1.md` §4.2 |`

     The label is also wrong now — the line does not count region ids. Replace the whole row with:
     > `| `zones` — cluster-1 zones with a complete content record | **10** | 10 | met | `A1-geography-cluster1.md` §4.2; counted by `scripts/lib/season1.mjs`'s `zones` measure over `content/zones/`, keyed on the geography zone id |`

  3. **The "three blocked lines" sentence** (~lines 66-67). Currently opens *"**The three blocked lines report no actual because nothing countable exists yet…**"*. It is now **two**. Replace `The three blocked lines` with `The two blocked lines` — the rest of the sentence stands.

  4. **The `zones` bullet under that sentence** (~line 69). Currently:
     > `- `zones` — blocked by **P1**, keyspace unification. A1's ten zones have no `region-*` ids yet.`

     **Delete this bullet entirely.** The list then holds exactly two bullets — `spawn-entries` and `world-state-systems` — matching the rewritten count in item 3. Do not leave it in a rewritten form: a bullet under "the blocked lines" describing a measured line is the same contradiction in a new sentence.

  5. **The verbatim report block** (~line 104). Currently:
     > `zones                     10      -       blocked: P1 - keyspace unification; A1's ten zones have no region-* ids yet`

     This block is a paste of `report_season1.mjs`'s real output, so paste the **real** new row — take it from Step 5's `node scripts/report_season1.mjs` run, do not retype it. It is:
     > `zones                     10      10      met`

  6. **The P1 blocker-table consequence cell** (~line 136). Currently:
     > The `zones` line cannot be measured at all, and no quest can be written into a zone that has no `region-*` id.

     Only the second half survives. Replace the cell with:
     > No quest can be written into a zone that has no `region-*` id. (The `zones` budget line no longer depends on this: it is measured on the geography zone id.)

     **This is the one the draft's verification grep structurally could not catch** — the sentence contains "zones" but never the word "blocked", so `grep "blocked" | grep -i zones` skips it. Step 7 greps for it by its own phrasing.

**`content/story/canon.md`, §6.1 Keyspace register**, the "Open, not resolved:" paragraph — the sentence *"Until that rename lands, content/season-1-budget.json's zones line stays blockedBy and reports as blocked rather than measured."* Rewrite it to say the line is now measured on the geography zone id and that the X12 rename is still owed. **Cite by section heading, never by line number.**

  **Prefer a same-line-count rewrite of that two-sentence claim.** Reflowing the paragraph shifts every line number below it in a file other artifacts cite by line — this repo has been bitten by exactly that **three** times. If the rewrite does change the line count, Step 7b's citation-repair grep is mandatory, not optional.

  > **Run Step 7b's `before` grep now, before touching `canon.md`.** It is written as Step 7b because that is where its `after` half and its diff live, but its baseline capture has to happen here — there is no way to reconstruct it once the file has moved.

- [ ] **Step 7: Verify the downstream fixes.** The first grep is deliberately wider than "blocked" — a grep whose pattern is the word the document happens to use is a coverage claim, not a check, and it is exactly what let the P1 row through the draft.

```bash
# Every line in DR-003 that mentions zones AND any blocked-ness phrasing.
grep -n -iE "zones" docs/worldbuilding/DR-003-season-1-budget.md \
  | grep -iE "block|cannot be measured|no zones measure|region-\*|does not have"
# The two phrasings that escape the word "blocked" entirely.
grep -n "cannot be measured" docs/worldbuilding/DR-003-season-1-budget.md
grep -n "three blocked lines" docs/worldbuilding/DR-003-season-1-budget.md
grep -n "blockedBy" content/story/canon.md
node scripts/report_season1.mjs
node scripts/check_content.mjs > /tmp/gate.out 2>&1; echo "exit=$?"; tail -3 /tmp/gate.out
```
Expected:
- The **first** grep returns only lines that describe the `zones` line as **measured** — i.e. the rewritten §0 callout sentence and the rewritten P1 cell, both of which legitimately still mention `region-*` because the rename is still owed. **No line may still call the `zones` line blocked, unmeasurable, or absent from `season1.mjs`.** If a line does, it is one of the five and it was missed.
- The **second and third** greps return **nothing**.
- The fourth grep returns nothing (`blockedBy` is gone from `canon.md`'s prose as well as from the budget JSON).
- The report shows `zones 10 10 met`; the gate exits 0 with `10 zones, 0 failures`.

- [ ] **Step 7b: Repair any `canon.md` line citation the §6.1 rewrite moved.** Non-optional, and it must be run **twice** — once before the Step 6 edit to capture the baseline, once after. This repo has had three separate incidents of citations rotting because a paragraph in `canon.md` was rewritten and every pointer below it silently shifted.
```bash
# BEFORE the canon.md edit — capture the baseline.
grep -rn 'canon\.md:[0-9]' docs/ content/ .claude/ scripts/ > /tmp/canon-cites-before.out 2>&1; cat /tmp/canon-cites-before.out
# ... make the Step 6 canon.md edit ...
# AFTER — same command, then diff the two.
grep -rn 'canon\.md:[0-9]' docs/ content/ .claude/ scripts/ > /tmp/canon-cites-after.out 2>&1
diff /tmp/canon-cites-before.out /tmp/canon-cites-after.out; echo "citation-set diff exit=$?"
# Confirm the line count did not move at all — the cheapest possible proof.
git diff --numstat content/story/canon.md
```
Expected: `citation-set diff exit=0` (the citing lines themselves are unchanged), **and** `git diff --numstat` shows equal added and deleted counts for `canon.md`, proving a same-line-count rewrite so no citation target moved. If the counts differ, open every path printed by the `before` grep, check whether its cited line number still lands on the text it names, and repair the ones that moved **in this same commit**.

- [ ] **Step 7c: Do Task 6's edits now** — Task 6 is folded into this commit (see this task's Files block). Execute Task 6's Steps 1–3 below in full, then come back here. They touch `docs/worldbuilding/idea-map.md` and the two backlog files, and nothing in this task's suite reads them.

- [ ] **Step 8: Commit** — one commit covering the measure, the budget line, the downstream documents and the folded backlog hygiene.
```bash
git add scripts/lib/season1.mjs scripts/tests/season1.test.mjs scripts/tests/fixtures/season1 content/season-1-budget.json docs/worldbuilding/DR-003-season-1-budget.md docs/worldbuilding/idea-map.md content/story/canon.md .claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1
git commit -m "feat(budget): zones measure unblocks the season-1 zones line (I-060)"
```

- [ ] **Step 9: Independent adversarial review of this task's diff.** Fresh subagent. Must check: `blockedBy` deleted rather than accompanied; no authored `note` key anywhere in the budget; `zones()` counts a **Set** of `doc.zone`, not files; the measure does not re-implement any Z-rule; `season1.mjs` not reflowed by prettier; the `canon.md` edit cites by heading not line number and changed the file's line count by zero; **all five** DR-003 places rewritten, with nothing left saying "three blocked lines" or "cannot be measured"; the `season1.test.mjs` import block binds all seven new names and the file has no unbound identifier; the gate/measure filename-agreement test really spawns the gate rather than asserting a regex against itself.

  **Plus one line, the folded Task 6 self-check** (documentation hygiene, no consumer, so it gets a self-check rather than its own review pass): re-run Task 6 Step 3's grep and confirm that (a) no H1 still promises alternates, (b) `idea-map.md`'s I-060 row no longer promises them either, and (c) `spec.md`'s D1 decision paragraph is still intact and untouched — `grep -c "has been corrected" .claude/idea_backlog/I-060-*/spec.md` must still return `1`.

- [ ] **Step 10: Refactor on the findings.**

- [ ] **Step 11: Re-verify** — re-run Steps 7, 7b and Task 6's Step 3 grep, paste real output. New commit.

---

## Task 6: Backlog hygiene — deliverable 8 (executed inside Task 5, at its Step 7c)

**Files:**
- Modify: `docs/worldbuilding/idea-map.md` — the I-060 row's Output-artifact cell
- Modify: `.claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/research.md`
- Modify: `.claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/plan.md`
- **Not modified:** `.claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/spec.md`

**No separate commit and no separate review.** This is documentation hygiene with no consumer — it produces nothing any other task reads — so per the review-weight rule it is executed at **Task 5 Step 7c**, committed in Task 5 Step 8, and reviewed by the one-line self-check appended to Task 5 Step 9. The steps below are still written out in full because the content of the edits is not obvious.

**Interfaces:**
- **Consumes:** design §0 D1.
- **Produces:** nothing any other task reads.
- **`spec.md` is already correct — do not "fix" it.** Deliverable 8 in spec §14 names `.claude/idea_backlog/I-060-*/spec.md`, and a reviewer checking §14 row 8 against the task list will find that file in no task's Files block. That is deliberate: **its frontmatter `title:` and its §0 danger callout both already record D1 in the committed repo (verified).** The callout contains the sentence *"The original title of this idea was wrong and has been corrected."* — **that paragraph is the record of the decision and must survive this task untouched.** This task extends the correction to `research.md` and `plan.md`, which still carry the pre-D1 H1, and to `idea-map.md`, which the design's own D1 callout quotes as the second carrier of the retracted promise.

Steps:

- [ ] **Step 1: Write the failing check** — three files still carry the pre-D1 promise:
```bash
grep -rn -i "alternate" .claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/
grep -n "I-060" docs/worldbuilding/idea-map.md
```
Expected before the fix:
- hits on `research.md:1` and `plan.md:1` — both H1 headings end *"… the Systems Designer's three-zones-per-band model needs alternates, cluster 1 currently ships one route with no branches"*;
- hits inside `spec.md`'s §0 danger callout that already **correctly** record D1 — **leave every one of them alone**; they are the record of the decision, not the stale promise. (Match them by the text *"The original title of this idea was wrong and has been corrected."*, never by line number — line citations into this file rot.)
- the `idea-map.md` I-060 row, whose Output-artifact cell still reads `per-zone content spec; alternates for the single route cluster 1 currently ships`.

- [ ] **Step 2a: Correct the two backlog headings** so they match `spec.md`'s title and D1's ruling — drop the "needs alternates / ships one route with no branches" clause from the H1 of `research.md` and `plan.md`, leaving:
  - `research.md`: `# L2 zone content pass: for each cluster-1 zone define hazards, harvestable resources, landmarks and the reason a player goes there — research notes`
  - `plan.md`: `# L2 zone content pass: for each cluster-1 zone define hazards, harvestable resources, landmarks and the reason a player goes there — plan placeholder`

  Then add one line under each H1, pointing at design §0 D1: *"Alternates are designed on paper only in `docs/worldbuilding/A2-zones-cluster1.md` § alternates; they are never minted as zones and never counted by the budget (D1)."*

- [ ] **Step 2b: Correct the `idea-map.md` I-060 row.** `docs/worldbuilding/idea-map.md` is the register that indexes every idea, it is a `docs/worldbuilding` artifact squarely inside the same-commit contradiction rule, and the design's D1 callout names it explicitly as the second carrier. Find the row beginning `| **I-060** |` and replace **only its Output-artifact cell** — the fifth column — leaving the Idea, What-it-is, Goal, Input and Level columns and the table's pipe alignment intact. From:

  > `per-zone content spec; alternates for the single route cluster 1 currently ships`

  to:

  > `per-zone content records + A2-zones-cluster1.md; alternates designed on paper only, routed to cluster 2 per A1 §4.4 (D1)`

- [ ] **Step 3: Verify**
```bash
grep -rn -i "alternate" .claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/ docs/worldbuilding/idea-map.md
grep -c "has been corrected" .claude/idea_backlog/I-060-l2-zone-content-pass-for-each-cluster-1/spec.md
```
Expected:
- the first grep's hits are **only**: `spec.md`'s D1 paragraph (unchanged), the two new pointer lines under the corrected H1s, and `idea-map.md`'s rewritten cell — which now says alternates are paper-only and routed to cluster 2. **No H1, and no register row, still promises alternates as a deliverable of I-060.**
- the second grep returns exactly **`1`** — proof that `spec.md`'s decision record survived intact and was not swept up while removing the stale promise elsewhere.

- [ ] **Step 4: Return to Task 5 Step 8** and commit these edits with the measure. There is no separate commit, no separate review subagent and no separate re-verify for this task; Task 5's Step 9 self-check and Step 11 re-verify cover it.

---

## Verification

Four acceptance commands come from spec §17 — `npm install`, `npm test`, `check_content.mjs`, `report_season1.mjs`. A fifth is added here: `check_content.mjs --require-complete`, the Gate 2 form that spec §17 omits and that `scripts/integration.sh:81` will run at ship. Run them all, in order, from the repo root. Each is written in the redirect-then-read form so **no command pipes into anything whose `$?` is then read**; the bare `grep` on the line after `npm test` reads that redirected file and is not part of the acceptance set. **Every line below uses `--prefix scripts` and never `cd scripts`** — a bare `cd` persists for the rest of the block, and the four lines after it are all repo-root-relative (`node scripts/…`), which would die with `MODULE_NOT_FOUND` from inside `scripts/`. Measured from the repo root on this worktree: `npm test --prefix scripts` gives `exit=0`, `ℹ tests 191`, `ℹ pass 191`, `ℹ fail 0` and leaves the cwd unchanged.

```bash
npm install --prefix scripts                                           # fresh worktrees have no scripts/node_modules
npm test --prefix scripts > /tmp/t.out 2>&1; echo "exit=$?"            # NOT `node --test scripts/tests/` — broken on Node 26
grep -E "^ℹ (tests|pass|fail)" /tmp/t.out                              # the runner emits the SPEC reporter, never TAP
node scripts/check_content.mjs > /tmp/gate.out 2>&1; echo "exit=$?"; tail -3 /tmp/gate.out
node scripts/report_season1.mjs                                        # zones line must read 10/10, not blocked
node scripts/check_content.mjs --require-complete > /tmp/gate-rc.out 2>&1; echo "exit=$?"; tail -2 /tmp/gate-rc.out
```

**What each must print:**

| Command | Required output |
| --- | --- |
| `npm install --prefix scripts` | Completes with exit 0. `ajv` and `js-yaml` resolvable under `scripts/node_modules`. Runs from the repo root and leaves the cwd there. |
| `npm test --prefix scripts` | `exit=0`, and **`ℹ fail 0`** in the marker lines. Measured baseline was **`ℹ tests 191` / `ℹ pass 191` / `ℹ fail 0`**; this plan adds **65** tests — **56 in `zone-content.test.mjs`** (Task 1's 13 + Task 3b's 4 + Task 4's 39) and **9 in `season1.test.mjs`** — so expect **`ℹ pass 256`**, with **`≥ 256`** as the floor. A count below 256 means tests were dropped, not that the suite is green. There are **no** `# pass` / `# fail` / `not ok` lines to look for — this runner emits the spec reporter (`ℹ`, `✔`, `✖`) even when redirected. **Every pre-existing suite still green** — the soft-skip is what protects `check_content.test.mjs` and `bestiary-placement.test.mjs`, whose fixtures have no `content/zones`. |
| `node scripts/check_content.mjs` | `exit=0`, and **four invariants, not four literals** — no hazard-census number is hard-coded here, because no rule pins one (Z3's floor is ≥2 per zone; the total is whatever Task 3 authored):<br>1. the summary line contains **`10 zones, 0 failures`** — this is the Z2 completeness proof;<br>2. a line matches **`^zone-content: [0-9]+ of [0-9]+ hazards have no runtime effect`**, with the second number (the total) **≥ 20** (ten zones × the Z3 floor of two);<br>3. **zero** lines beginning `FAIL`;<br>4. the first number in that `zone-content:` line equals the count of `WARN  zones/…: hazard "…" has no effect` lines, and equals the `N warnings` figure in the summary minus any non-zone warnings. Check with `grep -c 'has no effect' /tmp/gate.out` against `grep 'zone-content:' /tmp/gate.out`.<br>**Record the actual `N of M` from this run into the task evidence — do not edit shipped world content to hit a number written in advance.** |
| `node scripts/report_season1.mjs` | exit 0, and the `zones` row reads byte-exactly:<br>`zones                     10      10      met`<br>— no `blocked:`, no `unmeasurable:`, no `unknown measure:`. |
| `node scripts/check_content.mjs --require-complete` | `exit=0`, with the same `10 zones, 0 failures` summary. This is the form **Gate 2 (`scripts/integration.sh:81`) runs at ship**, and it is the only evidence that D3's warn-not-fail ruling survives it: every zone hazard with no `effect` must still print as **`WARN`**, never `FAIL`. Confirm with `grep -c '^FAIL' /tmp/gate-rc.out` → `0`. |

**Acceptance (spec §17):** the scripts suite green with the new zone-content tests; `check_content.mjs` reporting ten zone records and zero failures; `report_season1.mjs` scoring `zones 10 10 met`; and the Z5 WARN count **printed** on its own `zone-content:` line rather than swallowed into the generic warning total.

**Three things that are NOT proof and must not be accepted as such:**
- **A green `npm test` alone.** Gate 1 (`scripts/precheck.sh`) runs **neither** `check_content.mjs` **nor** the scripts suite — verified: no `check_content` line at all, and its only `npm test` calls are `colyseus-server` (line 102) and `client/react-client` (line 125). So Gate 1 catches neither kind of red. But "Gate 1 misses it" is **not** "nothing catches it": **CI (`.github/workflows/ci.yml:78-79`) runs both on every push**, and **Gate 2 (`integration.sh`) runs the scripts suite (line 87) and the gate with `--require-complete` (line 81)**. A red gate does not sit quietly until someone runs it by hand — it reddens CI on the next push and blocks the ship. Run the gate yourself at every task boundary, and in `--require-complete` mode before ship.
- **A green plain-mode gate as a stand-in for the ship gate.** `--require-complete` escalates in two places (`checkStoryCoherence(..., requireComplete)` and the `opts.requireComplete ? fail : warn` at `check_content.mjs:609`), neither of which touches Z5's `warn()`. That is a reason to expect the run to pass — not a substitute for running it.
- **Any exit code read as `$?` after a pipe.** Redirect to a file and read `$?`, or run without a pipe. Every verify step in this plan is already written in the redirect-then-read form; keep it that way.