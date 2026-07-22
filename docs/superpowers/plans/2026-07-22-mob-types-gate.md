# Generated mob-types.json — mob refs WARN→FAIL (F-013) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A typo'd mob reference in authored content (map `mobSpawnAreas[].mobType`, story `faction.mobFamily[]`, quest `objectives[].targetId` of form `mob:*`) becomes a hard CI FAIL instead of a silent WARN, backed by a codegen-emitted `colyseus-server/generated/mob-types.json`.

**Architecture:** Mirror the `gen-asset-keys` codegen: `gen-mob-types.{ts,sh}` reads the live `MOB_TYPES` server config and emits a committed, deterministic `{version, mobTypes[]}` artifact. `scripts/check_content.mjs` gains a `--mob-types` flag (default: the committed artifact) and treats the file as the single source of truth; a missing/unparseable/shape-invalid file is itself ONE hard FAIL (never a soft-skip).

**Tech Stack:** TypeScript + ts-node (codegen), Jest/ts-jest (codegen test), plain ESM + `node --test` (gate + gate tests), GitHub Actions (CI).

**Spec:** `docs/superpowers/specs/2026-07-22-mob-types-gate-design.md` (approved 2026-07-22).

**Spec erratum (binding for this plan):** the spec's Problem section says `faction.mobFamily` "already hard-FAILs against asset-keys.json". The *shipped* F-012 code (release/1.4, merge `80914c0`) actually left it a **WARN** (`check_content.mjs` `checkStory()`, and `story-refs.test.mjs` asserts "warn, not a fail"). This plan therefore flips **both** mob:* WARNs (mobFamily AND targetId) to hard FAILs against mob-types.json — exactly what F-012's plan meant by "when I-019 lands, flip those two WARNs to FAILs". The asset-keys WARNs for those refs are **kept** (they now mean "renderable coverage"; the new FAIL means "actually spawnable").

**Sequencing:** F-012 is shipped to release/1.4 (catalog `b84f40a`) — the spec's "F-012 first" constraint is already satisfied. Verified 2026-07-22: every committed map/story mob ref uses a real mob id, so the flip does not redden CI.

## Global Constraints

- Work happens on the claimed `feat/F-013` worktree off `release/1.4` (ps-release-workflow). One commit per task, conventional subjects, **never `git commit --amend`**.
- Setup in a fresh worktree: `pnpm install` at repo root (colyseus-server deps for ts-node/jest), `npm ci --prefix scripts` (gate deps).
- Gate test suite: `npm test --prefix scripts` (node --test). Server suite: `cd colyseus-server && npm test`.
- The artifact is **committed**; CI regenerates it before gates (same model as `asset-keys.json`; there is NO `git diff --exit-code` drift step for either — do not add one).
- Exact FAIL message shape (spec §2): `` maps/x.md: mobType "agressive" (area "a1") is not a server mob id (valid: aggressive, balanced, …) `` — always list the valid ids, sorted.
- Missing/unparseable/shape-invalid (`mobTypes` not a string array) mob-types file → exactly ONE FAIL; all mob checks skipped (they must not silently pass, and the one loader failure must not multiply per ref).
- `story-migration.test.mjs` and `story-seed.test.mjs` run the gate with **default paths against the real tree by design** — they are exempt from the fixture-hermeticity retrofit. Every *fixture-based* `runGate` (check_content, story-refs, story-coherence, story-prereq-dag) must pass an explicit `--mob-types`.
- Every task ends with the phased quality gate: verify (run the commands, show exit codes) → independent adversarial review of the task's diff (fresh reviewer subagent) → act on findings → re-verify. Not a permission stop — run it automatically.

---

### Task 1: `gen-mob-types` codegen + committed artifact

**Files:**
- Create: `colyseus-server/scripts/codegen/gen-mob-types.ts`
- Create: `colyseus-server/scripts/codegen/gen-mob-types.sh`
- Create: `colyseus-server/src/tests/codegen/gen-mob-types.test.ts`
- Create (generated, committed): `colyseus-server/generated/mob-types.json`

**Interfaces:**
- Consumes: `MOB_TYPES` from `colyseus-server/src/config/mobs` (array of defs with `.id`).
- Produces: `genMobTypes(): { version: number; mobTypes: string[] }` (exported, deduped, lexicographically sorted); the committed artifact `colyseus-server/generated/mob-types.json`; the shell wrapper Task 4's CI step calls. Task 2 relies on the artifact existing at `colyseus-server/generated/mob-types.json` with exactly `{"version":1,"mobTypes":["aggressive","balanced","defensive","double_attacker","hybrid","spear_thrower"]}`.

- [ ] **Step 1: Write the failing test**

`colyseus-server/src/tests/codegen/gen-mob-types.test.ts` — direct import, NOT exec-ing the bash+ts-node pipeline (spec §1: one full ts-node boot in this suite — `gen-asset-keys.test.ts` — is enough):

```ts
import { genMobTypes } from '../../../scripts/codegen/gen-mob-types'

describe('genMobTypes', () => {
  const data = genMobTypes()

  it('emits version 1', () => {
    expect(data.version).toBe(1)
  })

  it('contains every known mob type id from mobTypesConfig', () => {
    for (const id of [
      'aggressive',
      'balanced',
      'defensive',
      'double_attacker',
      'hybrid',
      'spear_thrower',
    ]) {
      expect(data.mobTypes).toContain(id)
    }
  })

  it('is deduped and lexicographically sorted', () => {
    expect(data.mobTypes).toEqual([...data.mobTypes].sort())
    expect(new Set(data.mobTypes).size).toBe(data.mobTypes.length)
  })

  it('every id is a non-empty string', () => {
    expect(data.mobTypes.length).toBeGreaterThan(0)
    for (const id of data.mobTypes) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd colyseus-server && npm test -- src/tests/codegen/gen-mob-types.test.ts`
Expected: FAIL — cannot find module `../../../scripts/codegen/gen-mob-types`.
(Contingency: if instead ts-jest raises TS6059 "not under rootDir" for the out-of-`src` import once the module exists in Step 3, change the `.ts` transform line in `colyseus-server/jest.config.js` to `'^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [6059] } }],` — nothing else.)

- [ ] **Step 3: Write the codegen**

`colyseus-server/scripts/codegen/gen-mob-types.ts`:

```ts
/**
 * Emits generated/mob-types.json — the set of valid server mob type ids
 * (F-013). Single source of truth for the out-of-process content gate
 * (scripts/check_content.mjs --mob-types): a map mobSpawnAreas[].mobType or a
 * story mob:* ref that is not in this set is a hard FAIL.
 *
 * Reads the REAL server config (MOB_TYPES) directly, so the id set can never
 * drift from a hand-copied list. Output is deterministic (dedup + stable
 * lexicographic sort). The artifact is COMMITTED; CI refreshes it before the
 * gates run. Authoring workflow: add a mob definition → run gen-mob-types.sh →
 * commit the refreshed artifact, or local check_content.mjs runs will FAIL
 * against the stale file.
 *
 * Deliberately separate from asset-keys.json's mob:* keys: those mean
 * "renderable", this means "spawnable". Identical today (same MOB_TYPES loop);
 * kept separate so a future renderable-only key (decorative variant,
 * unreleased art) never counts as spawnable.
 *
 * Lives under colyseus-server/scripts/ (not src/) by design, alongside the
 * other codegen entrypoints. Run via ts-node --transpile-only.
 */
import { MOB_TYPES } from '../../src/config/mobs'

export interface MobTypeSet {
  version: number
  mobTypes: string[]
}

const VERSION = 1

/** Build the valid mob type id set from the live server config. */
export function genMobTypes(): MobTypeSet {
  const mobTypes = [...new Set(MOB_TYPES.map((m) => m.id))].sort()
  return { version: VERSION, mobTypes }
}

// CLI driver: single optional arg = output file path.
if (require.main === module) {
  const fs = require('fs')
  const path = require('path')
  const outputFilePath =
    process.argv[2] || path.resolve(__dirname, '../../generated/mob-types.json')
  const data = genMobTypes()
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
  fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2) + '\n')
  console.log(`gen-mob-types: wrote ${outputFilePath} (${data.mobTypes.length} mob types)`)
}
```

`colyseus-server/scripts/codegen/gen-mob-types.sh`:

```bash
#!/usr/bin/env bash
# Emit generated/mob-types.json — the valid server mob type id set consumed by
# the content gate (scripts/check_content.mjs --mob-types), F-013.
# Reads the live server config via ts-node. Idempotent; output is committed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"          # colyseus-server/
OUT="$ROOT/generated/mob-types.json"

"$ROOT/node_modules/.bin/ts-node" --transpile-only \
  "$HERE/gen-mob-types.ts" "$OUT"

echo "codegen: wrote mob types to $OUT"
```

Then: `chmod +x colyseus-server/scripts/codegen/gen-mob-types.sh`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd colyseus-server && npm test -- src/tests/codegen/gen-mob-types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Emit and inspect the artifact**

Run: `bash colyseus-server/scripts/codegen/gen-mob-types.sh && cat colyseus-server/generated/mob-types.json`
Expected output file content exactly:

```json
{
  "version": 1,
  "mobTypes": [
    "aggressive",
    "balanced",
    "defensive",
    "double_attacker",
    "hybrid",
    "spear_thrower"
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add colyseus-server/scripts/codegen/gen-mob-types.ts \
        colyseus-server/scripts/codegen/gen-mob-types.sh \
        colyseus-server/src/tests/codegen/gen-mob-types.test.ts \
        colyseus-server/generated/mob-types.json
git commit -m "feat(codegen): gen-mob-types emits committed mob-types.json (F-013)"
```

- [ ] **Step 7: Phase gate** — adversarial review of this task's diff (fresh reviewer subagent), fix findings, re-run Step 4 + Step 5, new commit for any fixes.

---

### Task 2: gate `--mob-types` flag, hard-fail loader, map WARN→FAIL, fixture-hermeticity retrofit

**Files:**
- Modify: `scripts/check_content.mjs` (parseArgs ~14-35, main ~69-75, checkMaps step (4) ~549-554)
- Modify: `scripts/tests/check_content.test.mjs` (fixture/runGate ~53-79 + new tests)
- Modify: `scripts/tests/story-refs.test.mjs` (fixture ~38-56, runGate ~58-71 — retrofit only)
- Modify: `scripts/tests/story-coherence.test.mjs` (fixture/runGate — retrofit only)
- Modify: `scripts/tests/story-prereq-dag.test.mjs` (fixture/runGate — retrofit only)

**Interfaces:**
- Consumes: `colyseus-server/generated/mob-types.json` (Task 1); `readJson(path, label, fail)` from `scripts/lib/story.mjs`.
- Produces: `--mob-types <path>` CLI flag (default `join(ROOT, "colyseus-server/generated/mob-types.json")`); `loadMobTypes(path): Set<string> | null` (null ⇒ the file already FAILed); `checkMaps(opts, mobTypes)` new second param. Task 3 relies on `loadMobTypes` and on `main()` holding the loaded set in a local named `mobTypes`.

- [ ] **Step 1: Write the failing tests + retrofit `check_content.test.mjs`**

In `scripts/tests/check_content.test.mjs`, add after the `MANIFEST` const (~line 26):

```js
const MOB_TYPES_FIXTURE = { version: 1, mobTypes: ["aggressive", "balanced"] };

const GOOD_MAP = `---
id: test-map
title: Test Map
world: { width: 100, height: 100 }
playerSpawn: { x: 10, y: 10 }
regions:
  - { id: zone-a, title: Zone A, bounds: { x: 0, y: 0, width: 100, height: 100 } }
mobSpawnAreas:
  - { id: area-1, x: 10, y: 10, width: 20, height: 20, mobType: aggressive, count: 2 }
links: []
---

Body prose.
`;
```

(Region id `zone-a`, not `region-*`, so the bible-coverage WARN check stays out of these tests' output.)

Replace `fixture()` and `runGate()` with:

```js
function fixture({ sheets = {}, maps = {}, keys = KEYS, manifest = MANIFEST, mobTypes = MOB_TYPES_FIXTURE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "content-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/character.schema.json"),
         join(dir, "content/schemas/character.schema.json"));
  for (const [name, body] of Object.entries(sheets))
    writeFileSync(join(dir, "content/characters", name), body);
  if (Object.keys(maps).length) {
    mkdirSync(join(dir, "content/maps"), { recursive: true });
    cpSync(join(ROOT, "content/schemas/map.schema.json"),
           join(dir, "content/schemas/map.schema.json"));
    for (const [name, body] of Object.entries(maps))
      writeFileSync(join(dir, "content/maps", name), body);
  }
  writeFileSync(join(dir, "keys.json"), JSON.stringify(keys));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  // mobTypes: null = deliberately absent (exercises the hard-FAIL loader path).
  if (mobTypes !== null)
    writeFileSync(join(dir, "mob-types.json"), JSON.stringify(mobTypes));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      // Explicit fixture path — hermeticity: without it the default resolves to
      // the REAL committed artifact and these tests silently track the live
      // server mob set.
      "--mob-types", join(dir, "mob-types.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
```

Append the new tests at the end of the file:

```js
// --- F-013: map mobType hard-FAIL against mob-types.json ---------------------

test("map with a valid mobType is green", () => {
  const dir = fixture({ maps: { "test-map.md": GOOD_MAP } });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /FAIL/);
});

test("map with a typo'd mobType is a hard fail naming file, area, and valid ids", () => {
  const bad = GOOD_MAP.replace("mobType: aggressive", "mobType: agressive");
  const dir = fixture({ maps: { "test-map.md": bad } });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*maps\/test-map\.md: mobType "agressive" \(area "area-1"\) is not a server mob id \(valid: aggressive, balanced\)/);
});

test("missing mob-types.json is a single hard fail; mob checks are skipped", () => {
  const dir = fixture({ maps: { "test-map.md": GOOD_MAP }, mobTypes: null });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*mob-types: cannot read\/parse/);
  assert.match(r.out, /1 failures/);
});

test("shape-invalid mob-types.json is a single hard fail", () => {
  const dir = fixture({ maps: { "test-map.md": GOOD_MAP }, mobTypes: { version: 1, mobTypes: "nope" } });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*mob-types.*shape-invalid/);
  assert.match(r.out, /1 failures/);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test --prefix scripts -- tests/check_content.test.mjs`
Expected: the 4 new tests FAIL (`unknown arg: --mob-types`, exit 2 → `r.code === 2`); the 11 pre-existing tests also fail the same way (runGate now always passes the unknown flag). That's the red state.

- [ ] **Step 3: Implement in `scripts/check_content.mjs`**

(a) In `parseArgs` — add to the `opts` literal after the `manifest` line:

```js
    mobTypes: join(ROOT, "colyseus-server/generated/mob-types.json"),
```

and to the flag chain after the `--manifest` branch:

```js
    else if (a === "--mob-types") opts.mobTypes = resolve(takeValue(a, ++i));
```

(b) Add below `parseArgs` (before the `failures` consts):

```js
// F-013: load the codegen-emitted valid mob type id set. Missing, unparseable,
// or shape-invalid (`mobTypes` not a string array) is ONE hard FAIL and
// returns null — callers skip their mob checks so the single loader failure
// isn't multiplied per ref, and the checks can never silently pass. This
// deliberately does NOT mirror the story/bible soft-skip: the artifact is
// committed and CI-refreshed, so absence means broken setup.
function loadMobTypes(path) {
  const doc = readJson(path, "mob-types", fail);
  if (!doc) return null;
  if (!Array.isArray(doc.mobTypes) || !doc.mobTypes.every((t) => typeof t === "string")) {
    fail(`mob-types: ${path} is shape-invalid — expected { mobTypes: string[] }`);
    return null;
  }
  return new Set([...doc.mobTypes].sort()); // sorted so FAIL messages list ids deterministically
}
```

Note: `loadMobTypes` calls `fail`, so it must be defined/called after the `fail` const — put the function anywhere top-level (hoisted), but call it only inside `main()`.

(c) `main()` becomes:

```js
function main() {
  const opts = parseArgs(process.argv);
  const mobTypes = loadMobTypes(opts.mobTypes);
  const story = checkStory(opts);
  const sheetCount = checkCharacters(opts, story.ids);
  const mapCount = checkMaps(opts, mobTypes);
  return finish(sheetCount, mapCount, story.count);
}
```

(d) `checkMaps(opts)` → `checkMaps(opts, mobTypes)`, and replace step (4) (the per-area unconditional WARN, ~lines 549-554 — this also retires the comment's stale anticipated path `content/schemas/mob-types.json`):

```js
    // (4) mobType cross-check — hard FAIL against the codegen-emitted
    // colyseus-server/generated/mob-types.json (F-013). mobTypes === null
    // means the artifact itself already FAILed in loadMobTypes; skip here so
    // that one failure isn't multiplied per area.
    if (mobTypes) {
      for (const area of fm.mobSpawnAreas ?? []) {
        if (!mobTypes.has(area.mobType))
          fail(`${label}: mobType "${area.mobType}" (area "${area.id}") is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
      }
    }
```

- [ ] **Step 4: Run to verify `check_content.test.mjs` passes**

Run: `npm test --prefix scripts -- tests/check_content.test.mjs`
Expected: PASS (15 tests: 11 retrofitted + 4 new).

- [ ] **Step 5: Retrofit the three story fixture files**

In each of `scripts/tests/story-refs.test.mjs`, `scripts/tests/story-coherence.test.mjs`, `scripts/tests/story-prereq-dag.test.mjs`, apply the identical mechanical change:

(a) after the `MANIFEST` const add:

```js
// "aggressive" because every fixture QUEST's objective targets "mob:aggressive".
const MOB_TYPES_FIXTURE = { version: 1, mobTypes: ["aggressive"] };
```

(b) `fixture()` signature gains `mobTypes = MOB_TYPES_FIXTURE` in its destructured options, and before `return dir;` add:

```js
  if (mobTypes !== null)
    writeFileSync(join(dir, "mob-types.json"), JSON.stringify(mobTypes));
```

(c) `runGate()` arg list gains, after the `--manifest` pair:

```js
      "--mob-types", join(dir, "mob-types.json"),
```

- [ ] **Step 6: Run the whole gate suite**

Run: `npm test --prefix scripts`
Expected: ALL tests pass. Story behavior is untouched in this task (the two mob:* WARN tests in story-refs still assert WARN and still pass — the flip is Task 3). `story-migration`/`story-seed` hit the real committed artifact via the default path, by design.

- [ ] **Step 7: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/check_content.test.mjs \
        scripts/tests/story-refs.test.mjs scripts/tests/story-coherence.test.mjs \
        scripts/tests/story-prereq-dag.test.mjs
git commit -m "feat(gate): --mob-types loader + map mobType WARN->FAIL, hermetic fixtures (F-013)"
```

- [ ] **Step 8: Phase gate** — adversarial review of this task's diff, fix findings, re-run Step 6, new commit for any fixes.

---

### Task 3: story mob:* refs WARN→FAIL (mobFamily + quest objectives targetId)

**Files:**
- Modify: `scripts/check_content.mjs` (`resolveStoryRefs` ~100-127 + its header comment ~82-99, `checkStory` ~363-393 + its header comment)
- Modify: `scripts/tests/story-refs.test.mjs` (the two "warn, not a fail" tests at the end)

**Interfaces:**
- Consumes: `loadMobTypes` + the `mobTypes` local in `main()` (Task 2).
- Produces: `checkStory(opts, mobTypes)` and `resolveStoryRefs(story, assetKeyIds, mobTypes, fail, warn)` — new `mobTypes: Set<string> | null` params (null ⇒ skip mob checks; loader already FAILed).

- [ ] **Step 1: Update the two WARN tests to FAIL + add divergence tests**

In `scripts/tests/story-refs.test.mjs`, replace the final section (the comment line `// --- warn (not fail) for the two mob:* pseudo-refs deferred to I-019 -------` and the two tests under it) with:

```js
// --- F-013: the two mob:* pseudo-refs, hard-FAILed against mob-types.json ---

test("quest.objectives[].targetId of form mob:* not a server mob id is a hard fail", () => {
  const quest = { ...QUEST, objectives: [{ type: "MOB_KILLED", targetId: "mob:nope", count: 1 }] };
  const dir = fixture({ characters: [CHARACTER], factions: [FACTION_A], regions: [REGION], arcs: [ARC], quests: [quest] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*quest-x.*objectives targetId "mob:nope" is not a server mob id \(valid: aggressive\)/);
});

test("faction.mobFamily[] entry not a server mob id is a hard fail", () => {
  const faction = { ...FACTION_A, mobFamily: ["mob:nope"] };
  const dir = fixture({ factions: [faction] });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*faction-a.*mobFamily "mob:nope" is not a server mob id \(valid: aggressive\)/);
});

test("renderable-but-not-spawnable mob key (in asset-keys, not mob-types) is a hard fail", () => {
  // The divergence Decision 2 exists for: a decorative/unreleased mob:* asset
  // key must not count as spawnable.
  const keys = { version: 1, keys: [...KEYS.keys, { id: "mob:decor", kind: "character" }] };
  const faction = { ...FACTION_A, mobFamily: ["mob:decor"] };
  const dir = fixture({ factions: [faction], keys });
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*faction-a.*mobFamily "mob:decor" is not a server mob id/);
});

test("spawnable-but-not-renderable mob key (in mob-types, not asset-keys) stays a warn", () => {
  const faction = { ...FACTION_A, mobFamily: ["mob:ghost"] };
  const dir = fixture({ factions: [faction], mobTypes: { version: 1, mobTypes: ["aggressive", "ghost"] } });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*faction-a.*mobFamily key "mob:ghost" not in asset-keys\.json/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test --prefix scripts -- tests/story-refs.test.mjs`
Expected: the first three new tests FAIL (gate still exits 0 / emits WARN); the fourth passes incidentally. Everything else green.

- [ ] **Step 3: Implement the story flips in `scripts/check_content.mjs`**

(a) `main()` — thread the set into checkStory:

```js
  const story = checkStory(opts, mobTypes);
```

(b) `checkStory(opts)` → `checkStory(opts, mobTypes)`; replace the faction mobFamily loop with:

```js
  for (const entry of byKind.get("faction")) {
    for (const mk of entry.mobFamily) {
      if (!assetKeyIds.has(mk))
        warn(`story/${STORY_FILES.faction}#${entry.id}: mobFamily key "${mk}" not in asset-keys.json`);
      // F-013: strip the mob: prefix and hard-check spawnability. The
      // asset-keys WARN above stays — it now means "renderable coverage";
      // this FAIL means "actually spawnable".
      if (mobTypes && mk.startsWith("mob:") && !mobTypes.has(mk.slice(4)))
        fail(`story/${STORY_FILES.faction}#${entry.id}: mobFamily "${mk}" is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
    }
  }
```

and pass the set through the resolver call below it:

```js
  resolveStoryRefs(story, assetKeyIds, mobTypes, fail, warn);
```

(c) `resolveStoryRefs(story, assetKeyIds, fail, warn)` → `resolveStoryRefs(story, assetKeyIds, mobTypes, fail, warn)`; replace the quest objectives loop with:

```js
    for (const obj of q.objectives) {
      if (!obj.targetId.startsWith("mob:")) continue;
      if (!assetKeyIds.has(obj.targetId))
        warn(`${label}: objectives targetId "${obj.targetId}" not in asset-keys.json`);
      // F-013: hard spawnability check (see mobFamily note in checkStory).
      if (mobTypes && !mobTypes.has(obj.targetId.slice(4)))
        fail(`${label}: objectives targetId "${obj.targetId}" is not a server mob id (valid: ${[...mobTypes].join(", ")})`);
    }
```

(d) Update the now-stale prose: in the `resolveStoryRefs` header comment (~86-91), replace the sentence block "…except the `mob:*` pseudo-ref … that check lives in checkStory(), not here." with:

```js
// target, including (since F-013) the mob:* pseudo-refs: quest
// .objectives[].targetId and (in checkStory) faction.mobFamily[] hard-FAIL
// against the codegen-emitted mob-types.json (spawnable), while keeping the
// softer asset-keys WARN (renderable coverage).
```

and in the `checkStory` header comment (~363-369), replace "(WARN — this stays a WARN, matching the map mobType check, until I-019's mob-types.json lands and can hard-check it; see epic-story-pipeline-design.md §2 notes)" with "(asset-keys membership stays a WARN — renderable coverage; F-013 adds the hard FAIL against mob-types.json — spawnable)".

- [ ] **Step 4: Run to verify it passes**

Run: `npm test --prefix scripts -- tests/story-refs.test.mjs`
Expected: PASS (all tests, including the 4 from Step 1).

- [ ] **Step 5: Full suite + real tree**

Run: `npm test --prefix scripts && node scripts/check_content.mjs`
Expected: all tests pass; real-tree gate exits 0 with `0 failures` (all committed story/map mob refs are valid — verified in the plan preamble).

- [ ] **Step 6: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/story-refs.test.mjs
git commit -m "feat(gate): story mob:* refs (mobFamily, quest targetId) WARN->FAIL vs mob-types.json (F-013)"
```

- [ ] **Step 7: Phase gate** — adversarial review of this task's diff, fix findings, re-run Step 5, new commit for any fixes.

---

### Task 4: CI refresh step + doc updates + end-to-end verify

**Files:**
- Modify: `.github/workflows/ci.yml` (the "Codegen asset keys" step, ~line 63)
- Modify: `content/maps/atlas-frontier.md` (~lines 88-90, the WARN-pending note)
- Modify: `content/README.md` (add mob-reference authoring workflow)

**Interfaces:**
- Consumes: `gen-mob-types.sh` (Task 1); the flipped gate (Tasks 2-3).
- Produces: CI regenerates both artifacts before the gates; docs describe the hard gate.

- [ ] **Step 1: Extend the CI codegen step**

In `.github/workflows/ci.yml`, replace:

```yaml
      - name: Codegen asset keys (refresh generated/asset-keys.json)
        run: bash colyseus-server/scripts/codegen/gen-asset-keys.sh
```

with (one refresh point before the gates — no new step ordering to reason about, spec §3):

```yaml
      - name: Codegen asset keys + mob types (refresh generated/*.json)
        run: |
          bash colyseus-server/scripts/codegen/gen-asset-keys.sh
          bash colyseus-server/scripts/codegen/gen-mob-types.sh
```

- [ ] **Step 2: Update `content/maps/atlas-frontier.md`**

Replace (~lines 88-90):

```markdown
- `mobType` ids (`balanced`, `defensive`, `spear_thrower`) are the real
  `colyseus-server` mob definition ids; the gate currently treats mobType as an
  unverified WARN pending a generated `mob-types.json` registry binding.
```

with:

```markdown
- `mobType` ids (`balanced`, `defensive`, `spear_thrower`) are the real
  `colyseus-server` mob definition ids; the gate hard-FAILs any mobType not in
  the generated `colyseus-server/generated/mob-types.json` (F-013).
```

- [ ] **Step 3: Document the authoring workflow in `content/README.md`**

Add a section after the "Authoring Workflow" section:

```markdown
## Mob References (maps + story)

Every mob reference in authored content is a **hard gate FAIL** if it isn't a
real server mob id (F-013): map `mobSpawnAreas[].mobType`, story
`faction.mobFamily[]`, and quest `objectives[].targetId` of form `mob:*`.
Valid ids live in the committed `colyseus-server/generated/mob-types.json`,
emitted from the live server `MOB_TYPES` config.

Adding or renaming a mob definition:

1. Edit `colyseus-server/src/config/mobs/definitions/`
2. `bash colyseus-server/scripts/codegen/gen-mob-types.sh` (and
   `gen-asset-keys.sh` — the render keys change too)
3. Commit the refreshed `generated/*.json` — local `check_content.mjs` runs
   FAIL against a stale file. CI regenerates both before the gates as a
   backstop.
```

- [ ] **Step 4: End-to-end verify**

```bash
npm test --prefix scripts                       # gate suite green
node scripts/check_content.mjs                  # real tree: 0 failures
node scripts/check_content.mjs --require-complete   # still 0 failures
node scripts/gen_story_graph.mjs --check        # story graph not drifted
cd colyseus-server && npm test                  # full server suite green
```

Expected: every command exits 0. CI itself is verified when the ship PR runs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml content/maps/atlas-frontier.md content/README.md
git commit -m "ci+docs: refresh mob-types.json in CI; document the hard mob-ref gate (F-013)"
```

- [ ] **Step 6: Phase gate** — adversarial review of this task's diff (docs + YAML: check the CI step lands before both `check_content.mjs` invocations and after contracts build), fix findings, re-run Step 4, new commit for any fixes.

---

## Out of scope (from the spec — do not drift into these)

- Runtime consumption of `mob-types.json` (server imports `MOB_TYPES` directly).
- The legacy hardcoded `colyseus-server/src/config/mapConfig.ts`.
- A `git diff --exit-code` drift step for the generated artifacts.
- Godot client anything.
