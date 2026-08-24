// Plan D Task 6 — dungeon families, floor arithmetic and G-DUNGEON-REACH.
// Fixture discipline is resolve.test.mjs's: worldFixture() copies the shared
// miniature world; each red case is one overlay dir over an otherwise green
// base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDungeons, expandFamily, gDungeonReach, dungeonDensityLines } from "../lib/dungeons.mjs";
import { loadCivil } from "../lib/resolve.mjs";
import { worldFixture, runWorldGate } from "./resolve.test.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("levelBand(index) = [18 + 3i, 24 + 3i]", () => {
  const family = { id: "family-catacomb", levelBand: { base: 18, step: 3, span: 6 }, floors: 3 };
  assert.deepEqual(expandFamily({ family, index: 0 }), { levelBand: [18, 24], floors: 3 });
  assert.deepEqual(expandFamily({ family, index: 7 }), { levelBand: [39, 45], floors: 3 });
});

test("the committed corpus is 60 complexes and exactly 190 floors", () => {
  const { families, dungeons, errors } = loadDungeons({ contentRoot: join(ROOT, "content") });
  assert.deepEqual(errors, []);
  assert.equal(families.size, 3);
  assert.equal(dungeons.length, 60);
  const members = dungeons.filter((d) => d.family !== null);
  assert.equal(members.length, 24, "3 families x 8 members");
  const total = dungeons.reduce((n, d) => n + d.floors, 0);
  assert.equal(total, 190);
  const bespoke = dungeons.filter((d) => d.family === null);
  assert.equal(bespoke.length, 36);
  assert.equal(bespoke.reduce((n, d) => n + d.floors, 0), 118);
  assert.equal(bespoke.filter((d) => d.floors >= 7).length, 3, "three mega-dungeons carry the tail");
});

test("no dungeon is a spine node", () => {
  const { dungeons } = loadDungeons({ contentRoot: join(ROOT, "content") });
  for (const d of dungeons) assert.equal(d.spineId, null, `${d.id} must not name a spine node`);
  const nodeIds = new Set(readdirSync(join(ROOT, "content/spine/nodes")).map((f) => f.replace(/\.json$/, "")));
  for (const d of dungeons) assert.equal(nodeIds.has("n-" + d.id.replace(/^dungeon-/, "")), false);
});

test("every entranceType — on a family and on a record — is a dungeonCapable LEXICON id", () => {
  // The namespace trap this catches: `cave`, `sinkhole` and `gorge` read as
  // English but are not lexicon ids (the real rows are `cave-system`,
  // `sinkhole-doline`, `knickpoint-gorge`), and `karst-plateau` / `sand-sea` /
  // `fjordland` / `cloud-forest` are TERRAIN KINDS, not landform types.
  // scaffoldDungeons matches family.entranceTypes against ledger handle TYPES,
  // so a string outside the lexicon silently matches nothing: eight family
  // members go unminted and the only symptom is a short corpus.
  const lexPath = join(ROOT, "content/world/lexicon/landforms.json");
  if (!existsSync(lexPath)) return;                       // Plan B not merged: skip
  const capable = new Set(JSON.parse(readFileSync(lexPath, "utf8"))
    .filter((r) => r.dungeonCapable === true).map((r) => r.id));
  assert.equal(capable.size, 23, "Plan B ships exactly 23 dungeonCapable types");

  const { families, dungeons } = loadDungeons({ contentRoot: join(ROOT, "content") });
  const bad = [];
  for (const fam of families.values())
    for (const t of fam.entranceTypes)
      if (!capable.has(t)) bad.push(`${fam.id}.entranceTypes: "${t}"`);
  for (const d of dungeons)
    if (!capable.has(d.entranceType)) bad.push(`${d.id}.entranceType: "${d.entranceType}"`);
  assert.deepEqual(bad, []);
});

test("G-DUNGEON-REACH is silent on the green fixture", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  assert.deepEqual(gDungeonReach({ world, dungeons, lexicon: world.lexicon }), []);
});

test("G-DUNGEON-REACH red: an entrance on a landform that is not cave-capable", () => {
  const dir = worldFixture({ overlayDir: "g-dungeon-reach-uncapable" });
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const p = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-DUNGEON-REACH: dungeon-shallow-ria entrance landform "coastal-drowned-valley" is not dungeonCapable$/);
});

test("G-DUNGEON-REACH red: more than two region hops from any settlement", () => {
  const dir = worldFixture({ overlayDir: "g-dungeon-reach-far" });
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const p = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(p.length, 1);
  assert.match(p[0], /^G-DUNGEON-REACH: dungeon-fumewater-tube nearest settlement is 4 region hops \(max 2\)$/);
});

test("G-DUNGEON-REACH red: three hops is already too far — the ceiling is inclusive", () => {
  // Mutation guard: `hops > 3` survives every test the 4-hop case writes,
  // because 4 > 3 still fails. The boundary lives here: exactly 3 must fail
  // under the committed ceiling of 2.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.dungeonAnchors.find((a) => a.handle === "c02/karst/h-77aa").hopsToSettlement = 3;
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const problems = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^G-DUNGEON-REACH: dungeon-fumewater-tube nearest settlement is 3 region hops \(max 2\)$/);
});

test("G-DUNGEON-REACH red: unreachable reads DIFFERENTLY from merely far", () => {
  // "4 hops" and "no settled region at any distance" are different bugs — one
  // is a placement to move, the other is a continent with no settlement — so
  // they get different sentences. `null` is Plan C's serialisation of the
  // unreachable case; there is no Infinity in JSON and the gate must never
  // print one.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.dungeonAnchors.find((a) => a.handle === "c02/karst/h-77aa").hopsToSettlement = null;
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const problems = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^G-DUNGEON-REACH: dungeon-fumewater-tube has no settled region reachable at any distance$/);
});

test("G-DUNGEON-REACH red: a ledger handle with no dungeonAnchors row names the generator", () => {
  // The failure mode this replaces: reading `?? Infinity` and reporting an
  // unreachable dungeon when the real defect is that the generator never
  // anchored it. A missing anchor is a GENERATOR bug and says so.
  const dir = worldFixture();
  const p = join(dir, "world/fabric/continent-02.json");
  const doc = JSON.parse(readFileSync(p, "utf8"));
  doc.dungeonAnchors = doc.dungeonAnchors.filter((a) => a.handle !== "c02/karst/h-77aa");
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const problems = gDungeonReach({ world, dungeons, lexicon: world.lexicon });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /has no dungeonAnchors row in the fabric — re-run the generator/);
});

test("density is REPORTED, never failed", () => {
  const dir = worldFixture();
  const world = loadCivil({ contentRoot: dir });
  const { dungeons } = loadDungeons({ contentRoot: dir });
  const lines = dungeonDensityLines({ world, dungeons });
  assert.ok(lines.some((l) => /^dungeon-density: c02\/r02 2 complexes$/.test(l)));
});

test("the gate wires G-DUNGEON-REACH into --only=spine", () => {
  const r = runWorldGate(worldFixture({ overlayDir: "g-dungeon-reach-uncapable" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL {2}G-DUNGEON-REACH: .*is not dungeonCapable/);
});
