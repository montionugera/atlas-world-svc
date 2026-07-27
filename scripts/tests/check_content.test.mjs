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

test("CRLF line endings are normalized, not a false failure", () => {
  const crlf = GOOD_SHEET.replace(/\n/g, "\r\n");
  const dir = fixture({ sheets: { "mob-aggressive-brute.md": crlf } });
  assert.equal(runGate(dir).code, 0);
});

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

test("mob-types.json parsing to a JSON-falsy value (literal null) is a single hard fail, not a silent skip", () => {
  // JSON.parse("null") succeeds, so readJson records no failure — the loader
  // must still FAIL shape-invalid rather than silently skipping mob checks.
  const dir = fixture({ maps: { "test-map.md": GOOD_MAP }, mobTypes: null });
  writeFileSync(join(dir, "mob-types.json"), "null");
  const r = runGate(dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL.*mob-types.*shape-invalid/);
  assert.match(r.out, /1 failures/);
});
