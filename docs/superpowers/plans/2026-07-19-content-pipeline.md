# F-005 Game Content Authoring Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `content/` package of schema-validated character sheets + a CI content gate, proven by 2 retrofit sheets and 1 sheet-first bespoke character forged via F-003.

**Architecture:** Markdown files with typed YAML frontmatter are the source of truth for character design; `scripts/check_content.mjs` validates them against JSON Schema and cross-links them with `colyseus-server/generated/asset-keys.json` and `game-client/assets/manifest.json`, wired into CI beside the existing asset drift-gate. Spec: `docs/superpowers/specs/2026-07-19-content-pipeline-design.md`.

**Tech Stack:** Node ESM (`node:test`), `js-yaml`, `ajv` (draft-07), existing F-003 forge toolchain (Blender 4.5 headless, gltf-validator).

## Global Constraints

- Stats in frontmatter are **descriptive enums, never numbers** (spec decision 3).
- `content/characters/` filenames are kebab-case slugs; files starting with `_` are ignored by the gate (template).
- The gate is **additive** — no change to `check_asset_manifest.mjs`, forge, or manifests' behavior.
- Gate exit codes: 0 = pass (warns allowed), 1 = any hard failure; `--require-complete` escalates coverage warns to failures (mirror `check_asset_manifest.mjs` discipline).
- Character-kind coverage scope = keys with `kind: "character"` in `asset-keys.json` (today: `player`, `npc`, `mob:*` ×6). Projectile/zone keys are out of scope.
- `tier` in a sheet = the tier the asset is expected at; cross-checked against the manifest **only** when `status` is `forged` or `shipped` (a `concept` sheet states intent).
- All commits on the F-005 feature branch, conventional subjects, never `--amend`.
- Every task ends verified (commands + expected output below); reviews run per the SDD two-stage process.

---

### Task 1: Content package scaffold (schemas, template, world bible v0)

**Files:**
- Create: `content/README.md`
- Create: `content/schemas/character.schema.json`
- Create: `content/schemas/story.schema.json`
- Create: `content/schemas/map.schema.json`
- Create: `content/characters/_template.md`
- Create: `content/story/bible.md`
- Create: `content/maps/.gitkeep` (empty file)

**Interfaces:**
- Produces: `character.schema.json` (draft-07, consumed verbatim by Task 2's gate); `_template.md` frontmatter shape (copied by Tasks 4–5); bible section ids (`faction-*`, `region-*`) referenced by sheets' `links.story`.

- [ ] **Step 1: Write `content/schemas/character.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas character sheet frontmatter",
  "type": "object",
  "required": ["id", "assetKey", "name", "role", "status", "tier", "stats", "links"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "assetKey": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
    "role": { "enum": ["enemy", "boss", "npc", "player-skin"] },
    "status": { "enum": ["concept", "forged", "shipped"] },
    "tier": { "enum": ["seed", "bespoke"] },
    "stats": {
      "type": "object",
      "required": ["archetype", "durability", "speed", "threat"],
      "additionalProperties": false,
      "properties": {
        "archetype": { "enum": ["bruiser", "skirmisher", "tank", "caster", "support"] },
        "durability": { "enum": ["low", "mid", "high"] },
        "speed": { "enum": ["low", "mid", "high"] },
        "threat": { "enum": ["melee", "ranged", "zone"] }
      }
    },
    "links": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "story": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

- [ ] **Step 2: Write the two stub schemas**

`content/schemas/story.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Atlas story entry frontmatter (stub — expand in roadmap #3)",
  "type": "object",
  "required": ["id", "title"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$" },
    "title": { "type": "string", "minLength": 1 },
    "links": { "type": "array", "items": { "type": "string" } }
  }
}
```

`content/schemas/map.schema.json`: identical JSON but `"title": "Atlas map spec frontmatter (stub — expand in roadmap #4)"`.

- [ ] **Step 3: Write `content/characters/_template.md`**

````markdown
---
id: my-character-slug            # must equal the filename (without .md)
assetKey: "mob:balanced"         # must exist in colyseus-server/generated/asset-keys.json
name: "Display Name"
role: enemy                      # enemy | boss | npc | player-skin
status: concept                  # concept -> forged -> shipped
tier: bespoke                    # tier the asset is EXPECTED at; only cross-checked
                                 # against the manifest once status is forged/shipped
stats:                           # descriptive enums — design intent, NOT balance numbers
  archetype: bruiser             # bruiser | skirmisher | tank | caster | support
  durability: mid                # low | mid | high
  speed: mid                     # low | mid | high
  threat: melee                  # melee | ranged | zone
links:
  story: []                      # bible section ids, e.g. [faction-ashfang]
---

## Lore

Who this character is, why it exists in the world. Anchor to bible nouns
(factions, regions) — do not invent new world nouns here; add them to
`content/story/bible.md` first.

## Visual Brief

The forge's input. Cover: silhouette, palette, scale target (world units),
donor/rig (Kenney kitbash or KayKit rig), distinguishing feature, and any
clip-mapping notes (`anims` override) if not using rig defaults.

## Design Notes

Optional: balance intent, behavior hooks, open questions.
````

- [ ] **Step 4: Write `content/story/bible.md` (world bible v0 — real creative seed, free prose)**

````markdown
# Atlas World Bible — v0

Free-prose source of truth for setting, tone, factions, regions. Character
sheets anchor to the ids in parentheses via `links.story`. Formal schema
lands with roadmap #3; until then, keep ids stable (kebab-case headings).

## Premise (premise)

Atlas is a fractured frontier continent. Expedition parties (players) push
out from a fortified meadow camp into wilds that were sealed for a
generation and did not stay empty. Every creature out there belongs to
something — a pack, an order, a leftover war. Nothing attacks for no reason.

## Tone (tone)

Grounded low fantasy, readable at a glance: chunky silhouettes, warm camp /
cold wilds contrast. Danger is territorial, not evil — mobs defend, hunt, or
patrol; they don't scheme. Naming: hard consonants for hostiles (Ashfang,
Stoneguard), softer compounds for places (Thornveil, Icefield).

## Regions

### Spawn Meadow (region-spawn-meadow)
The safe-ish landing: tall grass, expedition tents, training dummies. Zone
effects here are practice hazards, not threats.

### Northern Icefield (region-icefield)
~175u north of camp: a frozen shelf where freeze/stun zones occur naturally.
Home turf of the Stoneguard. First real difficulty step.

### Thornveil (region-thornveil)
Bramble forest east of the meadow — dense sightlines, ranged ambushes.
Spear-thrower territory.

## Factions

### Ashfang packs (faction-ashfang)
Aggressive pack hunters — scarred hide, ember-red markings. Charge on
sight; overwhelm through pressure, not tactics. (Asset key family:
`mob:aggressive`.)

### Stoneguard remnant (faction-stoneguard)
A defensive order that outlived whatever it guarded. Slate-grey, broad,
slow; holds ground and punishes overreach. (`mob:defensive`.)

### Thornveil skirmishers (faction-thornveil)
Lean, fast, territorial spear-throwers of the eastern brambles. Strike from
range, relocate, repeat. (`mob:spear_thrower`.)

### Unaligned wilds (faction-unaligned)
Everything not yet claimed by a faction: `mob:balanced`, `mob:hybrid`,
`mob:double_attacker`, and the camp `npc`. Assign as their sheets get
written (roadmap #1).

## Timeline (timeline)

v0 stub — one era: "the Reopening" (now). Expand when quests need history.
````

- [ ] **Step 5: Write `content/README.md`** — authoring runbook (pattern: `docs/asset-intake.md`): what `content/` is, the sheet lifecycle `concept → forged → shipped`, how to add a character (copy `_template.md`, fill, run the gate), the workflow diagram from the spec (author → gate → forge → gate → verify → ship), gate usage (`node scripts/check_content.mjs`, `--require-complete`), and the source-of-truth boundary (enums now, numbers stay server-side). Keep under ~80 lines; link to the spec for rationale.

- [ ] **Step 6: Create `content/maps/.gitkeep`** (empty), then verify + commit

Run: `python3 -c "import json;[json.load(open(f)) for f in ['content/schemas/character.schema.json','content/schemas/story.schema.json','content/schemas/map.schema.json']];print('schemas OK')"`
Expected: `schemas OK`

```bash
git add content/
git commit -m "feat(content): content package scaffold — schemas, template, world bible v0 (F-005 T1)"
```

---

### Task 2: Content gate — `scripts/check_content.mjs` + tests

**Files:**
- Create: `scripts/package.json`
- Create: `scripts/check_content.mjs`
- Test: `scripts/tests/check_content.test.mjs`

**Interfaces:**
- Consumes: `content/schemas/character.schema.json` (Task 1); `colyseus-server/generated/asset-keys.json` `{version, keys:[{id,kind}]}`; `game-client/assets/manifest.json` `{version:2, entries:{<key>:{scene,tier,kind,...}}}`.
- Produces: CLI `node scripts/check_content.mjs [--content-root D] [--keys F] [--manifest F] [--require-complete]`, exit 0/1, summary line `content-gate: N sheets, F failures, W warnings`. Tests run via `npm test --prefix scripts`.

- [ ] **Step 1: Write `scripts/package.json`**

```json
{
  "name": "@atlas/content-gate",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "js-yaml": "^4.1.0"
  }
}
```

Run: `npm install --prefix scripts` (creates `scripts/node_modules`, `scripts/package-lock.json` — commit the lockfile, node_modules is already git-ignored globally; verify with `git check-ignore scripts/node_modules || echo ADD-IGNORE` and if `ADD-IGNORE` prints, append `scripts/node_modules/` to `.gitignore`).

Note: `node --test tests/` (directory form) works on Node ≥20 and avoids the Node-18 glob pitfall recorded in the F-003 ledger.

- [ ] **Step 2: Write failing tests `scripts/tests/check_content.test.mjs`**

Tests spawn the gate as a subprocess against fixture trees built in `mkdtemp` dirs — same black-box style as the forge suite, no exported internals needed.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = join(ROOT, "scripts/check_content.mjs");

const KEYS = {
  version: 1,
  keys: [
    { id: "mob:aggressive", kind: "character" },
    { id: "mob:balanced", kind: "character" },
    { id: "projectile:arrow", kind: "vfx" },
  ],
};
const MANIFEST = {
  version: 2,
  entries: {
    "mob:aggressive": { scene: "res://a.glb", tier: "bespoke", kind: "character", license: "CC0", source: "internal" },
    "mob:balanced": { scene: "res://b.glb", tier: "seed", kind: "character", license: "CC0", source: "market" },
  },
};

const GOOD_SHEET = `---
id: mob-aggressive-brute
assetKey: "mob:aggressive"
name: "Ashfang Brute"
role: enemy
status: shipped
tier: bespoke
stats:
  archetype: bruiser
  durability: high
  speed: low
  threat: melee
links:
  story: [faction-ashfang]
---

## Lore

Pack hunter.

## Visual Brief

Bulked Kenney kitbash, ember palette, 1.8u.
`;

function fixture({ sheets = {}, keys = KEYS, manifest = MANIFEST } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "content-gate-"));
  mkdirSync(join(dir, "content/characters"), { recursive: true });
  mkdirSync(join(dir, "content/schemas"), { recursive: true });
  cpSync(join(ROOT, "content/schemas/character.schema.json"),
         join(dir, "content/schemas/character.schema.json"));
  for (const [name, body] of Object.entries(sheets))
    writeFileSync(join(dir, "content/characters", name), body);
  writeFileSync(join(dir, "keys.json"), JSON.stringify(keys));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

function runGate(dir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [
      GATE,
      "--content-root", join(dir, "content"),
      "--keys", join(dir, "keys.json"),
      "--manifest", join(dir, "manifest.json"),
      ...extra,
    ], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("valid sheet passes with coverage warn for unsheeted key", () => {
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": GOOD_SHEET } });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*mob:balanced/);
});

test("schema violation is a hard fail", () => {
  const bad = GOOD_SHEET.replace("archetype: bruiser", "archetype: chonker");
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": bad } });
  assert.equal(runGate(dir).code, 1);
});

test("id/filename mismatch is a hard fail", () => {
  const dir = fixture({ sheets: { "wrong-name.md": GOOD_SHEET } });
  assert.equal(runGate(dir).code, 1);
});

test("unknown assetKey is a hard fail", () => {
  const bad = GOOD_SHEET.replace('assetKey: "mob:aggressive"', 'assetKey: "mob:nope"');
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": bad } });
  assert.equal(runGate(dir).code, 1);
});

test("non-character assetKey is a hard fail", () => {
  const bad = GOOD_SHEET.replace('assetKey: "mob:aggressive"', 'assetKey: "projectile:arrow"');
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": bad } });
  assert.equal(runGate(dir).code, 1);
});

test("forged/shipped tier mismatch vs manifest is a hard fail", () => {
  const bad = GOOD_SHEET.replace("tier: bespoke", "tier: seed");
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": bad } });
  assert.equal(runGate(dir).code, 1);
});

test("concept sheet skips manifest cross-check", () => {
  const concept = GOOD_SHEET
    .replace("status: shipped", "status: concept")
    .replace('assetKey: "mob:aggressive"', 'assetKey: "mob:balanced"')
    .replace("id: mob-aggressive-brute", "id: mob-balanced-x")
    .replace("tier: bespoke", "tier: bespoke"); // intent tier differs from manifest seed — allowed at concept
  const dir = fixture({ sheets: { "mob-balanced-x.md": concept, "mob-aggressive-brute.md": GOOD_SHEET } });
  assert.equal(runGate(dir).code, 0);
});

test("missing required heading is a warn, not a fail", () => {
  const noBrief = GOOD_SHEET.replace("## Visual Brief", "## Whatever");
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": noBrief } });
  const r = runGate(dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /WARN.*Visual Brief/);
});

test("--require-complete escalates coverage warns to failure", () => {
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": GOOD_SHEET } });
  assert.equal(runGate(dir, ["--require-complete"]).code, 1);
});

test("underscore-prefixed files are ignored", () => {
  const dir = fixture({ sheets: { "_template.md": "not: [valid", "mob-aggressive-brute.md": GOOD_SHEET } });
  assert.equal(runGate(dir).code, 0);
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm test --prefix scripts`
Expected: FAIL — every test errors (gate file does not exist / non-zero on spawn).

- [ ] **Step 4: Write `scripts/check_content.mjs`**

```js
#!/usr/bin/env node
// Content gate (F-005): content/characters/*.md ↔ schema ↔ asset keys ↔ manifest.
// Spec: docs/superpowers/specs/2026-07-19-content-pipeline-design.md
// Discipline mirrors scripts/check_asset_manifest.mjs: warns allowed at exit 0,
// any hard failure exits 1, --require-complete escalates coverage warns.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    contentRoot: join(ROOT, "content"),
    keys: join(ROOT, "colyseus-server/generated/asset-keys.json"),
    manifest: join(ROOT, "game-client/assets/manifest.json"),
    requireComplete: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content-root") opts.contentRoot = resolve(argv[++i]);
    else if (a === "--keys") opts.keys = resolve(argv[++i]);
    else if (a === "--manifest") opts.manifest = resolve(argv[++i]);
    else if (a === "--require-complete") opts.requireComplete = true;
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return opts;
}

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { fail(`${label}: cannot read/parse ${path}: ${e.message}`); return null; }
}

// Frontmatter split: file must start with "---\n"; frontmatter ends at next "\n---\n".
function splitFrontmatter(raw, file) {
  if (!raw.startsWith("---\n")) { fail(`${file}: missing YAML frontmatter block`); return null; }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) { fail(`${file}: unterminated frontmatter block`); return null; }
  let fm;
  try { fm = yaml.load(raw.slice(4, end)); }
  catch (e) { fail(`${file}: frontmatter YAML parse error: ${e.message}`); return null; }
  return { fm, body: raw.slice(end + 5) };
}

function sectionText(body, heading) {
  const re = new RegExp(`^## ${heading}\\s*$`, "m");
  const m = re.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function main() {
  const opts = parseArgs(process.argv);
  const keysDoc = readJson(opts.keys, "asset-keys");
  const manifestDoc = readJson(opts.manifest, "manifest");
  const schema = readJson(join(opts.contentRoot, "schemas/character.schema.json"), "character schema");
  if (!keysDoc || !manifestDoc || !schema) return finish(opts);

  const keyKinds = new Map(keysDoc.keys.map((k) => [k.id, k.kind]));
  const entries = manifestDoc.entries ?? {};
  const validate = new Ajv({ allErrors: true }).compile(schema);

  const dir = join(opts.contentRoot, "characters");
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).sort();
  } catch (e) { fail(`characters dir unreadable: ${dir}: ${e.message}`); }

  const sheetedKeys = new Set();
  for (const file of files) {
    const label = `characters/${file}`;
    const parsed = splitFrontmatter(readFileSync(join(dir, file), "utf8"), label);
    if (!parsed) continue;
    const { fm, body } = parsed;

    // (1) schema
    if (!validate(fm)) {
      for (const err of validate.errors)
        fail(`${label}: schema ${err.instancePath || "/"} ${err.message}`);
      continue; // downstream checks assume a valid shape
    }
    // id = filename slug
    if (fm.id !== basename(file, ".md"))
      fail(`${label}: id "${fm.id}" != filename slug "${basename(file, ".md")}"`);

    // (2) forward link-check
    const kind = keyKinds.get(fm.assetKey);
    if (kind === undefined) fail(`${label}: assetKey "${fm.assetKey}" not in asset-keys.json`);
    else if (kind !== "character") fail(`${label}: assetKey "${fm.assetKey}" is kind "${kind}", not character`);
    else {
      if (sheetedKeys.has(fm.assetKey)) fail(`${label}: duplicate sheet for assetKey "${fm.assetKey}"`);
      sheetedKeys.add(fm.assetKey);
      if (fm.status === "forged" || fm.status === "shipped") {
        const entry = entries[fm.assetKey];
        if (!entry) fail(`${label}: status ${fm.status} but "${fm.assetKey}" missing from manifest`);
        else if (entry.tier !== fm.tier)
          fail(`${label}: tier "${fm.tier}" != manifest tier "${entry.tier}" for "${fm.assetKey}"`);
      }
    }

    // (4) structure
    const lore = sectionText(body, "Lore");
    const brief = sectionText(body, "Visual Brief");
    if (lore === null) warn(`${label}: missing "## Lore" heading`);
    if (brief === null) warn(`${label}: missing "## Visual Brief" heading`);
    else if (fm.status === "concept" && brief === "")
      warn(`${label}: empty Visual Brief on a concept sheet — cannot be forged`);
  }

  // (3) reverse link-check / coverage
  for (const [id, kind] of keyKinds) {
    if (kind !== "character" || sheetedKeys.has(id)) continue;
    const msg = `coverage: character key "${id}" has no sheet`;
    opts.requireComplete ? fail(msg) : warn(msg);
  }

  return finish(opts, files.length);
}

function finish(_opts, sheetCount = 0) {
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`content-gate: ${sheetCount} sheets, ${failures.length} failures, ${warnings.length} warnings`);
  process.exit(failures.length ? 1 : 0);
}

main();
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test --prefix scripts`
Expected: `pass 10` / `fail 0`.

- [ ] **Step 6: Run the gate against the real repo**

Run: `node scripts/check_content.mjs`
Expected: exit 0; `content-gate: 0 sheets, 0 failures, 8 warnings` (all 8 character keys uncovered).

- [ ] **Step 7: Commit**

```bash
git add scripts/package.json scripts/package-lock.json scripts/check_content.mjs scripts/tests/
git commit -m "feat(content): check_content.mjs gate — schema + link + coverage checks with tests (F-005 T2)"
```

---

### Task 3: CI wiring

**Files:**
- Modify: `.github/workflows/ci.yml` (after the "Asset manifest drift-gate" step, before the forge step)

**Interfaces:**
- Consumes: Task 2's CLI; the job already runs `gen-asset-keys.sh` first, so the gate sees fresh keys.

- [ ] **Step 1: Add the CI step**

```yaml
      # Content gate (F-005): character sheets must validate against schema
      # and stay linked to real asset keys / manifest tiers. Coverage gaps
      # (character keys with no sheet) are warnings until roadmap #1 flips
      # --require-complete.
      - name: Content gate (sheets ↔ schema ↔ keys ↔ manifest)
        run: |
          npm ci --prefix scripts
          node scripts/check_content.mjs
```

- [ ] **Step 2: Verify locally exactly as CI runs it**

Run: `npm ci --prefix scripts && node scripts/check_content.mjs; echo "exit=$?"`
Expected: `exit=0`, 8 coverage warns.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(content): wire content gate beside asset drift-gate (F-005 T3)"
```

---

### Task 4: Retrofit sheets — Ashfang Brute + Stoneguard Sentinel

**Files:**
- Create: `content/characters/mob-aggressive-brute.md`
- Create: `content/characters/mob-defensive-guard.md`

**Interfaces:**
- Consumes: `_template.md` shape (Task 1), bible ids `faction-ashfang`, `faction-stoneguard`, `region-icefield` (Task 1). Both target keys are `tier: bespoke` in the manifest already (models: `mob_aggressive_brute.glb`, `mob_defensive_guard.glb`).

- [ ] **Step 1: Write `content/characters/mob-aggressive-brute.md`**

````markdown
---
id: mob-aggressive-brute
assetKey: "mob:aggressive"
name: "Ashfang Brute"
role: enemy
status: shipped
tier: bespoke
stats:
  archetype: bruiser
  durability: high
  speed: low
  threat: melee
links:
  story: [faction-ashfang]
---

## Lore

The Ashfang packs' front line. Brutes are the ones that stopped running with
the pack and started walking at things — scar tissue where hide used to be,
ember-red markings earned by surviving what should have killed them. A brute
does not stalk. It sees you, it comes, and the rest of the pack reads its
charge as the signal to close.

## Visual Brief

Built (retrofit — matches `mob_aggressive_brute.glb`): Kenney
`character-male-b` kitbash — bulked torso and arms, shrunk head, crimson
colormap, scaled 0.66u → 1.8u. Silhouette read: mass forward, top-heavy.
Source .blend: `art-source/bespoke/mob_aggressive_brute/source/`.

## Design Notes

Design intent "tanky, slow, relentless" — server balance numbers remain in
colyseus-server config (v1 boundary).
````

- [ ] **Step 2: Write `content/characters/mob-defensive-guard.md`**

````markdown
---
id: mob-defensive-guard
assetKey: "mob:defensive"
name: "Stoneguard Sentinel"
role: enemy
status: shipped
tier: bespoke
stats:
  archetype: tank
  durability: high
  speed: low
  threat: melee
links:
  story: [faction-stoneguard, region-icefield]
---

## Lore

The Stoneguard outlived their war, their order, and the thing they were
sworn to keep — but not their oath. Sentinels hold ground on the Northern
Icefield in slate-grey silence, indifferent to anything that keeps its
distance and immovable to anything that doesn't. Nobody alive knows what
they still guard. The Sentinels have not asked themselves in years.

## Visual Brief

Built (retrofit — matches `mob_defensive_guard.glb`): Kenney
`character-male-d` kitbash — extra-wide torso, arms, and legs, small head,
blue-grey stone tint, scaled 0.72u → 1.7u. Silhouette read: a wall with
shoulders. Source .blend: `art-source/bespoke/mob_defensive_guard/source/`.

## Design Notes

Design intent "anvil" — punishes overreach, never chases far.
````

- [ ] **Step 3: Verify gate**

Run: `node scripts/check_content.mjs`
Expected: exit 0; `content-gate: 2 sheets, 0 failures, 6 warnings` (player, npc, mob:balanced, mob:double_attacker, mob:hybrid, mob:spear_thrower uncovered).

- [ ] **Step 4: Commit**

```bash
git add content/characters/mob-aggressive-brute.md content/characters/mob-defensive-guard.md
git commit -m "feat(content): retrofit sheets for the two bespoke mobs (F-005 T4)"
```

---

### Task 5: Sheet-first proof — Thornveil Spearmaiden (`mob:spear_thrower`)

The end-to-end proof: sheet authored at `concept`, then the F-003 forge
bespoke-ifies the currently seed-tier `mob:spear_thrower`, then the sheet
flips to `forged`. **The Blender leg needs the user's Blender 4.5 running
with the MCP addon socket (:9876) connected** — coordinate before starting it.

**Files:**
- Create: `content/characters/mob-spear-thrower.md` (two commits: concept, then forged)
- Create (via forge intake): `game-client/assets/characters/mob_spear_thrower.glb`, `art-source/bespoke/mob_spear_thrower/source/*.blend` (LFS)
- Modify (via forge intake): `game-client/assets/manifest.json` (`mob:spear_thrower` → `tier: "bespoke"`, `source: "internal"`, `anims` override for KayKit clip names)

**Interfaces:**
- Consumes: F-003 toolchain as documented in `tools/asset-forge/README.md` (bake.sh → validate.mjs → intake.mjs) and the KayKit rig-transplant procedure recorded in the F-003 ledger/memory; content gate (Task 2).

- [ ] **Step 1: Write `content/characters/mob-spear-thrower.md` at `status: concept`**

````markdown
---
id: mob-spear-thrower
assetKey: "mob:spear_thrower"
name: "Thornveil Spearmaiden"
role: enemy
status: concept
tier: bespoke
stats:
  archetype: skirmisher
  durability: low
  speed: high
  threat: ranged
links:
  story: [faction-thornveil, region-thornveil]
---

## Lore

Thornveil's answer to trespass is a spear from a direction you weren't
looking. Spearmaidens hunt in relays along the bramble lanes east of the
meadow — throw, vanish, reappear forty paces on. They don't hold ground and
don't need to: the veil holds it for them. An expedition that hears two
spears land has already been counted by a third.

## Visual Brief

Bespoke via KayKit-rig path (the proven organic/AI-mesh route): lean
silhouette opposite to the Brute — long limbs, forward lean, high ready
stance. Palette: thorn-green wraps over bark-brown, single ember accent
(trophy from an Ashfang kill). Scale target 1.6u. Spear as a bound prop in
the right hand. Clip mapping (`anims` override): idle→Idle,
walk→Walking_A, run→Running_A, attack→a KayKit throw/2H-thrust clip chosen
at forge time (eyeball candidates), death→Death_A. Verify WALK and ATTACK
visually, not just idle.

## Design Notes

Ranged skirmisher pressure — fast, fragile, repositions. Balance numbers
stay server-side.
````

- [ ] **Step 2: Gate + commit the concept sheet**

Run: `node scripts/check_content.mjs`
Expected: exit 0; `3 sheets, 0 failures, 5 warnings` (concept status ⇒ no manifest cross-check yet).

```bash
git add content/characters/mob-spear-thrower.md
git commit -m "feat(content): Thornveil Spearmaiden concept sheet — sheet-first proof (F-005 T5a)"
```

- [ ] **Step 3: Forge the model from the Visual Brief (Blender leg — user's Blender required)**

Follow `tools/asset-forge/README.md` + the F-003 KayKit procedure: author the mesh (kitbash or generated donor per brief), transplant the KayKit rig (per-chain affine refit, `use_deform=False` on control bones, `ARMATURE_AUTO`), scale location f-curves, delete non-KayKit actions before export. Then:

```bash
bash tools/asset-forge/bake.sh <working>.blend game-client/assets/characters/mob_spear_thrower.glb
node tools/asset-forge/validate.mjs game-client/assets/characters/mob_spear_thrower.glb
```
Expected: validator PASS (skeleton rule: KayKit bones json per the F-003 follow-up — if `forge.config.json` still only knows the Kenney rig, add the KayKit `rig-reference` entry first; that follow-up is in-scope here as it blocks validation).

- [ ] **Step 4: Intake (transactional — updates manifest + art-source)**

```bash
node tools/asset-forge/intake.mjs --glb game-client/assets/characters/mob_spear_thrower.glb \
  --key "mob:spear_thrower" --tier bespoke --source internal --license CC0 \
  --blend <working>.blend
```
(Exact flags per `tools/asset-forge/README.md` — intake writes manifest last and rolls back on failure.) Add the `anims` override chosen at forge time to the manifest entry if intake doesn't set it.

Run: `node scripts/check_asset_manifest.mjs`
Expected: exit 0.

- [ ] **Step 5: Flip the sheet to `status: forged`, run both gates**

Edit frontmatter: `status: concept` → `status: forged`.

Run: `node scripts/check_content.mjs && node scripts/check_asset_manifest.mjs; echo "exit=$?"`
Expected: `exit=0`; content gate now cross-checks `mob:spear_thrower` tier `bespoke` against the manifest — green.

- [ ] **Step 6: Verify visually + headless**

- Storybook: serve `python3 -m http.server 8099` from repo root → `tools/asset-storybook/index.html`; hard-reload; the Spearmaiden card shows bespoke badge; eyeball **walk and attack** clips.
- Headless: `ATLAS_VERIFY_ENTITYVIEW=1` and `ATLAS_VERIFY_ANIM=1` probes → all PASS.

- [ ] **Step 7: Commit the forged state**

```bash
git add content/characters/mob-spear-thrower.md game-client/assets/characters/mob_spear_thrower.glb \
  game-client/assets/manifest.json art-source/bespoke/mob_spear_thrower/ tools/asset-forge/forge.config.json tools/asset-forge/rig-reference/
git commit -m "feat(content): forge Thornveil Spearmaiden — sheet-first bespoke mob:spear_thrower (F-005 T5b)"
```

---

## Self-review (done at plan time)

- **Spec coverage:** layout→T1, schema→T1, gate 4 checks→T2, CI→T3, retrofit proof→T4, sheet-first proof→T5, bible v0 (plan-level addition, approved in session)→T1, roadmap items are explicitly NOT tasks (backlog). Story/map schemas stubbed→T1. ✔
- **Discovered constraints folded in:** no `js-yaml`/root package.json → `scripts/package.json` + `npm ci --prefix scripts` (T2/T3); new-character-needs-existing-key → proof targets seed-tier `mob:spear_thrower` (T5); KayKit `rig-reference` follow-up from F-003 promoted to in-scope where it blocks T5 validation. ✔
- **Type consistency:** gate CLI flags consistent T2↔T3↔T4↔T5; schema enums match template and all three sheets; expected warn counts decrease 8→6→5 as sheets land. ✔
