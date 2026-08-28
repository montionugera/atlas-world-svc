// Plan E Task 10 — the gate on docs/worldbuilding/A4-zone-allocation.md.
//
// A4 is the committed 40-row table Tasks 11-14 write from, and the only place a
// zone's kind set and landmark names are chosen. Everything below re-derives
// its claims from the fabric, the premises, the registers and the ten committed
// records — nothing is compared against a literal transcribed from the plan,
// because a transcribed literal rots the moment the world moves and cannot fail
// for the right reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KINDS, surveyedRegions, licensedKinds, committedRecords, nameSources, allocate,
  canonPinsByRegion,
} from "../lib/zone-allocation.mjs";
import { renderTable, splice, BEGIN, END } from "../derive_zone_allocation.mjs";
import { titleStem } from "../../tools/mapforge/lib/name-gen.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TABLE = join(ROOT, "docs/worldbuilding/A4-zone-allocation.md");

/**
 * Parse the one GFM table in A4. Columns: zone | continent | region | terrain |
 * kinds | landmarks | join.
 *
 * A malformed row is a FAILURE, never a silent skip: the plan's drafted parser
 * `continue`d on any row whose cell count was not five, which means a zone that
 * lost a column would vanish from the table the tests measure and every count
 * below would still pass. Rows are collected raw and validated here.
 */
function rows() {
  const text = readFileSync(TABLE, "utf8");
  const a = text.indexOf(BEGIN), b = text.indexOf(END);
  assert.ok(a >= 0 && b > a, "A4 has lost its generated-table markers");
  // Scoped to the generated block: A4's prose carries other GFM tables (the
  // ruling's alternatives, for one) and a whole-file scan would read them as
  // allocation rows.
  const lines = text.slice(a + BEGIN.length, b).split("\n")
    .filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l));
  assert.ok(lines.length > 1, "A4 carries no table at all");
  const out = [];
  for (const [i, l] of lines.slice(1).entries()) {
    const c = l.split("|").slice(1, -1).map((s) => s.trim().replace(/`/g, ""));
    assert.equal(c.length, 7,
      `A4 table row ${i + 1} has ${c.length} cells, not 7 — a dropped column is a zone with no allocation: ${l}`);
    out.push({
      zone: c[0], continent: c[1], region: c[2], terrain: c[3],
      kinds: c[4].split(",").map((s) => s.trim()).filter(Boolean),
      landmarks: c[5].split(" / ").map((s) => s.trim()).filter(Boolean),
      join: c[6],
    });
  }
  return out;
}

function fabricSurvey() {
  const dir = join(ROOT, "content/world/fabric");
  const survey = new Map();
  const terrain = new Map();
  for (const f of readdirSync(dir).filter((n) => /^continent-\d+\.json$/.test(n))) {
    for (const r of JSON.parse(readFileSync(join(dir, f), "utf8")).regions) {
      survey.set(r.id, r.survey);
      terrain.set(r.id, r.terrainKind);
    }
  }
  return { survey, terrain };
}

// ---------------------------------------------------------------------------
// The table's own shape
// ---------------------------------------------------------------------------

test("the table holds exactly one row per surveyed region", () => {
  const { survey } = fabricSurvey();
  const surveyed = [...survey.values()].filter((s) => s === "surveyed").length;
  assert.equal(rows().length, surveyed);
  assert.equal(surveyed, 40, "the fabric no longer holds 40 surveyed regions — E-C5 has moved");
});

test("every kind comes from the closed 8-value enum", () => {
  for (const r of rows())
    for (const k of r.kinds)
      assert.ok(KINDS.includes(k), `${r.zone}: "${k}" is not a resource kind`);
});

test("every kind set is globally unique — this is Z6's set-packing, solved", () => {
  const seen = new Map();
  for (const r of rows()) {
    const key = [...new Set(r.kinds)].sort().join(",");
    assert.ok(key.length, `${r.zone}: empty kind set`);
    assert.equal(seen.get(key), undefined,
      `${r.zone} and ${seen.get(key)} share the kind set (${key}) — Z6 fails on this`);
    seen.set(key, r.zone);
  }
});

test("every landmark name is globally unique, trimmed and case-insensitive — Z6's other half", () => {
  const seen = new Map();
  for (const r of rows()) {
    assert.ok(r.landmarks.length >= 2, `${r.zone}: Z3 needs at least 2 landmarks`);
    for (const name of r.landmarks) {
      const key = name.trim().toLowerCase();
      assert.equal(seen.get(key), undefined,
        `"${name}" is used by both ${r.zone} and ${seen.get(key)} — Z6 fails on this`);
      seen.set(key, r.zone);
    }
  }
});

test("every zone slug is kebab-case and unique", () => {
  const seen = new Set();
  for (const r of rows()) {
    assert.match(r.zone, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `zone "${r.zone}" is not kebab-case`);
    assert.ok(!seen.has(r.zone), `zone slug "${r.zone}" appears twice`);
    seen.add(r.zone);
  }
});

// ---------------------------------------------------------------------------
// The join to the ground
// ---------------------------------------------------------------------------

test("every row names a surveyed region a fabric file actually declares", () => {
  const { survey } = fabricSurvey();
  for (const r of rows())
    assert.equal(survey.get(r.region), "surveyed",
      `${r.zone}: region ${r.region} is ${survey.get(r.region) ?? "absent"}, not surveyed`);
});

test("no two rows claim one region — the bijection Z2 enforces", () => {
  const seen = new Map();
  for (const r of rows()) {
    assert.equal(seen.get(r.region), undefined,
      `${r.zone} and ${seen.get(r.region)} both claim ${r.region}`);
    seen.set(r.region, r.zone);
  }
});

test("the terrain column is the fabric's own, not a transcription that can rot", () => {
  const { terrain } = fabricSurvey();
  for (const r of rows())
    assert.equal(r.terrain, terrain.get(r.region), `${r.zone}: A4 says ${r.terrain}, the fabric says ${terrain.get(r.region)}`);
});

test("the per-continent distribution is the fabric's own", () => {
  const regions = surveyedRegions({ root: ROOT });
  const want = {};
  for (const r of regions) want[r.continentName] = (want[r.continentName] ?? 0) + 1;
  const got = {};
  for (const r of rows()) got[r.continent] = (got[r.continent] ?? 0) + 1;
  assert.deepEqual(got, want);
  // E-C5, stated so a silent redistribution is visible in the failure text.
  assert.deepEqual(want, {
    Wealdmarch: 10, Coldreach: 6, Stonemoor: 7, Thirstwold: 7, Reedstrand: 3,
    Driftholt: 3, Wracklow: 2, Brightfall: 1, "Ashen Spar": 1,
  });
});

// ---------------------------------------------------------------------------
// The licence — the rule that makes the allocation checkable
// ---------------------------------------------------------------------------

test("every DERIVED row's kinds are licensed by its own region's measured ground", () => {
  const byId = new Map(surveyedRegions({ root: ROOT }).map((r) => [r.id, r]));
  for (const r of rows().filter((x) => x.join === "derived")) {
    const licensed = licensedKinds({ region: byId.get(r.region) });
    for (const k of r.kinds)
      assert.ok(licensed.includes(k),
        `${r.zone} (${r.region}) claims "${k}", which its ground does not license (${licensed.join(", ")})`);
  }
});

test("the PLACEHOLDER rows are exactly the ten committed records, and nothing else is exempt", () => {
  const committed = committedRecords({ root: ROOT });
  const placeholder = rows().filter((r) => r.join === "PLACEHOLDER").map((r) => r.zone).sort();
  assert.deepEqual(placeholder, committed.map((c) => c.zone).sort());
  for (const r of rows())
    assert.ok(["derived", "PLACEHOLDER"].includes(r.join), `${r.zone}: unknown join "${r.join}"`);
});

test("the ten committed records keep their exact kind sets and landmark names", () => {
  const byZone = new Map(rows().map((r) => [r.zone, r]));
  for (const c of committedRecords({ root: ROOT })) {
    const row = byZone.get(c.zone);
    assert.ok(row, `${c.zone} is committed but absent from A4`);
    assert.deepEqual([...new Set(row.kinds)].sort(), c.kinds, `${c.zone}: A4 disagrees with the committed record`);
    assert.equal(row.region, c.region, `${c.zone}: A4's region join disagrees with the committed record`);
    for (const name of c.landmarks)
      assert.ok(row.landmarks.some((n) => n.toLowerCase() === name.trim().toLowerCase()),
        `${c.zone}: committed landmark "${name}" is missing from A4`);
  }
});

// ---------------------------------------------------------------------------
// A4 section 2 — the claim the whole placeholder decision rests on.
// Re-measured here in BOTH directions, so it can be falsified rather than
// merely restated: if a later redraw ever does put canon ground under a
// surveyed region, this goes red and A4's ruling has to be reopened.
// ---------------------------------------------------------------------------

test("A4 §2 part 1: no cluster-1 canon pin stands on surveyed ground", () => {
  const { survey } = fabricSurvey();
  const pins = canonPinsByRegion({ root: ROOT });
  const c1 = [...pins].filter(([region]) => region.startsWith("c02/"));
  assert.ok(c1.length >= 4,
    `only ${c1.length} cluster-1 regions hold a canon pin — the set is too empty to conclude from`);
  const onSurveyed = c1.filter(([region]) => survey.get(region) === "surveyed");
  assert.deepEqual(onSurveyed.map(([r]) => r), [],
    "a cluster-1 canon pin now stands on surveyed ground — A4 §2's placeholder ruling must be reopened");
  // The other direction, so the emptiness above is a measurement and not an
  // absence of data: those pins DO resolve, and they resolve to reported ground.
  const named = c1.flatMap(([, list]) => list);
  assert.ok(named.length >= 6, `only ${named.length} cluster-1 pins resolve at all`);
  for (const [region] of c1)
    assert.equal(survey.get(region), "reported", `${region} is neither reported nor surveyed`);
});

test("A4 §2 part 1b: world-wide, the canon pins on surveyed ground are exactly the ones A4 inherits", () => {
  const { survey } = fabricSurvey();
  const pins = canonPinsByRegion({ root: ROOT });
  const onSurveyed = [...pins]
    .filter(([region]) => survey.get(region) === "surveyed")
    .flatMap(([, list]) => list.map((p) => p.name)).sort();
  const inherited = allocate({ root: ROOT }).rows
    .flatMap((r) => r.inheritedLandmarks ?? []).sort();
  assert.deepEqual(inherited, onSurveyed,
    "a canon pin stands on surveyed ground that no zone in A4 inherits — it would be minted over");
  assert.equal(onSurveyed.length, 1,
    `${onSurveyed.length} canon pins stand on surveyed ground (${onSurveyed.join(", ")}); A4 §2 says one`);
});

test("A4 §2 part 2: no Wealdmarch surveyed region licenses ore", () => {
  const c02 = surveyedRegions({ root: ROOT }).filter((r) => r.continent === "c02");
  assert.equal(c02.length, 10);
  for (const r of c02)
    assert.ok(!licensedKinds({ region: r }).includes("ore"),
      `${r.id} now licenses ore — A4 §2's second measurement must be reopened`);
  // And the licence rule is not simply dark: ore IS licensed elsewhere.
  const anywhere = surveyedRegions({ root: ROOT }).filter((r) => licensedKinds({ region: r }).includes("ore"));
  assert.ok(anywhere.length > 0, "no region anywhere licenses ore — the ore predicate is dead, not discriminating");
});

// ---------------------------------------------------------------------------
// The names
// ---------------------------------------------------------------------------

test("no zone slug reuses a reserved canon name", () => {
  const reserved = new Set(nameSources({ root: ROOT }).reserved.names
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-")));
  for (const r of rows().filter((x) => x.join === "derived"))
    assert.ok(!reserved.has(r.zone),
      `zone "${r.zone}" re-mints a reserved canon name onto surveyed ground`);
});

test("no landmark name is reserved, and every MINTED name is in its landmass's register", () => {
  const sources = nameSources({ root: ROOT });
  // A landmark inherited from a canon pin standing in the region is canon, not
  // minted; it is judged by the register the pin was authored in, not this one.
  const inherited = new Set(allocate({ root: ROOT }).rows.flatMap((r) => r.inheritedLandmarks ?? []));
  const reserved = new Set(sources.reserved.names.map((n) => n.toLowerCase()));
  const byId = new Map(surveyedRegions({ root: ROOT }).map((r) => [r.id, r]));
  for (const r of rows().filter((x) => x.join === "derived")) {
    const region = byId.get(r.region);
    const registerId = sources.registers.continentRegister[region.continent];
    const reg = sources.registers.registers[registerId];
    const legal = new Set();
    for (const o of reg.onsets) for (const rime of reg.rimes) legal.add(`${o}${rime}`);
    for (const name of [r.zone.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "), ...r.landmarks]) {
      assert.ok(!reserved.has(name.toLowerCase()), `"${name}" is a reserved canon name`);
      if (inherited.has(name)) continue;
      const stem = titleStem(name);
      assert.ok(legal.has(stem),
        `${r.zone}: "${name}" carries stem "${stem}", which register "${registerId}" never wrote`);
    }
  }
});

// ---------------------------------------------------------------------------
// The drift guard
// ---------------------------------------------------------------------------

test("A4's table is exactly what the derivation renders — no hand edit survives", () => {
  const { rows: derived, problem } = allocate({ root: ROOT });
  assert.equal(problem, null);
  const have = readFileSync(TABLE, "utf8");
  assert.equal(splice({ text: have, table: renderTable({ rows: derived }) }), have,
    "A4's table has drifted from the fabric — re-run node scripts/derive_zone_allocation.mjs --write");
});

test("the packing spends two-element sets before three, and one only where no pair survives", () => {
  const all = rows();
  const sizes = all.map((r) => new Set(r.kinds).size);
  assert.equal(sizes.filter((n) => n === 1).length, 1, "more than one zone fell back to a one-element kind set");
  assert.ok(sizes.filter((n) => n === 2).length > sizes.filter((n) => n === 3).length,
    "three-element sets now outnumber two-element ones — the cheap space was not spent first");
  const singleton = all.find((r) => new Set(r.kinds).size === 1);
  const region = surveyedRegions({ root: ROOT }).find((r) => r.id === singleton.region);
  assert.equal(licensedKinds({ region }).length, 2,
    `${singleton.zone} took a one-element set but its ground licenses ${licensedKinds({ region }).length} kinds`);
});
