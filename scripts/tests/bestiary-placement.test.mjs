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
