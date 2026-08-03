# Thornveil L2 Ecology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Thornveil's ecology from its terrain and place all 14 of its bestiary designs into a four-tier depth model, behind a strict gate that proves the zone is completely placed.

**Architecture:** A new sibling file `content/bestiary/placement-thornveil.json` carries the placement data; `content/bestiary/bestiary.json` is not touched, so its documented fourteen-field contract and its "the gate does not read this file" posture both stay true. A new `checkBestiaryPlacement()` in `scripts/check_content.mjs` enforces eight rules against the roster and the geography. A Naturalist document records the derivation the data encodes.

**Tech Stack:** Node 22+ ESM, `node:test`, ajv via `scripts/lib/story.mjs` (`readJson`, `compileSchema`), JSON Schema draft-07, pandoc for the doc render.

**Spec:** `.claude/idea_backlog/I-059-l2-ecology-biome-and-habitat-lore-for-cl/spec.md`

## Global Constraints

- **Do not modify `content/bestiary/bestiary.json`.** The roster's field set and contents stay exactly as they are. The only permitted edit under `content/bestiary/` besides the new placement file is one pointer line in `README.md` (Task 1, Step 9).
- **Do not amend `A1-geography-cluster1.md`.** The zone band `[15, 28]` stands; this work states what it describes, it does not change it.
- **`node scripts/report_season1.mjs` output must be byte-identical before and after.** This feature moves no budget line.
- **Placement is optional content.** A content root with no `bestiary/` directory, or with no `placement-*.json` inside it, must skip silently and return 0 — mirroring the existing maps soft-skip at `scripts/check_content.mjs:566-573`. Existing fixtures in `scripts/tests/check_content.test.mjs` have no bestiary directory and **must keep passing untouched**.
- **`readJson` falsy handling** must follow the failure-count pattern at `scripts/check_content.mjs:45-58`: a parsed-but-falsy document and an already-recorded FAIL are different things and must not collapse into a silent skip.
- **Baselines measured on `release/1.6` at `bcca91f`**, before any of this work. Any deviation is a defect, not a surprise:
  - `node scripts/check_content.mjs` → `content-gate: 8 sheets, 1 maps, 153 story, 0 failures, 0 warnings`, exit 0. After this plan the same line gains `, 1 placements` and the counts are otherwise unchanged.
  - `cd scripts && npm test` → `pass 139, fail 0`.
- **Test commands.** `scripts/` is its own package (`@atlas/content-gate`) with its own `node_modules`. `node --test scripts/tests/` from the repo root **does not work** on Node 26 — it resolves the directory as a module and throws `MODULE_NOT_FOUND`. Use `cd scripts && npm test` for the suite, or `cd scripts && node --test tests/<file>.test.mjs` for one file.
- **Conventional commits**, one per task, kept short. Never `git commit --amend`.
- **Prettier** runs on commit via husky/lint-staged for `colyseus-server/src/**/*.ts` only; `scripts/` and `content/` are not auto-formatted, so match surrounding style by hand.

## Quality gate — runs at the end of EVERY task

A task is not done until all five pass, in order. This is automatic, not a permission checkpoint:

1. **Implement** the task's steps.
2. **Verify** — run the stated commands and read the real output. No "should pass".
3. **Review** — independent adversarial review of *that task's diff* (fresh subagent, `/code-review`, or the `code-reviewer` agent).
4. **Refactor** — act on the review while the diff is small (`/simplify`).
5. **Re-verify** — confirm the refactor did not break step 2.

## File Structure

| File | Responsibility |
|---|---|
| `content/schemas/bestiary-placement.schema.json` | **new** — shape of any zone placement file |
| `content/bestiary/placement-thornveil.json` | **new** — Thornveil's tiers and its 14 placements |
| `content/bestiary/README.md` | **edit** — one pointer line to the sibling placement files |
| `scripts/check_content.mjs` | **edit** — `loadBestiaryDesigns()`, `loadGeographyZones()`, `checkBestiaryPlacement()`, wired into `main()`/`finish()` |
| `scripts/tests/bestiary-placement.test.mjs` | **new** — one test per gate rule, each red before green |
| `docs/worldbuilding/A2-ecology-thornveil.md` | **new** — the Naturalist derivation |

---

### Task 1: Schema and Thornveil placement data

Produces the data model and the real file. No gate yet — this task proves the schema accepts the intended shape and rejects a malformed one.

**Files:**
- Create: `content/schemas/bestiary-placement.schema.json`
- Create: `content/bestiary/placement-thornveil.json`
- Modify: `content/bestiary/README.md`
- Test: `scripts/tests/bestiary-placement.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: the placement document shape every later task reads —
  `{ version: 1, zone: string, bestiaryRegion: string, routeBand: [number, number], depthTiers: Array<{id, label, bandFloor, bandCeil, summary}>, placements: Array<{design, tier, locale, note?}> }`.
  Tier ids minted here and relied on by Tasks 3–5: `verge`, `route`, `interior`, `heart`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/bestiary-placement.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function compile() {
  const schema = JSON.parse(
    readFileSync(join(ROOT, "content/schemas/bestiary-placement.schema.json"), "utf8"));
  return new Ajv({ allErrors: true }).compile(schema);
}

test("the committed Thornveil placement file validates against the schema", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  assert.ok(validate(doc), JSON.stringify(validate.errors, null, 2));
});

test("schema rejects an unknown top-level property", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  assert.equal(validate({ ...doc, surprise: true }), false);
});

test("schema rejects a placement missing its locale", () => {
  const validate = compile();
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content/bestiary/placement-thornveil.json"), "utf8"));
  const broken = { ...doc, placements: [{ design: "mob-veil-cub", tier: "verge" }] };
  assert.equal(validate(broken), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: FAIL — `ENOENT` on `content/schemas/bestiary-placement.schema.json`.

- [ ] **Step 3: Create the schema**

Create `content/schemas/bestiary-placement.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas bestiary zone placement",
  "description": "One file per cluster-1 zone: where inside that zone each of its bestiary designs sits. A sibling to content/bestiary/bestiary.json, which stays a pure design roster (see content/bestiary/README.md). I-059.",
  "type": "object",
  "required": ["version", "zone", "bestiaryRegion", "routeBand", "depthTiers", "placements"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "zone": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "bestiaryRegion": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "routeBand": {
      "type": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": { "type": "integer", "minimum": 1, "maximum": 80 }
    },
    "depthTiers": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "label", "bandFloor", "bandCeil", "summary"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
          "label": { "type": "string", "minLength": 1 },
          "bandFloor": { "type": "integer", "minimum": 1, "maximum": 80 },
          "bandCeil": { "type": "integer", "minimum": 1, "maximum": 80 },
          "summary": { "type": "string", "minLength": 1 }
        }
      }
    },
    "placements": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["design", "tier", "locale"],
        "additionalProperties": false,
        "properties": {
          "design": { "type": "string", "pattern": "^mob-[a-z0-9]+(-[a-z0-9]+)*$" },
          "tier": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
          "locale": { "type": "string", "minLength": 1 },
          "note": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Create the Thornveil placement file**

Create `content/bestiary/placement-thornveil.json`. All 14 design ids are real and taken from `content/bestiary/bestiary.json` where `region === "thornveil"`:

```json
{
  "version": 1,
  "zone": "thornveil",
  "bestiaryRegion": "thornveil",
  "routeBand": [15, 28],
  "depthTiers": [
    {
      "id": "verge",
      "label": "The Verge",
      "bandFloor": 1,
      "bandCeil": 14,
      "summary": "The track margin. Passing traffic keeps the thorn cut back, so the growth here is young and the things in it are small."
    },
    {
      "id": "route",
      "label": "The Route",
      "bandFloor": 15,
      "bandCeil": 28,
      "summary": "The thorn wall the terrace track runs beside. A1 4.2's binding band for the zone — it describes this skirting passage, not the ground behind it."
    },
    {
      "id": "interior",
      "label": "The Interior",
      "bandFloor": 29,
      "bandCeil": 50,
      "summary": "The bramble body, off the track and out of sight of it. No road has ever crossed here and nothing cuts the thorn back."
    },
    {
      "id": "heart",
      "label": "The Heart",
      "bandFloor": 51,
      "bandCeil": 70,
      "summary": "The roadless centre, and the deepest root mass in the zone. The oldest growth holds the most water, which is why the largest things stand here."
    }
  ],
  "placements": [
    { "design": "mob-bramble-shoot", "tier": "verge", "locale": "cart-cut margins", "note": "First-year growth on ground the traffic keeps open." },
    { "design": "mob-thicket-hopper", "tier": "verge", "locale": "dry grass at the bramble's first edge" },
    { "design": "mob-veil-cub", "tier": "verge", "locale": "outer thickets within sight of the track", "note": "The zone's only ordinary animal, and it stays where it can leave." },
    { "design": "mob-bramble-stalker", "tier": "route", "locale": "the thorn wall the track runs beside" },
    { "design": "mob-veil-spearling", "tier": "route", "locale": "ambush cuts overlooking the terrace track", "note": "Raiders work the route because the route is where things pass." },
    { "design": "mob-thornhusk-weaver", "tier": "route", "locale": "husk galleries in the roadside thorn", "note": "A sap-feeder: in an interfluve with no standing water, sap is the water." },
    { "design": "mob-bramble-warden", "tier": "route", "locale": "the first standing thickets, where the wall thickens" },
    { "design": "mob-thornveil-spearhand", "tier": "route", "locale": "the raiders' cut paths just inside the wall" },
    { "design": "mob-sapdrinker-swarm", "tier": "route", "locale": "sap runs on the older stems", "note": "The second sap-feeder, and the reason the older growth is scarred." },
    { "design": "mob-bramble-drake", "tier": "interior", "locale": "stone hollows in the bramble body", "note": "Apex of the interior; drakes top a region's food chain per the bestiary README." },
    { "design": "mob-briar-caller", "tier": "interior", "locale": "the raiders' deep camp, past where the track can see" },
    { "design": "mob-bramble-mother", "tier": "interior", "locale": "a root mass holding its own standing water" },
    { "design": "mob-thorncrown-drake", "tier": "heart", "locale": "the crown thickets above the heartwood" },
    { "design": "mob-heartwood-tyrant", "tier": "heart", "locale": "the heartwood itself — the zone's deepest root and its water table" }
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify the data against the roster by hand, once**

Run:

```bash
node -e '
const b=require("./content/bestiary/bestiary.json");
const p=require("./content/bestiary/placement-thornveil.json");
const zone=b.filter(d=>d.region==="thornveil").map(d=>d.id).sort();
const placed=p.placements.map(x=>x.design).sort();
console.log("zone designs:",zone.length,"placed:",placed.length);
console.log("identical:",JSON.stringify(zone)===JSON.stringify(placed));
'
```

Expected: `zone designs: 14 placed: 14` and `identical: true`.

- [ ] **Step 7: Confirm the roster is untouched**

Run: `git diff --stat content/bestiary/bestiary.json`
Expected: **no output** — the roster must not appear in the diff.

- [ ] **Step 8: Confirm the budget did not move**

Run: `node scripts/report_season1.mjs`
Expected: identical to the pre-change output — `mob-bases 30/6`, `bestiary-designs 116/116 met`, `zones … blocked`.

- [ ] **Step 9: Add the README pointer line**

In `content/bestiary/README.md`, immediately after the paragraph ending *"The gate does not read `content/bestiary/`. Adding or editing this file cannot change gate output."*, add:

```markdown
That statement is about `bestiary.json` itself and stays true. **Placement is a
separate concern in sibling files** — `placement-<zone>.json`, one per zone,
which say where inside a zone each of its designs sits. Those files *are* gated,
strictly: see `content/schemas/bestiary-placement.schema.json` and
`checkBestiaryPlacement()` in `scripts/check_content.mjs`. The roster stays a
design backlog; placement stays level-design data.
```

- [ ] **Step 10: Commit**

```bash
git add content/schemas/bestiary-placement.schema.json \
        content/bestiary/placement-thornveil.json \
        content/bestiary/README.md \
        scripts/tests/bestiary-placement.test.mjs
git commit -m "feat(I-059): bestiary placement schema and Thornveil data"
```

- [ ] **Step 11: Quality gate** — run the five-step gate at the top of this plan.

---

### Task 2: Gate skeleton and referential rules G1, G2, G3

Wires placement into the content gate and enforces the three rules that say "everything this file names actually exists".

**Files:**
- Modify: `scripts/check_content.mjs` (imports already include `readdirSync`, `existsSync` at `:6`)
- Test: `scripts/tests/bestiary-placement.test.mjs`

**Interfaces:**
- Consumes: the placement shape from Task 1.
- Produces, for Tasks 3 and 4 to extend:
  - `loadBestiaryDesigns(path) → Map<string, {id, region, levelBand}> | null`
  - `loadGeographyZones(path) → Map<string, {id, levelBand: [number, number]}> | null`
  - `checkBestiaryPlacement(opts) → number` (count of placement files checked), called from `main()` and reported by `finish()`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/bestiary-placement.test.mjs`. This adds a fixture builder that mirrors `scripts/tests/check_content.test.mjs:70-110`, kept hermetic — no test may read the live committed roster:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

const GATE = join(ROOT, "scripts/check_content.mjs");

const BESTIARY = [
  { id: "mob-veil-cub", region: "thornveil", levelBand: "1-10" },
  { id: "mob-bramble-warden", region: "thornveil", levelBand: "21-30" },
  { id: "mob-millpond-gnawer", region: "millcross", levelBand: "1-10" },
];

const GEOGRAPHY = {
  zones: [
    { id: "thornveil", levelBand: [15, 28] },
    { id: "millcross-ford", levelBand: [1, 15] },
  ],
};

const TIERS = [
  { id: "verge", label: "The Verge", bandFloor: 1, bandCeil: 14, summary: "s" },
  { id: "route", label: "The Route", bandFloor: 15, bandCeil: 28, summary: "s" },
];

function placement(over = {}) {
  return {
    version: 1,
    zone: "thornveil",
    bestiaryRegion: "thornveil",
    routeBand: [15, 28],
    depthTiers: TIERS,
    placements: [
      { design: "mob-veil-cub", tier: "verge", locale: "l" },
      { design: "mob-bramble-warden", tier: "route", locale: "l" },
    ],
    ...over,
  };
}

function fixture({ placements = {}, bestiary = BESTIARY, geography = GEOGRAPHY } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "placement-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  mkdirSync(join(dir, "content/bestiary"), { recursive: true });
  mkdirSync(join(dir, "content/maps"), { recursive: true });
  for (const s of ["character.schema.json", "map.schema.json", "bestiary-placement.schema.json"])
    cpSync(join(ROOT, "content/schemas", s), join(dir, "content/schemas", s));
  writeFileSync(join(dir, "content/bestiary/bestiary.json"), JSON.stringify(bestiary));
  writeFileSync(join(dir, "content/maps/cluster1-geography.json"), JSON.stringify(geography));
  for (const [name, body] of Object.entries(placements))
    writeFileSync(join(dir, "content/bestiary", name), JSON.stringify(body));
  writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
  return dir;
}

function runGate(dir) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      "--mob-types", join(dir, "mob-types.json"),
    ], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("a valid placement file passes and is counted", () => {
  const r = runGate(fixture({ placements: { "placement-thornveil.json": placement() } }));
  assert.equal(r.code, 0);
  assert.match(r.out, /1 placements/);
});

test("no bestiary directory skips silently", () => {
  const dir = mkdtempSync(join(tmpdir(), "placement-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/character.schema.json"),
         join(dir, "content/schemas/character.schema.json"));
  writeFileSync(join(dir, "keys.json"), JSON.stringify({ version: 1, keys: [] }));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ version: 2, entries: {} }));
  writeFileSync(join(dir, "mob-types.json"), JSON.stringify({ version: 1, mobTypes: [] }));
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /0 placements/);
});

test("G1: unknown zone fails", () => {
  const r = runGate(fixture({ placements: {
    "placement-thornveil.json": placement({ zone: "nowhere" }) } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /zone "nowhere" not in cluster1-geography/);
});

test("G2: bestiaryRegion matching no design fails", () => {
  const r = runGate(fixture({ placements: {
    "placement-thornveil.json": placement({ bestiaryRegion: "atlantis" }) } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /bestiaryRegion "atlantis" matches no design/);
});

test("G3: a placement naming an unknown design fails", () => {
  const doc = placement();
  doc.placements.push({ design: "mob-does-not-exist", tier: "verge", locale: "l" });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /design "mob-does-not-exist" not in bestiary\.json/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: the five new tests FAIL — the gate prints no `placements` count and exits 0 on bad input.

- [ ] **Step 3: Add the two loaders**

In `scripts/check_content.mjs`, directly below `loadMobTypes()` (ends `:58`):

```js
// I-059: the design roster, read ONLY to resolve placement references. The
// roster itself is not validated here — content/bestiary/README.md keeps it a
// design backlog. Same failure-count discipline as loadMobTypes: a recorded
// FAIL and a parsed-but-falsy document are different things.
function loadBestiaryDesigns(path) {
  const before = failures.length;
  const doc = readJson(path, "bestiary", fail);
  if (failures.length > before) return null;
  if (!Array.isArray(doc)) {
    fail(`bestiary: ${path} is shape-invalid — expected a top-level array`);
    return null;
  }
  const byId = new Map();
  for (const d of doc) {
    if (!d || typeof d.id !== "string") continue; // roster shape is not this gate's business
    byId.set(d.id, d);
  }
  return byId;
}

// I-059: zone records from the Cartographer's geography. levelBand is the
// authority for a placement file's routeBand (G8) — the band is asserted
// across files, never retyped from prose.
function loadGeographyZones(path) {
  const before = failures.length;
  const doc = readJson(path, "geography", fail);
  if (failures.length > before) return null;
  if (!doc || !Array.isArray(doc.zones)) {
    fail(`geography: ${path} is shape-invalid — expected { zones: [...] }`);
    return null;
  }
  const byId = new Map();
  for (const z of doc.zones) {
    if (!z || typeof z.id !== "string") continue;
    byId.set(z.id, z);
  }
  return byId;
}
```

- [ ] **Step 4: Add the gate function**

Add `checkBestiaryPlacement()` directly below `checkMaps()` (ends `:656`):

```js
// I-059: zone placement gate. Placement is OPTIONAL content — a root with no
// bestiary/ dir, or none matching placement-*.json, skips (mirrors the maps
// soft-skip). Once a file exists it is checked STRICTLY, because the file is
// complete for its zone by construction: "every design placed exactly once"
// (G4, Task 3) is a FAIL, not a warning, and that completeness is the point.
function checkBestiaryPlacement(opts) {
  const dir = join(opts.contentRoot, "bestiary");
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => /^placement-.+\.json$/.test(f)).sort();
  if (!files.length) return 0;

  const validate = compileSchema(
    join(opts.contentRoot, "schemas/bestiary-placement.schema.json"),
    "bestiary-placement schema", fail);
  if (!validate) return 0;

  // Both are REQUIRED once a placement file exists: every rule below is a
  // cross-file assertion against one of them.
  const designs = loadBestiaryDesigns(join(dir, "bestiary.json"));
  const zones = loadGeographyZones(join(opts.contentRoot, "maps/cluster1-geography.json"));
  if (!designs || !zones) return 0;

  let count = 0;
  for (const file of files) {
    const label = `bestiary/${file}`;
    const before = failures.length;
    const doc = readJson(join(dir, file), label, fail);
    if (failures.length > before) continue;

    if (!validate(doc)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream rules assume a valid shape
    }

    // G1 — the zone exists in the Cartographer's geography
    const zone = zones.get(doc.zone);
    if (!zone) {
      fail(`${label}: zone "${doc.zone}" not in cluster1-geography.json#zones`);
      continue; // every remaining rule is relative to the zone
    }

    // G2 — bestiaryRegion is a region key the roster actually uses
    const zoneDesigns = [...designs.values()].filter((d) => d.region === doc.bestiaryRegion);
    if (!zoneDesigns.length)
      fail(`${label}: bestiaryRegion "${doc.bestiaryRegion}" matches no design in bestiary.json`);

    for (const p of doc.placements) {
      // G3 — the named design exists
      const design = designs.get(p.design);
      if (!design) {
        fail(`${label}: design "${p.design}" not in bestiary.json`);
        continue;
      }
      // and it belongs to this zone's region
      if (design.region !== doc.bestiaryRegion)
        fail(`${label}: design "${p.design}" has region "${design.region}", not "${doc.bestiaryRegion}"`);
    }

    count++;
  }
  return count;
}
```

- [ ] **Step 5: Wire it into `main()` and `finish()`**

Replace `main()` (`:91-98`):

```js
function main() {
  const opts = parseArgs(process.argv);
  const mobTypes = loadMobTypes(opts.mobTypes);
  const story = checkStory(opts, mobTypes);
  const sheetCount = checkCharacters(opts, story.ids);
  const mapCount = checkMaps(opts, mobTypes);
  const placementCount = checkBestiaryPlacement(opts);
  return finish(sheetCount, mapCount, story.count, placementCount);
}
```

Replace `finish()` (`:657-662`):

```js
function finish(sheetCount = 0, mapCount = 0, storyCount = 0, placementCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`content-gate: ${sheetCount} sheets, ${mapCount} maps, ${storyCount} story, ${placementCount} placements, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 7: Verify the existing gate tests still pass**

Run: `cd scripts && node --test tests/check_content.test.mjs`
Expected: PASS. Those fixtures have no `bestiary/` directory, so they must take the soft-skip. Any failure here means the skip is wrong.

- [ ] **Step 8: Run the real gate**

Run: `node scripts/check_content.mjs`
Expected: exit 0, and the summary line now reads `… 1 placements, 0 failures, 0 warnings`.

- [ ] **Step 9: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/bestiary-placement.test.mjs
git commit -m "feat(I-059): gate placement files on zone, region and design refs"
```

- [ ] **Step 10: Quality gate** — run the five-step gate at the top of this plan.

---

### Task 3: G4 — every zone design placed exactly once

The load-bearing rule. Without it the file says "some designs have a location"; with it the file says "this zone is completely placed, and the gate knows".

**Files:**
- Modify: `scripts/check_content.mjs` (inside `checkBestiaryPlacement()`)
- Test: `scripts/tests/bestiary-placement.test.mjs`

**Interfaces:**
- Consumes: `zoneDesigns` and `doc.placements` from Task 2's loop; the existing helper `findDuplicateGroups(items, keyFn)` at `:221`, which returns `[[key, group], …]` for keys appearing more than once.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/bestiary-placement.test.mjs`:

```js
test("G4: a zone design left unplaced fails", () => {
  const doc = placement();
  doc.placements = [{ design: "mob-veil-cub", tier: "verge", locale: "l" }];
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /design "mob-bramble-warden" .* is not placed/);
});

test("G4: a design placed twice fails", () => {
  const doc = placement();
  doc.placements.push({ design: "mob-veil-cub", tier: "route", locale: "l" });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /design "mob-veil-cub" placed 2 times/);
});

test("G4: a design from another region is not required here", () => {
  // mob-millpond-gnawer is region millcross; a thornveil file must not be
  // asked to place it, and must not fail for omitting it.
  const r = runGate(fixture({ placements: { "placement-thornveil.json": placement() } }));
  assert.equal(r.code, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: the first two new tests FAIL with exit code 0 where 1 was expected. The third already passes — it is a regression guard, not a new rule.

- [ ] **Step 3: Implement G4**

In `checkBestiaryPlacement()`, immediately after the `for (const p of doc.placements)` loop and before `count++`:

```js
    // G4 — completeness. This is what makes the file trustworthy: the roster
    // is the authority on which designs belong to this zone, and every one of
    // them must appear here exactly once. Missing = the zone is not placed;
    // duplicated = two locations claim the same design.
    for (const [design, group] of findDuplicateGroups(doc.placements, (p) => p.design))
      fail(`${label}: design "${design}" placed ${group.length} times`);

    const placed = new Set(doc.placements.map((p) => p.design));
    for (const d of zoneDesigns)
      if (!placed.has(d.id))
        fail(`${label}: design "${d.id}" (region "${doc.bestiaryRegion}") is not placed`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Prove G4 catches a real omission**

Temporarily delete the last entry of `content/bestiary/placement-thornveil.json`'s `placements` array, then run:

Run: `node scripts/check_content.mjs`
Expected: exit 1 with `FAIL  bestiary/placement-thornveil.json: design "mob-heartwood-tyrant" (region "thornveil") is not placed`.

Then restore the entry (`git checkout content/bestiary/placement-thornveil.json`) and re-run — expect exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/bestiary-placement.test.mjs
git commit -m "feat(I-059): require every zone design placed exactly once"
```

- [ ] **Step 7: Quality gate** — run the five-step gate at the top of this plan.

---

### Task 4: G5–G8 — tier and band consistency

**Files:**
- Modify: `scripts/check_content.mjs` (inside `checkBestiaryPlacement()`)
- Test: `scripts/tests/bestiary-placement.test.mjs`

**Interfaces:**
- Consumes: `doc.depthTiers`, `zone.levelBand` from Task 2.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/tests/bestiary-placement.test.mjs`:

```js
test("G5: an undeclared tier fails", () => {
  const doc = placement();
  doc.placements[0].tier = "basement";
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /tier "basement" is not a declared depthTier/);
});

test("G6: a band disjoint from its tier fails", () => {
  const doc = placement();
  // mob-veil-cub is band 1-10; tier route is 15-28 — no overlap at all.
  doc.placements[0].tier = "route";
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /band 1-10 is disjoint from tier "route"/);
});

test("G6: a band straddling a tier edge is legal", () => {
  // mob-bramble-warden is band 21-30; tier route is 15-28. It straddles the
  // 28/29 edge and must be accepted — straddling is why placement is authored
  // rather than computed.
  const r = runGate(fixture({ placements: { "placement-thornveil.json": placement() } }));
  assert.equal(r.code, 0);
});

test("G7: non-contiguous tiers fail", () => {
  const doc = placement({ depthTiers: [
    { id: "verge", label: "V", bandFloor: 1, bandCeil: 14, summary: "s" },
    { id: "route", label: "R", bandFloor: 20, bandCeil: 28, summary: "s" },
  ] });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /not contiguous \(14 -> 20\)/);
});

test("G8: routeBand disagreeing with the geography fails", () => {
  const doc = placement({ routeBand: [10, 40] });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /routeBand \[10,40\] != geography levelBand \[15,28\]/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: the four new failure tests FAIL (exit 0 where 1 expected); the straddle test already passes as a guard.

- [ ] **Step 3: Implement G7 and G8**

In `checkBestiaryPlacement()`, immediately after the G1 zone lookup:

```js
    // G8 — the route band is the geography's band, asserted across files
    // rather than retyped from prose.
    const geoBand = Array.isArray(zone.levelBand) ? zone.levelBand : null;
    if (!geoBand || geoBand.length !== 2)
      fail(`${label}: zone "${doc.zone}" has no two-element levelBand in the geography`);
    else if (doc.routeBand[0] !== geoBand[0] || doc.routeBand[1] !== geoBand[1])
      fail(`${label}: routeBand [${doc.routeBand}] != geography levelBand [${geoBand}] for zone "${doc.zone}"`);

    // G7 — tiers must ascend, be contiguous, and not overlap. A gap or an
    // overlap means some level has no tier, or two.
    const tiers = doc.depthTiers;
    const seenTierIds = new Set();
    for (const t of tiers) {
      if (seenTierIds.has(t.id)) fail(`${label}: duplicate depthTier id "${t.id}"`);
      seenTierIds.add(t.id);
      if (t.bandCeil < t.bandFloor)
        fail(`${label}: depthTier "${t.id}" bandCeil ${t.bandCeil} < bandFloor ${t.bandFloor}`);
    }
    for (let i = 1; i < tiers.length; i++)
      if (tiers[i].bandFloor !== tiers[i - 1].bandCeil + 1)
        fail(`${label}: depthTiers "${tiers[i - 1].id}" -> "${tiers[i].id}" not contiguous (${tiers[i - 1].bandCeil} -> ${tiers[i].bandFloor})`);
```

- [ ] **Step 4: Implement G5 and G6**

Inside the `for (const p of doc.placements)` loop, after the region-match check from Task 2:

```js
      // G5 — the tier is one this file declares
      const tier = tiers.find((t) => t.id === p.tier);
      if (!tier) {
        fail(`${label}: design "${p.design}" tier "${p.tier}" is not a declared depthTier`);
        continue;
      }

      // G6 — the design's band must OVERLAP its tier. Bands are 10 wide and
      // tier edges do not fall on multiples of 10, so straddling is normal and
      // legal; only a fully disjoint pair is an error.
      const [bandLo, bandHi] = String(design.levelBand).split("-").map(Number);
      if (!Number.isFinite(bandLo) || !Number.isFinite(bandHi))
        fail(`${label}: design "${p.design}" has unparseable levelBand "${design.levelBand}"`);
      else if (bandHi < tier.bandFloor || bandLo > tier.bandCeil)
        fail(`${label}: design "${p.design}" band ${design.levelBand} is disjoint from tier "${p.tier}" (${tier.bandFloor}-${tier.bandCeil})`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd scripts && node --test tests/bestiary-placement.test.mjs`
Expected: PASS, 16 tests.

- [ ] **Step 6: Run the whole suite and the real gate**

Run, from the repo root:

```bash
(cd scripts && npm test) && node scripts/check_content.mjs && node scripts/report_season1.mjs
```

Expected: all tests pass (139 pre-existing + the new file); gate exits 0 with `1 placements, 0 failures`; budget report **identical** to Task 1 Step 8.

- [ ] **Step 7: Commit**

```bash
git add scripts/check_content.mjs scripts/tests/bestiary-placement.test.mjs
git commit -m "feat(I-059): gate tier declarations, band overlap and route band"
```

- [ ] **Step 8: Quality gate** — run the five-step gate at the top of this plan.

---

### Task 5: The Naturalist document

Records the derivation the data encodes, so the next nine zones have a worked example rather than a schema.

**Files:**
- Create: `docs/worldbuilding/A2-ecology-thornveil.md`

**Interfaces:**
- Consumes: the tier ids and locales committed in Task 1.
- Produces: the reference `A2-ecology-<zone>.md` shape for the remaining zones.

- [ ] **Step 1: Write the document**

Create `docs/worldbuilding/A2-ecology-thornveil.md`, following the house style of `A1-geography-cluster1.md` (numbered `##` sections, `<div class="callout …">`, `<div class="metric-grid">`, Mermaid where a diagram carries the argument). Required sections and their load-bearing content:

1. **Header block** — `**Level:** L2 · **Role:** Naturalist (roles charter §2.2) · **Date:** …`, parents `A1 §3, §4.2, §4.3`, `content/bestiary/README.md`, and the spec.
2. **§1 The one fact everything follows from** — A1 §4.2 calls Thornveil *"the interfluve between the river and the eastern hills — the ground every road went around, so it stayed nobody's."* An interfluve is the dry land between two drainages. State the chain explicitly: no through-stream → water is dew, stone-hollow catch and sap → drought-tolerant thorn is what grows → no farm and no road → the ground stayed nobody's.
3. **§2 Water** — sap is the only reliable water. Name the two sap-feeders the roster already contains (`mob-thornhusk-weaver`, `mob-sapdrinker-swarm`) as the consequence, not the illustration. State that **the bramble is the water table**, and that this is why `mob-heartwood-tyrant` — the deepest root mass — sits at the centre and at band 61-70.
4. **§3 Vegetation** — `terrainKind: "bramble"` from `content/maps/cluster1-geography.json#zones[thornveil]`. Age structure: cut-back young growth at the verge, standing wall along the route, uncut body inside, heartwood at the centre.
5. **§4 The food chain** — a Mermaid `flowchart LR`. Bramble is producer *and* terrain (`content/bestiary/README.md`: *"almost entirely Thornveil; holds ground rather than chasing"*); insects feed on sap; `mob-veil-cub` is the zone's one ordinary animal; drakes are apex (README: *"sit at the top of a region's food chain"*). The three `raider` designs sit **outside** the web — people who moved into the one ground no road overlooks. Quote both README lines; do not paraphrase them as if they were derived here.
6. **§5 The roads skirt it** — `cluster1-geography.json#roads[terrace-track-north]` ("up the terrace"), whose own `note` reads *"the north-east fork runs up the river terrace to the camp, Thornveil's edge and the ice."* Its points run x≈96→110 against the zone polygon at x≈104–142: it grazes the western edge and never enters. State explicitly that `east-rim-track` does **not** touch the zone (`norhollow → coastal-spur`, x≈36–74) — an earlier draft of this work asserted that it did, and the correction is worth recording.
7. **§6 The depth model** — the four tiers with their bands and the reasoning, plus the table of all 14 designs by tier. State that A1 §4.2's `[15, 28]` is **not amended**; it describes the skirting route. Cite the precedent: A1 §4.3 already treats Ashvale Front as a gradient (southern lip 10–25 / middle 25–50 / northern deep 55–80).
8. **§7 Why placement is authored, not computed** — band 11-20 straddles the verge/route edge at 14/15 and band 21-30 straddles route/interior at 28/29, so no formula from `levelBand` can produce these tiers.
9. **§8 What this hands forward** — I-062 gets two apex candidates and the tension between them (`mob-heartwood-tyrant`, `plant`, 61-70 vs `mob-thorncrown-drake`, `drake`, 51-60, where the README makes `drake` the apex family). I-064 gets the tier as the spawn-table axis. Neither is decided here.

Every factual claim attributed to A1, the bestiary README or the geography JSON must cite file and section inline.

- [ ] **Step 2: Verify every citation resolves**

For each cited line, confirm the quoted text is actually present:

```bash
grep -n "interfluve between the river" docs/worldbuilding/A1-geography-cluster1.md
grep -n "holds ground rather than chasing" content/bestiary/README.md
grep -n "top of a region's food chain" content/bestiary/README.md
grep -n "Thornveil's edge" content/maps/cluster1-geography.json
```

Expected: each returns a match. A citation that does not resolve is a defect — this is the check that caught the east-rim-track error.

- [ ] **Step 3: Validate the Mermaid block renders**

Run, from the repo root:

```bash
S=.mmd-check && mkdir -p "$S"
awk -v dir="$S" '/^```mermaid/{i=1;n++;f=sprintf("%s/b_%03d.mmd",dir,n);next} /^```/{i=0;next} i{print > f}' docs/worldbuilding/A2-ecology-thornveil.md
for b in "$S"/b_*.mmd; do mmdc -i "$b" -o "$b.svg" >/dev/null 2>&1 && echo "OK $b" || echo "BROKEN $b"; done
rm -rf "$S"
```

Expected: `OK` for every block. A broken block renders as "Syntax error in text" for the reader. Keep labels quoted and free of `{ } ( )`. Delete `.mmd-check` before committing — `rm -rf` above does it, but confirm with `git status --short`.

- [ ] **Step 4: Render and review in the browser**

Run: `bash ~/.claude/scripts/render-spec-md.sh docs/worldbuilding/A2-ecology-thornveil.md`

If it produces no HTML, the path is outside the script's whitelist — render directly instead:

```bash
pandoc docs/worldbuilding/A2-ecology-thornveil.md -s --toc --toc-depth=2 \
  -H ~/.claude/spec-style.html -o docs/worldbuilding/A2-ecology-thornveil.html
open -a "Google Chrome" "file://$(pwd)/docs/worldbuilding/A2-ecology-thornveil.html"
```

Expected: the page opens, the diagram draws, the callouts and metric tiles are styled. The `.html` is a local view artifact — do **not** commit it.

- [ ] **Step 5: Final full verification**

Run, from the repo root:

```bash
(cd scripts && npm test) && node scripts/check_content.mjs && node scripts/report_season1.mjs && git status --short
```

Expected: tests pass; gate exits 0 with `1 placements, 0 failures, 0 warnings`; budget report identical to Task 1 Step 8; `git status` shows no stray `.html` staged.

- [ ] **Step 6: Commit**

```bash
git add docs/worldbuilding/A2-ecology-thornveil.md
git commit -m "docs(I-059): Thornveil ecology — the Naturalist derivation"
```

- [ ] **Step 7: Quality gate** — run the five-step gate at the top of this plan.

---

## Definition of done

Matches the spec's Verification section:

1. `node scripts/check_content.mjs` exits 0 and prints `1 placements`.
2. Each of G1–G8 has a test shown failing before its rule existed and passing after.
3. `cd scripts && npm test` passes — 139 pre-existing tests plus the new file, with `check_content.test.mjs` unchanged.
4. `node scripts/report_season1.mjs` is identical before and after — paste both.
5. All fourteen `thornveil` designs are placed, proven by G4 rather than by eye.
6. `A2-ecology-thornveil.md` has been rendered and read in the browser.
7. Every citation in the Naturalist document resolves to real text in the file it names.
8. `git diff` touches no file outside the six in the File Structure table.
