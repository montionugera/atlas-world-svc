import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 — `ajv` is CJS, so
// under ESM the constructor may arrive as the module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function compile() {
  const schema = JSON.parse(
    readFileSync(join(ROOT, "content/schemas/bestiary-placement.schema.json"), "utf8"));
  return new AjvClass({ allErrors: true }).compile(schema);
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

test("G7: two depthTiers sharing an id fail", () => {
  // The trailing pair is deliberately contiguous (28 -> 29) and unreferenced by
  // any placement, so the ONLY rule this fixture can trip is the duplicate-id
  // one — the schema does not constrain depthTier id uniqueness.
  const doc = placement({ depthTiers: [
    { id: "verge", label: "V", bandFloor: 1, bandCeil: 14, summary: "s" },
    { id: "route", label: "R", bandFloor: 15, bandCeil: 28, summary: "s" },
    { id: "route", label: "R again", bandFloor: 29, bandCeil: 40, summary: "s" },
  ] });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /duplicate depthTier id "route"/);
});

test("G7: a depthTier whose bandCeil is below its bandFloor fails", () => {
  // "deep" is inverted (29..28) but still contiguous with "route" by bandFloor,
  // and no placement names it — isolating the inverted-band rule.
  const doc = placement({ depthTiers: [
    { id: "verge", label: "V", bandFloor: 1, bandCeil: 14, summary: "s" },
    { id: "route", label: "R", bandFloor: 15, bandCeil: 28, summary: "s" },
    { id: "deep", label: "D", bandFloor: 29, bandCeil: 28, summary: "s" },
  ] });
  const r = runGate(fixture({ placements: { "placement-thornveil.json": doc } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /depthTier "deep" bandCeil 28 < bandFloor 29/);
});

test("G6: a design whose levelBand cannot be parsed fails", () => {
  // bestiary.json is a design backlog the gate does not schema-validate, so a
  // junk levelBand reaches the band-overlap maths — it must FAIL loudly rather
  // than silently compare NaNs and pass.
  const bestiary = [
    { id: "mob-veil-cub", region: "thornveil", levelBand: "banana" },
    { id: "mob-bramble-warden", region: "thornveil", levelBand: "21-30" },
    { id: "mob-millpond-gnawer", region: "millcross", levelBand: "1-10" },
  ];
  const r = runGate(fixture({
    bestiary,
    placements: { "placement-thornveil.json": placement() },
  }));
  assert.equal(r.code, 1);
  assert.match(r.out, /design "mob-veil-cub" has unparseable levelBand "banana"/);
});
