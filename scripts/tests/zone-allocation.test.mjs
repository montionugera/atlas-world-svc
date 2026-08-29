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
  canonPinsByRegion, UNPLACED, legacyPlaceholderRecords, drawnPlaceNames, zoneSlug,
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

test("the terrain column is the fabric's own on derived rows, and BLANK on placeholder rows", () => {
  const { terrain } = fabricSurvey();
  for (const r of rows()) {
    if (r.join === "derived") {
      assert.equal(r.terrain, terrain.get(r.region),
        `${r.zone}: A4 says ${r.terrain}, the fabric says ${terrain.get(r.region)}`);
      continue;
    }
    // A placeholder row's region is a gate join, not a place the zone is. Printing
    // the region's terrain beside the zone's name publishes a claim about the zone
    // — "northern-icefield … cloud-forest" — that the record's own prose denies.
    // Review finding: the cell is blank, and the join column says why.
    assert.equal(r.terrain, "—", `${r.zone}: a placeholder row must publish no terrain`);
  }
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

test("the PLACEHOLDER rows are exactly the ten LEGACY records, and nothing else is exempt", () => {
  // TASK 11 CORRECTION. This used to compare against committedRecords() — every
  // file in content/zones/ — which was the same set as the legacy ten only
  // because nothing else had been written yet. The exemption belongs to the ten
  // zones named for hand-pinned canon places (A4 section 2), and the derived
  // criterion for that is "the slug is a reserved canon name". Writing a record
  // for a derived row must not flip its row to PLACEHOLDER.
  const legacy = legacyPlaceholderRecords({ root: ROOT });
  assert.equal(legacy.length, 10, "the legacy placeholder set is no longer ten records");
  const placeholder = rows().filter((r) => r.join === "PLACEHOLDER").map((r) => r.zone).sort();
  assert.deepEqual(placeholder, legacy.map((c) => c.zone).sort());
  for (const r of rows())
    assert.ok(["derived", "PLACEHOLDER"].includes(r.join), `${r.zone}: unknown join "${r.join}"`);
  // The criterion itself, in both directions: every legacy slug IS a reserved
  // canon name, and no derived row's slug is. Without the second arm the rule
  // could not tell a derived record from a legacy one at all.
  const reserved = new Set(nameSources({ root: ROOT }).reserved.names.map((n) => zoneSlug(n)));
  for (const c of legacy) assert.ok(reserved.has(c.zone), `${c.zone} is legacy but not a reserved canon name`);
  for (const r of rows().filter((x) => x.join === "derived"))
    assert.ok(!reserved.has(r.zone), `derived row ${r.zone} carries a reserved canon name`);
});

test("a record written for a DERIVED row must agree with the table, not replace it", () => {
  // The enforcement layer for Tasks 11-14: A4 is the authority on a derived
  // zone's slug, region, kind set and landmark names, and a record is checked
  // against it. Nothing else compares content/zones/ to the table for these
  // rows — allocate() derives them from the ground and never reads the file.
  const byZone = new Map(rows().map((r) => [r.zone, r]));
  const legacy = new Set(legacyPlaceholderRecords({ root: ROOT }).map((c) => c.zone));
  const written = committedRecords({ root: ROOT }).filter((c) => !legacy.has(c.zone));
  // A FLOOR, not decoration — REVIEW FINDING (MINOR 2): without it, moving all
  // six Coldreach records out of content/zones/ left this suite at 33 pass / 0
  // fail and `--check` still printing "A4 matches the fabric". The whole payload
  // of the task could vanish and its own gate would stay green. Task 12 raised it
  // to 13 (Stonemoor's seven, re-proven by the same mutation), Task 13 to 20
  // (Thirstwold's seven), and Task 14 to 30 (the ten minor-continent and chain
  // rows), the same way the record count in zone-content.test.mjs does.
  //
  // 30 is also the last move this floor makes: 30 derived rows plus the ten
  // PLACEHOLDER rows is A4's whole table, so with Z2 closed in both directions
  // the only way this number changes again is a new surveyed region in the
  // fabric — which would red Z2 first.
  assert.equal(written.length, 30,
    "the number of records written for derived rows moved — say so here, or an empty loop reports success");
  for (const c of written) {
    const row = byZone.get(c.zone);
    assert.ok(row, `record "${c.zone}" names no row in A4 — a zone slug A4 does not mint is a zone nothing allocated`);
    // NOT asserting row.join === "derived": `written` is defined as the records
    // whose slug is NOT reserved, and the PLACEHOLDER rows are by construction
    // exactly the reserved-slug ten, so that assertion cannot fail. A rule that
    // cannot fail is a defect, so it is gone rather than left reading as cover.
    assert.equal(row.region, c.region, `${c.zone}: the record's region disagrees with A4`);
    assert.deepEqual([...new Set(row.kinds)].sort(), c.kinds,
      `${c.zone}: the record's resource kinds disagree with A4 — fix the record, never A4`);
    assert.deepEqual(c.landmarks.map((n) => n.trim().toLowerCase()).sort(),
      row.landmarks.map((n) => n.trim().toLowerCase()).sort(),
      `${c.zone}: the record's landmark names disagree with A4`);
  }
});

test("the ten legacy records keep their exact kind sets and landmark names", () => {
  const byZone = new Map(rows().map((r) => [r.zone, r]));
  const committed = legacyPlaceholderRecords({ root: ROOT });
  // A floor, not decoration: with content/zones/ absent committedRecords()
  // returns [] and every assertion below is skipped — an empty loop reporting
  // success is an absence of data published as a verdict.
  assert.equal(committed.length, 10, "content/zones no longer holds the ten legacy records");
  for (const c of committed) {
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

test("no licence predicate licenses everything or nothing — a rule that cannot discriminate is a defect", () => {
  const regions = surveyedRegions({ root: ROOT });
  assert.equal(regions.length, 40);
  for (const kind of KINDS) {
    const n = regions.filter((r) => licensedKinds({ region: r }).includes(kind)).length;
    assert.ok(n > 0, `licence "${kind}" fires on no surveyed region at all — dead vocabulary`);
    assert.ok(n < regions.length,
      `licence "${kind}" fires on all ${n} surveyed regions — it licenses everything and constrains nothing`);
  }
});

test("the licence's per-landmass NEGATIVES hold — this is what stops a predicate being widened to pass", () => {
  // The whole "derived, not chosen" claim rests on the licence actually
  // REFUSING ground. Each line below is a measured fact about the fabric that
  // dies the moment its predicate is loosened, which the global 0<n<40 bound
  // above cannot catch on its own: widening one kind by one region would slip
  // through it. Read as: this landmass can yield none of these.
  const want = {
    c02: ["ore"], c03: ["fuel"], c04: ["timber", "fuel"],
    c05: ["timber", "fuel", "forage"], c06: ["ore"], c07: [],
    c08: ["timber", "ore"], c09: ["crop", "fuel", "forage"],
    c10: ["crop", "timber", "water", "forage", "salvage"],
  };
  const regions = surveyedRegions({ root: ROOT });
  const got = {};
  for (const c of Object.keys(want)) {
    const local = regions.filter((r) => r.continent === c);
    assert.ok(local.length, `${c} has no surveyed regions — the row below would be vacuous`);
    got[c] = KINDS.filter((k) => local.every((r) => !licensedKinds({ region: r }).includes(k)));
  }
  assert.deepEqual(got, want);
});

test("A4 §2 part 1: no cluster-1 canon pin stands on surveyed ground", () => {
  const { survey } = fabricSurvey();
  const pins = canonPinsByRegion({ root: ROOT });
  const c1 = [...pins].filter(([region]) => typeof region === "string" && region.startsWith("c02/"));
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
    .filter(([region]) => typeof region === "string" && survey.get(region) === "surveyed")
    .flatMap(([, list]) => list.map((p) => p.name)).sort();
  const inherited = allocate({ root: ROOT }).rows
    .flatMap((r) => r.inheritedLandmarks ?? []).sort();
  assert.deepEqual(inherited, onSurveyed,
    "a canon pin stands on surveyed ground that no zone in A4 inherits — it would be minted over");
  assert.equal(onSurveyed.length, 1,
    `${onSurveyed.length} canon pins stand on surveyed ground (${onSurveyed.join(", ")}); A4 §2 says one`);
});

test("A4 §2's canon-pin census is the fabric's own — 41 pins, 39 reported, 1 surveyed, 1 unplaced", () => {
  const { survey } = fabricSurvey();
  const pins = canonPinsByRegion({ root: ROOT });
  const tally = { reported: 0, surveyed: 0, unplaced: 0 };
  let total = 0;
  for (const [region, list] of pins) {
    total += list.length;
    if (region === UNPLACED) { tally.unplaced += list.length; continue; }
    const s = survey.get(region);
    assert.ok(s, `pin region "${region}" is in no fabric file`);
    tally[s] += list.length;
  }
  assert.equal(total, 41, "the hand-pinned canon set has changed size");
  assert.deepEqual(tally, { reported: 39, surveyed: 1, unplaced: 1 });
});

test("A4 §2's \"five of ten\" — half the placeholder rows put a resource on ground that cannot yield it", () => {
  const legacy = allocate({ root: ROOT }).rows.filter((r) => !r.derived);
  assert.equal(legacy.length, 10);
  const unlicensed = legacy.filter((r) => r.unlicensed.length).map((r) => r.zone).sort();
  assert.deepEqual(unlicensed,
    ["ashvale-front", "cindervast", "hollowmarch", "millcross-ford", "thornveil"]);
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
  const zoneNames = new Map(allocate({ root: ROOT }).rows.map((x) => [x.region, x.zoneName]));
  for (const r of rows().filter((x) => x.join === "derived")) {
    const region = byId.get(r.region);
    const registerId = sources.registers.continentRegister[region.continent];
    const reg = sources.registers.registers[registerId];
    const legal = new Set();
    for (const o of reg.onsets) for (const rime of reg.rimes) legal.add(`${o}${rime}`);
    for (const name of [zoneNames.get(r.region), ...r.landmarks]) {
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

// ---------------------------------------------------------------------------
// Names, at morpheme depth
// ---------------------------------------------------------------------------

test("every minted STEM is unique in the whole world, not just every full name", () => {
  const { rows: derived } = allocate({ root: ROOT });
  const minted = derived.filter((r) => r.derived);
  assert.equal(minted.length, 30);
  const seen = new Map();
  for (const r of minted)
    for (const name of [r.zoneName, ...r.landmarks]) {
      if ((r.inheritedLandmarks ?? []).includes(name)) continue;
      const stem = titleStem(name).toLowerCase();
      assert.equal(seen.get(stem), undefined,
        `stem "${stem}" names both ${seen.get(stem)} and ${name} — two places, one name`);
      seen.set(stem, name);
    }
  // And no minted stem shadows a canon one.
  const sources = nameSources({ root: ROOT });
  // The canon stem set is reserved.json plus the LEGACY ten's landmark names —
  // NOT every file in content/zones/. Once Tasks 11-14 write records for the
  // derived rows, those records carry the very names this table minted, so
  // reading them back as "canon" makes every minted stem shadow itself.
  const canon = new Set([
    ...sources.reserved.names,
    ...legacyPlaceholderRecords({ root: ROOT }).flatMap((c) => c.landmarks),
  ].map((n) => titleStem(n).toLowerCase()));
  assert.ok(canon.size > 20, "the canon stem set is too small to be a real exclusion");
  for (const stem of seen.keys())
    assert.ok(!canon.has(stem), `minted stem "${stem}" shadows a canon name`);
});

test("no register morpheme is reused more than twice on one landmass", () => {
  const sources = nameSources({ root: ROOT });
  const { rows: derived } = allocate({ root: ROOT });
  const byContinent = new Map();
  for (const r of derived.filter((x) => x.derived)) {
    const c = r.region.slice(0, 3);
    if (!byContinent.has(c)) byContinent.set(c, []);
    byContinent.get(c).push(r.zoneName, ...r.landmarks);
  }
  assert.equal(byContinent.size, 8, "the minted landmasses have changed");
  for (const [c, names] of byContinent) {
    const reg = sources.registers.registers[sources.registers.continentRegister[c]];
    const onsets = [...reg.onsets].sort((a, b) => b.length - a.length);
    const tally = new Map();
    for (const name of names) {
      const stem = titleStem(name);
      const onset = onsets.find((o) => stem.startsWith(o));
      if (!onset) continue; // an inherited canon name, judged by its own register
      for (const key of [`onset ${onset}`, stem.slice(onset.length) && `rime ${stem.slice(onset.length)}`])
        if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    for (const [key, n] of tally)
      assert.ok(n <= 2, `${c}: ${key} is used ${n} times — the landmass reads as one word repeated`);
  }
});

test("the licence does not read water off DRY features", () => {
  // `wadi` and `playa` are named for water that is not there. The rule that
  // let them license `water` put a drinkable spring in a 92.8% desert; this is
  // the regression case, and it fails the moment either comes back.
  const dry = { biomes: {}, landforms: ["wadi", "playa", "salt-pan-crust", "sabkha"], terrain: "sand-sea" };
  assert.ok(!licensedKinds({ region: dry }).includes("water"),
    "a dry watercourse or a dry lake bed now licenses water again");
  // The other direction: a genuinely wet landform still does license it.
  assert.ok(licensedKinds({ region: { biomes: {}, landforms: ["oasis-spring"], terrain: "sand-sea" } })
    .includes("water"), "the water predicate no longer fires on an oasis spring — it has gone dead");
});

test("the kind-set space A4 rule 4 promises is measured, not asserted", () => {
  // Rule 4 exists to keep cheap sets free for the deferred town-plan zones
  // (E-C9). Measured, it does not: every two-element set is spent. The doc says
  // so, and this test is what stops that sentence rotting back into a promise.
  const spent = new Set(rows().map((r) => [...new Set(r.kinds)].sort().join(",")));
  const all = [];
  const rec = (i, cur) => {
    if (i === KINDS.length) { if (cur.length) all.push([...cur].sort().join(",")); return; }
    rec(i + 1, cur); cur.push(KINDS[i]); rec(i + 1, cur); cur.pop();
  };
  rec(0, []);
  const free = (size) => all.filter((k) => k.split(",").length === size && !spent.has(k)).length;
  assert.equal(all.length, 255);
  assert.deepEqual(
    { one: free(1), two: free(2), three: free(3), total: all.length - spent.size },
    { one: 7, two: 0, three: 45, total: 215 });
});

// ---------------------------------------------------------------------------
// A4 §2's alternatives table — every score in it is measured here, so the
// owner rules on numbers that are still true when they read them.
// ---------------------------------------------------------------------------

/** Maximum bipartite matching, records to regions, ties by ascending region id. */
function maxLicensedMatching() {
  const c02 = surveyedRegions({ root: ROOT }).filter((r) => r.continent === "c02");
  // A' re-pairs the TEN legacy placeholders against c02's ten surveyed regions.
  // Records written for derived rows are not candidates and never were.
  const committed = legacyPlaceholderRecords({ root: ROOT });
  const options = new Map(committed.map((c) => [c.zone,
    c02.filter((r) => c.kinds.every((k) => licensedKinds({ region: r }).includes(k)))
      .map((r) => r.id).sort()]));
  const owner = new Map();
  const augment = (zone, seen) => {
    for (const region of options.get(zone)) {
      if (seen.has(region)) continue;
      seen.add(region);
      if (!owner.has(region) || augment(owner.get(region), seen)) { owner.set(region, zone); return true; }
    }
    return false;
  };
  let matched = 0;
  for (const c of committed) if (augment(c.zone, new Set())) matched++;
  return { matched, total: committed.length, options };
}

test("A4 §2 alternative A′ scores 9 of 10, and A (shipped) scores 5", () => {
  const { matched, total, options } = maxLicensedMatching();
  assert.equal(total, 10);
  assert.equal(matched, 9, "the licence-maximising placeholder no longer scores 9");
  assert.deepEqual([...options].filter(([, o]) => !o.length).map(([z]) => z), ["hollowmarch"],
    "the one record with no licensed region is no longer hollowmarch alone");
  const shipped = allocate({ root: ROOT }).rows.filter((r) => !r.derived && !r.unlicensed.length);
  assert.equal(shipped.length, 5, "the shipped alphabetical join no longer scores 5");
});

test("A4 §2 alternative A″: 7 of 10 zones have a requires-matching surveyed region, and the shipped join hits 4", () => {
  const c02 = surveyedRegions({ root: ROOT }).filter((r) => r.continent === "c02");
  const byId = new Map(c02.map((r) => [r.id, r]));
  const committed = legacyPlaceholderRecords({ root: ROOT });
  const wants = new Map();
  for (const f of readdirSync(join(ROOT, "content/world/civil/pinned"))) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/world/civil/pinned", f), "utf8"));
    // Nine zones take their requirement from their own `c-lm-` pin; `cindervast`
    // has no landmark pin, only the town of that name, so its town pin is the
    // one that speaks for it.
    if (!/^c-(lm|town)-/.test(doc.id ?? "")) continue;
    const slug = doc.id.replace(/^c-(lm|town)-/, "");
    if (!committed.some((c) => c.zone === slug)) continue;
    const req = [].concat(doc.requires?.landform ?? doc.requires?.landforms ?? []);
    if (req.length) wants.set(slug, req);
  }
  assert.equal(wants.size, 10, "not every committed zone still has a pin declaring a required landform");
  const satisfiable = [...wants].filter(([, req]) =>
    c02.some((r) => req.some((w) => r.landforms.includes(w)))).map(([z]) => z).sort();
  assert.equal(satisfiable.length, 7, `A″ now scores ${satisfiable.length} of 10`);
  assert.deepEqual([...wants].filter(([z]) => !satisfiable.includes(z)).map(([z]) => z).sort(),
    ["ashvale-front", "northern-icefield", "rooktide-reach"]);
  const hit = allocate({ root: ROOT }).rows.filter((r) => !r.derived)
    .filter((r) => satisfiable.includes(r.zone)
      && wants.get(r.zone).some((w) => byId.get(r.region)?.landforms.includes(w)));
  assert.equal(hit.length, 4, "the shipped join no longer satisfies four of the seven");
});

test("A4 §1's published ore-boundary sensitivity is real: the fluvial rock cuts are in NO predicate", () => {
  // If `ore` counted these, c02/r01 would license ore and §2's second pillar
  // would have to be re-run. The claim is only worth publishing while it is
  // true that they license nothing today.
  const cuts = ["canyon", "slot-canyon", "knickpoint-gorge", "natural-bridge"];
  const r01 = surveyedRegions({ root: ROOT }).find((r) => r.id === "c02/r01");
  for (const t of cuts)
    assert.ok(r01.landforms.includes(t), `c02/r01 no longer carries ${t}`);
  const alone = { biomes: {}, landforms: cuts, terrain: "headland" };
  assert.deepEqual(licensedKinds({ region: alone }), [],
    "a fluvial rock cut now licenses something — A4 §1's sensitivity note must be re-measured");
});

// ---------------------------------------------------------------------------
// TASK 11 FINDING — the drawn world's own names were never barred.
// ---------------------------------------------------------------------------

test("no minted name is a name the DRAWN world already publishes", () => {
  // Measured before the fix: FIVE derived zone names duplicated a landmark the
  // resolved world renders on its own sheets — `wracksound-race` (c03/r10)
  // against the delta "Wracksound Race" in c03/r15, `lodespar-confluence`
  // (c03/r15) against the levee "Lodespar Confluence" in c03/r18, plus
  // `grykestone-fenster`, `flagsink-stair` and `siroccwold-waste`. Two places,
  // one name, on one landmass — the failure A4 section 4's stem rules exist to
  // prevent, escaping through the one name source `used` was never seeded from.
  const drawn = new Map();
  for (const n of drawnPlaceNames({ root: ROOT })) drawn.set(n.trim().toLowerCase(), n);
  assert.ok(drawn.size > 300, `the drawn world published only ${drawn.size} names — the source is not being read`);
  // REVIEW FINDING (MAJOR 1): the first version of drawnPlaceNames read
  // `landmarks` and `towns` only, and missed the 60 named `dungeons`. Renaming a
  // dungeon onto a minted landmark left this test green. The function enumerates
  // every array now; this asserts the source really does reach EVERY array that
  // carries a name, by re-deriving the set here from the files themselves.
  const expected = new Set();
  const byArray = new Map();
  for (const f of readdirSync(join(ROOT, "content/world/resolved")).filter((n) => /^continent-\d+\.json$/.test(n))) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/world/resolved", f), "utf8"));
    for (const [key, value] of Object.entries(doc)) {
      if (!Array.isArray(value)) continue;
      for (const p of value)
        if (p && typeof p.name === "string" && p.name.trim()) {
          expected.add(p.name.trim());
          byArray.set(key, (byArray.get(key) ?? 0) + 1);
        }
    }
  }
  assert.deepEqual([...byArray.keys()].sort(), ["dungeons", "landmarks", "towns", "zones"],
    "the resolved world grew or lost a name-bearing array — drawnPlaceNames must still reach all of them");
  assert.equal(drawn.size, expected.size, "drawnPlaceNames is not reading every name the drawn world publishes");
  let checked = 0;
  for (const r of allocate({ root: ROOT }).rows.filter((x) => x.derived)) {
    // An INHERITED landmark is the drawn world's own name, deliberately reused
    // for the ground it already stands on; barring it would defeat inheritance.
    const inherited = new Set(r.inheritedLandmarks ?? []);
    for (const name of [r.zoneName, ...r.landmarks]) {
      if (inherited.has(name)) continue;
      checked++;
      assert.ok(!drawn.has(name.trim().toLowerCase()),
        `${r.region}: minted name "${name}" is already the drawn world's name for another place`);
    }
  }
  assert.equal(checked, 89, "expected 30 zone names + 59 minted landmarks, minus the 1 inherited slot");
});

test("barring drawn STEMS was a scope choice, not a capacity one — the occupancy is measured", () => {
  // The comment in zone-allocation.mjs once claimed stem-barring would exhaust
  // a 16x12 register. It would not, and publishing that as a reason would have
  // been a false measurement in a file whose whole point is measured claims.
  // These are the real figures; if a redraw moves them the comment goes red.
  const sources = nameSources({ root: ROOT });
  const stems = new Map();
  for (const f of readdirSync(join(ROOT, "content/world/resolved")).filter((n) => /^continent-\d+\.json$/.test(n))) {
    const doc = JSON.parse(readFileSync(join(ROOT, "content/world/resolved", f), "utf8"));
    const registerId = sources.registers.continentRegister[doc.continent];
    if (!registerId) continue;
    if (!stems.has(registerId)) stems.set(registerId, new Set());
    for (const l of doc.landmarks ?? []) stems.get(registerId).add(titleStem(l.name).toLowerCase());
  }
  const measured = Object.fromEntries([...stems].map(([k, v]) => [k, v.size]));
  assert.deepEqual(measured, {
    "north-log": 68, "basin-anglic": 110, "moorstone": 66, "sandtongue": 60, "reedspeech": 52,
  });
  for (const [registerId, seen] of stems) {
    const reg = sources.registers.registers[registerId];
    const capacity = reg.onsets.length * reg.rimes.length;
    assert.equal(capacity, 192, `${registerId}: register capacity moved`);
    assert.ok(seen.size < capacity,
      `${registerId}: ${seen.size} drawn stems against a capacity of ${capacity} — the scope claim would need re-stating`);
  }
});
