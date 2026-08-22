// tools/mapforge/tests/mask.test.mjs — Task 3: the thirteen premises, P1, P2, P2b.
//
// TWO KINDS OF ASSERTION LIVE HERE, and the difference is the seam-1 lesson.
// The PROPERTY tests below (determinism, mutual exclusion, argmax) prove the
// passes are self-consistent; they went green under six seam-1 mutations that
// each produced a DIFFERENT WORLD. The GOLDEN VECTOR tests at the foot pin the
// actual values, so a changed frequency, coefficient or threshold reds the
// suite instead of silently re-rolling the planet. If you deliberately change
// the field, re-baseline them — that is what they are for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, idx, cellCentreKm, FLAG, SUBSTRATE_FLAGS } from "../lib/grid.mjs";
import { applyPremiseMasks, premiseMaskAt, maskSummary } from "../lib/passes/mask.mjs";
import { buildElevation, assignSubstrate } from "../lib/passes/elevation.mjs";
import { BIOMES } from "../../../scripts/lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PREM_DIR = join(ROOT, "content/world/premises");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "content/schemas/premise.schema.json"), "utf8"));
const LEXICON = JSON.parse(readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"));
const premises = readdirSync(PREM_DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(PREM_DIR, f), "utf8")));

const STREAM = "d9a0051d32afab59";

test("there are exactly 13 premises, one per manifest landmass, ids in order", () => {
  assert.equal(premises.length, 13);
  assert.deepEqual(premises.map((p) => p.id), MANIFEST.landmasses.map((l) => l.id));
  assert.deepEqual(premises.map((p) => p.title), MANIFEST.landmasses.map((l) => l.title));
});

test("every premise footprint sits fully inside the 400 x 400 frame", () => {
  for (const p of premises) {
    const [x, y] = p.footprint.centreKm;
    const [rx, ry] = p.footprint.radiiKm;
    assert.ok(x - rx > 0 && x + rx < 400, `${p.id} footprint leaves the frame in x`);
    assert.ok(y - ry > 0 && y + ry < 400, `${p.id} footprint leaves the frame in y`);
  }
});

test("premise area bands bracket the manifest's netKm2 for that landmass", () => {
  for (const p of premises) {
    const l = MANIFEST.landmasses.find((m) => m.id === p.id);
    assert.ok(p.areaBandKm2[0] <= l.netKm2 && l.netKm2 <= p.areaBandKm2[1],
      `${p.id}: manifest netKm2 ${l.netKm2} outside premise band ${JSON.stringify(p.areaBandKm2)}`);
  }
});

test("premise class matches the manifest's class for that landmass", () => {
  for (const p of premises) {
    const l = MANIFEST.landmasses.find((m) => m.id === p.id);
    assert.equal(p.class, l.class, `${p.id}: premise class ${p.class} != manifest ${l.class}`);
  }
});

test("every premise carries a register from the closed enum and a levelBand on the ring ladder", () => {
  const REGISTERS = ["basin-anglic", "north-log", "moorstone", "sandtongue", "reedspeech"];
  for (const p of premises) {
    assert.ok(REGISTERS.includes(p.register), `${p.id}: register "${p.register}" is not one of the five`);
    const [lo, hi] = p.levelBand;
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi), `${p.id}: levelBand is not integral`);
    assert.ok(lo >= 1 && hi <= 80, `${p.id}: levelBand ${JSON.stringify(p.levelBand)} leaves the 1..80 ladder`);
    assert.ok(lo < hi, `${p.id}: levelBand is not increasing`);
  }
  // c02 is the starter landmass and MUST open at 1: Gildmark is the origin of
  // the 40 km level rings, so a band that did not reach 1 would leave the
  // starter capital unreachable at level 1.
  assert.deepEqual(premises.find((p) => p.id === "c02").levelBand, [1, 40]);
});

test("footprint.centreKm is THE authority Plan D re-derives its pins from, and it is quantised", () => {
  // Plan D places ~40 pinned records against these centres and Plan E's
  // canon-leg solve reads them. A centre that drifted by a quantisation step
  // would move every pin bound to that landmass, so pin the exact values here
  // rather than trusting the JSON to stay put.
  const CENTRES = {
    c01: [200, 34], c02: [96, 148], c03: [286, 112], c04: [306, 246], c05: [176, 300],
    c06: [70, 268], c07: [46, 92], c08: [252, 344], c09: [352, 186], c10: [122, 356],
    c11: [338, 66], c12: [254, 44], c13: [40, 344],
  };
  for (const p of premises) {
    assert.deepEqual(p.footprint.centreKm, CENTRES[p.id], `${p.id} centreKm moved`);
    for (const v of p.footprint.centreKm)
      assert.equal(v, Math.round(v * 100) / 100, `${p.id} centreKm is not quantised through q()`);
  }
});

// ── the premise files joined to their own schema and to the two vocabularies ──
// premise.schema.json has NO ajv venue yet (Task 11 wires checkWorld's schemas;
// the premise schema is not in its file list). Until it does, these three tests
// ARE the join: they read the schema file rather than restating it, so a key
// added to one side and not the other reds here.

test("every premise carries exactly the schema's key set — no missing key, no stray key", () => {
  const allowed = new Set(Object.keys(SCHEMA.properties));
  const required = SCHEMA.required;
  assert.equal(SCHEMA.additionalProperties, false);
  for (const p of premises) {
    for (const k of required) assert.ok(k in p, `${p.id}: missing required key "${k}"`);
    for (const k of Object.keys(p)) assert.ok(allowed.has(k), `${p.id}: stray key "${k}"`);
    const fp = SCHEMA.properties.footprint;
    for (const k of fp.required) assert.ok(k in p.footprint, `${p.id}: footprint missing "${k}"`);
    for (const k of Object.keys(p.footprint))
      assert.ok(k in fp.properties, `${p.id}: footprint stray key "${k}"`);
  }
});

test("every closed enum the schema declares is honoured by all 13 files", () => {
  const kinds = new Set(SCHEMA.properties.structures.items.properties.kind.enum);
  const coasts = new Set(SCHEMA.properties.coastClass.enum);
  const classes = new Set(SCHEMA.properties.class.enum);
  const registers = new Set(SCHEMA.properties.register.enum);
  const seenCoast = new Set();
  for (const p of premises) {
    assert.ok(coasts.has(p.coastClass), `${p.id}: coastClass "${p.coastClass}" is off the enum`);
    assert.ok(classes.has(p.class), `${p.id}: class "${p.class}" is off the enum`);
    assert.ok(registers.has(p.register), `${p.id}: register "${p.register}" is off the enum`);
    assert.match(p.id, new RegExp(SCHEMA.properties.id.pattern));
    seenCoast.add(p.coastClass);
    for (const s of p.structures)
      assert.ok(kinds.has(s.kind), `${p.id}: structure kind "${s.kind}" is off the enum`);
  }
  // The coastClass enum has exactly 13 members because there is one per
  // landmass — a duplicate would mean one of the thirteen enum rows is dead.
  assert.equal(seenCoast.size, 13, "two premises share a coastClass; one enum row is unreachable");
});

test("every palette entry is a BIOME and every landformKit entry is a lexicon group", () => {
  // THE degradation this guards: a palette naming a biome the renderer has no
  // fill for, or a kit naming a group with no lexicon rows, places zero
  // instances with every gate green — the same class as the requires.rock hole
  // P2b exists to close.
  const biomes = new Set(BIOMES);
  const groups = new Set(LEXICON.flatMap((r) => [].concat(r.group)));
  assert.equal(groups.size, 12, "the lexicon no longer has 12 groups");
  for (const p of premises) {
    for (const b of p.palette) assert.ok(biomes.has(b), `${p.id}: palette entry "${b}" is not a BIOME`);
    for (const g of p.landformKit)
      assert.ok(groups.has(g), `${p.id}: landformKit entry "${g}" is not a lexicon group`);
  }
});

test("premiseMaskAt is ~1 at an unsubtracted footprint centre and 0 far outside", () => {
  // PLAN CORRECTION (Task 3 Step 1). The plan asserts this of c02 at > 0.9 and
  // that is unsatisfiable BY THE PLAN'S OWN c02 PREMISE: its inland sea sits at
  // [104,156], 11.31 km from the centre [96,148], with radius 19 and amplitude
  // 0.55, so the lobe subtracts 0.197 at the centre before any warp. Measured
  // there: 0.7705. The property the test means is about the ELLIPSE, so it is
  // asserted on a premise whose structures are purely additive; c02's and c11's
  // subtractive lobes get their own test below, which is the stronger check.
  // The floor is 0.85 and not 1.0 because the domain warp displaces the sample
  // by up to warpKm before the ellipse test — so a centre reads "deep inside",
  // not "exactly at the peak", and how deep depends on the stream. Both streams
  // are swept for that reason. Measured worst over the 11 additive premises x 2
  // streams: 0.8887 (c03 on the a-stream).
  const additive = premises.filter((p) => !p.structures.some(
    (s) => s.kind === "inland-sea" || s.kind === "atoll-lagoon"));
  assert.equal(additive.length, 11);
  for (const stream of ["aaaaaaaaaaaaaaaa", STREAM])
    for (const p of additive) {
      const [cx, cy] = p.footprint.centreKm;
      const m = premiseMaskAt({ premise: p, xKm: cx, yKm: cy, stream });
      assert.ok(m > 0.85, `${p.id} reads ${m.toFixed(4)} at its own centre on stream ${stream}`);
      assert.equal(premiseMaskAt({ premise: p, xKm: 1, yKm: 399, stream }), 0,
        `${p.id} claims the far corner of the frame`);
    }
});

test("the subtractive lobes bite: c02's inland sea and c11's lagoon hollow their centres", () => {
  // Without this, "inland sea" and "atoll ring — no interior" are prose. The
  // comparison is against the SAME premise with its structures removed, so it
  // measures the lobe and not the ellipse.
  for (const [id, floor] of [["c02", 0.85], ["c11", 0.6]]) {
    const p = premises.find((x) => x.id === id);
    const [cx, cy] = p.footprint.centreKm;
    const withLobe = premiseMaskAt({ premise: p, xKm: cx, yKm: cy, stream: STREAM });
    const without = premiseMaskAt({ premise: { ...p, structures: [] }, xKm: cx, yKm: cy, stream: STREAM });
    assert.ok(without > 0.9, `${id} without its structures should read ~1 at its centre, got ${without}`);
    assert.ok(withLobe < without * floor,
      `${id}: the lobe removed only ${(without - withLobe).toFixed(4)} at the centre`);
  }
});

test("premiseMaskAt returns EXACTLY 0 outside the ellipse, so `mask > 0` is a clean predicate", () => {
  // Not 1e-18. applyPremiseMasks keys plate assignment off `m > best` starting
  // at best = 0, and every downstream pass tests `maskField[i] === 0`; a
  // denormal leak would put ocean floor on a plate.
  const p = premises.find((x) => x.id === "c11");
  const [cx, cy] = p.footprint.centreKm;
  const [rx] = p.footprint.radiiKm;
  for (let d = rx + p.footprint.warpKm + 1; d < 60; d += 0.5) {
    const m = premiseMaskAt({ premise: p, xKm: cx + d, yKm: cy, stream: STREAM });
    assert.equal(m, 0, `mask leaked ${m} at ${d} km beyond c11's rim`);
    assert.ok(Object.is(m, 0) && !Object.is(m, -0), "mask returned -0");
  }
});

test("applyPremiseMasks assigns every masked cell to exactly one plate, argmax", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });   // coarse grid, same frame
  const { maskField, plateArea } = applyPremiseMasks({ grid, premises, stream: STREAM });
  assert.equal(maskField.length, grid.n);
  assert.equal(plateArea.length, premises.length);
  let masked = 0;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] > 0) { masked++; assert.ok(grid.plate[i] >= 0 && grid.plate[i] < 13); }
    else assert.equal(grid.plate[i], -1);
  }
  assert.ok(masked > 0, "no cell was masked at all");
  assert.equal(plateArea.reduce((a, b) => a + b, 0), masked);
});

test("every premise claims at least one cell — no landmass is masked out of existence", () => {
  const grid = makeGrid({ w: 400, h: 400, cellKm: 1 });
  const { plateArea } = applyPremiseMasks({ grid, premises, stream: STREAM });
  for (let k = 0; k < premises.length; k++)
    assert.ok(plateArea[k] > 0, `${premises[k].id} claimed 0 cells — its footprint is swallowed by a neighbour`);
});

test("the argmax tie-break is the LOWEST premise index, not iteration order", () => {
  // Two identical footprints: only the tie-break can decide, and it must pick
  // the first. Without it, a reordered premise directory moves the world.
  const twin = (id) => ({
    ...premises[0], id, footprint: { centreKm: [200, 200], radiiKm: [20, 20], warpKm: 0 },
    structures: [],
  });
  const grid = makeGrid({ w: 100, h: 100, cellKm: 4 });
  const { plateArea } = applyPremiseMasks({ grid, premises: [twin("c01"), twin("c02")], stream: STREAM });
  assert.ok(plateArea[0] > 0, "the first of two identical premises claimed nothing");
  assert.equal(plateArea[1], 0, "a tie went to the LATER premise — the tie-break is order-dependent");
});

test("applyPremiseMasks is a pure function of (grid geometry, premises, stream)", () => {
  const run = () => {
    const g = makeGrid({ w: 200, h: 200, cellKm: 2 });
    const r = applyPremiseMasks({ grid: g, premises, stream: STREAM });
    return { mask: Array.from(r.maskField), plate: Array.from(g.plate) };
  };
  assert.deepEqual(run(), run());
});

test("a different stream produces a different mask — the stream is actually threaded", () => {
  const run = (stream) => {
    const g = makeGrid({ w: 200, h: 200, cellKm: 2 });
    applyPremiseMasks({ grid: g, premises, stream });
    return Array.from(g.plate);
  };
  assert.notDeepEqual(run(STREAM), run("0123456789abcdef"));
});

test("maskSummary reports one row per premise with its id, cells and km2", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { plateArea } = applyPremiseMasks({ grid, premises, stream: STREAM });
  const rows = maskSummary({ premises, plateArea, cellAreaKm2: 4 });
  assert.equal(rows.length, 13);
  assert.deepEqual(rows.map((r) => r.id), premises.map((p) => p.id));
  for (let k = 0; k < rows.length; k++) {
    assert.equal(rows[k].cells, plateArea[k]);
    assert.equal(rows[k].km2, Math.round(plateArea[k] * 4 * 100) / 100);
  }
});

test("buildElevation raises masked ground above unmasked ground everywhere", () => {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  let maxOcean = -Infinity, minMaskedCore = Infinity;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] === 0) maxOcean = Math.max(maxOcean, grid.elev[i]);
    if (maskField[i] > 0.9) minMaskedCore = Math.min(minMaskedCore, grid.elev[i]);
  }
  assert.ok(minMaskedCore > maxOcean,
    `premise cores (${minMaskedCore}) must outrank every unmasked cell (${maxOcean}) — otherwise rank selection picks ocean floor`);
});

test("the two elevation bands are disjoint at EVERY mask value, including m just above 0", () => {
  // The ordering test above compares cores against ocean. This one is the
  // property P3 actually depends on: the LOWEST masked cell in the whole field
  // still outranks the HIGHEST ocean-floor cell. A coastal shell that tapered
  // to 0 instead of to the 0.01 floor would break rank selection at the margin
  // and nothing else in the suite would notice.
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  let maxOcean = -Infinity, minLand = Infinity;
  for (let i = 0; i < grid.n; i++) {
    if (maskField[i] === 0) maxOcean = Math.max(maxOcean, grid.elev[i]);
    else minLand = Math.min(minLand, grid.elev[i]);
  }
  assert.ok(minLand > maxOcean, `land floor ${minLand} does not clear ocean ceiling ${maxOcean}`);
  assert.ok(maxOcean < 0, `ocean floor reached ${maxOcean}; the band must stay strictly negative`);
  // 0.01 through a Float32Array is 0.009999999776482582, so compare against
  // the float32 the clamp actually stores rather than the decimal literal.
  const CLAMP = new Float32Array([0.01])[0];
  assert.ok(minLand >= CLAMP, `land floor ${minLand} fell below the 0.01 clamp`);
});

test("buildElevation is deterministic", () => {
  const run = () => {
    const g = makeGrid({ w: 120, h: 120, cellKm: 400 / 120 });
    const { maskField } = applyPremiseMasks({ grid: g, premises, stream: STREAM });
    buildElevation({ grid: g, premises, maskField, stream: STREAM });
    return Array.from(g.elev);
  };
  assert.deepEqual(run(), run());
});

test("every ridge structure actually bites — measured as a DIFFERENCE, not a comparison", () => {
  // The obvious form of this test ("the spine outranks its flank") is FALSE
  // COMFORT and was measured to be so: deleting the whole structural loop from
  // buildElevation left it green, because the base fbm happened to order those
  // two cells the same way. So the test builds the field TWICE — once with the
  // ridge structures and once without — and measures what the term contributed.
  // The mask is unaffected by removing them (premiseMaskAt reads only
  // inland-sea and atoll-lagoon), so the same maskField serves both runs.
  const RIDGE = new Set(["spine-ridge", "volcanic-spine"]);
  const grid = makeGrid({ w: 400, h: 400, cellKm: 1 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  const withRidge = Float32Array.from(grid.elev);
  const flattened = premises.map((p) => ({ ...p, structures: p.structures.filter((s) => !RIDGE.has(s.kind)) }));
  buildElevation({ grid, premises: flattened, maskField, stream: STREAM });
  const at = (a, xKm, yKm) => a[idx({ grid, cx: Math.floor(xKm), cy: Math.floor(yKm) })];
  let checked = 0;
  for (const p of premises)
    for (const s of p.structures) {
      if (!RIDGE.has(s.kind)) continue;
      const mx = (s.fromKm[0] + s.toKm[0]) / 2, my = (s.fromKm[1] + s.toKm[1]) / 2;
      const lift = at(withRidge, mx, my) - at(grid.elev, mx, my);
      // falloff(0, 0.08) is 1, and spine-ridge is scaled by 0.8, so the lift at
      // the segment midpoint is the full amplitude x 0.8 unless the high clamp
      // eats it. Half of that is a floor no accident clears.
      assert.ok(lift > s.amplitude * 0.4,
        `${p.id}'s ${s.kind} lifted its own midpoint by only ${lift.toFixed(4)} of ${s.amplitude}`);
      checked++;
    }
  assert.equal(checked, 6, "the ridge census changed — six premises carry a spine or volcanic spine");
});

// ── P2b: substrate. THE reason 45 of 170 lexicon rows can match anything ──
function substrateWorld() {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  return { grid, maskField };
}

test("every masked cell carries exactly one substrate bit, and no unmasked cell carries any", () => {
  const { grid, maskField } = substrateWorld();
  for (let i = 0; i < grid.n; i++) {
    const set = SUBSTRATE_FLAGS.filter((f) => (grid.flags[i] & f) !== 0).length;
    if (maskField[i] === 0) assert.equal(set, 0, `cell ${i} is ocean floor but carries a substrate bit`);
    else assert.equal(set, 1, `cell ${i} carries ${set} substrate bits — they are mutually exclusive`);
  }
});

test("all THREE requires.rock values Plan B's schema permits are actually produced", () => {
  // The key-set cross-check in landforms.test.mjs proves matchesRequires
  // HANDLES `rock`; it says nothing about the VALUES. Plan B closes the enum
  // to carbonate | clastic | volcanic, so a generator that only ever produces
  // one of them silently starves 19 clastic rows and 16 volcanic rows.
  const { grid } = substrateWorld();
  const seen = new Set();
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.CARBONATE) !== 0) seen.add("carbonate");
    else if ((grid.flags[i] & FLAG.VOLCANIC) !== 0) seen.add("volcanic");
    else if ((grid.flags[i] & FLAG.SAND) !== 0) seen.add("clastic");
  }
  assert.deepEqual([...seen].sort(), ["carbonate", "clastic", "volcanic"]);
});

test("the three rock classes are joined to the lexicon's own requires.rock values", () => {
  // Not a restatement of the line above: this reads the COMMITTED lexicon, so
  // a fourth rock value appearing there reds here instead of degrading 45 rows
  // into `substitutions` at Task 8.
  const used = new Set(LEXICON.map((r) => r.requires?.rock).filter(Boolean));
  assert.deepEqual([...used].sort(), ["carbonate", "clastic", "volcanic"]);
  const { grid } = substrateWorld();
  const produced = new Set();
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.CARBONATE) !== 0) produced.add("carbonate");
    else if ((grid.flags[i] & FLAG.VOLCANIC) !== 0) produced.add("volcanic");
    else if ((grid.flags[i] & FLAG.SAND) !== 0) produced.add("clastic");
  }
  for (const r of used) assert.ok(produced.has(r), `no cell can ever satisfy requires.rock: "${r}"`);
});

test("substrate follows the premise kit: c04's karst ground is carbonate, c10's arc is volcanic", () => {
  const { grid } = substrateWorld();
  const share = (contIndex, flag) => {
    let hit = 0, total = 0;
    for (let i = 0; i < grid.n; i++) {
      if (grid.plate[i] !== contIndex) continue;
      total++;
      if ((grid.flags[i] & flag) !== 0) hit++;
    }
    return total === 0 ? 0 : hit / total;
  };
  const k04 = premises.findIndex((p) => p.id === "c04");
  const k10 = premises.findIndex((p) => p.id === "c10");
  assert.ok(share(k04, FLAG.CARBONATE) > 0.5, "Stonemoor's karst kit needs carbonate ground under it");
  assert.ok(share(k10, FLAG.VOLCANIC) > 0.5, "Ashen Spar's volcanic kit needs volcanic ground under it");
  // And ARC is set wherever VOLCANIC is, because Plan B's volcanic group
  // default is `{ rock: "volcanic", nearFlag: "ARC" }` — one without the
  // other places zero instances.
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.VOLCANIC) !== 0)
      assert.notEqual(grid.flags[i] & FLAG.ARC, 0, `cell ${i} is volcanic ground with no ARC bit`);
});

test("ARC is set ONLY on volcanic ground — it is not a blanket bit", () => {
  // The converse of the rule above. A pass that set ARC everywhere would
  // satisfy the volcanic-group predicate on all 13 landmasses and place cones
  // on the ice cap, and the test above would still be green.
  const { grid } = substrateWorld();
  for (let i = 0; i < grid.n; i++)
    if ((grid.flags[i] & FLAG.ARC) !== 0)
      assert.notEqual(grid.flags[i] & FLAG.VOLCANIC, 0, `cell ${i} carries ARC without volcanic ground`);
});

test("every premise whose kit names volcanic, karst or desert gets that class as its majority", () => {
  const { grid } = substrateWorld();
  const KIT_FLAG = [["volcanic", FLAG.VOLCANIC], ["karst", FLAG.CARBONATE], ["desert", FLAG.SAND]];
  for (let k = 0; k < premises.length; k++) {
    const p = premises[k];
    for (const [kit, flag] of KIT_FLAG) {
      if (!p.landformKit.includes(kit)) continue;
      let hit = 0, total = 0;
      for (let i = 0; i < grid.n; i++) {
        if (grid.plate[i] !== k) continue;
        total++;
        if ((grid.flags[i] & flag) !== 0) hit++;
      }
      assert.ok(total > 0 && hit / total > 0.5,
        `${p.id} names kit "${kit}" but only ${hit}/${total} of its ground carries that substrate`);
    }
  }
});

test("assignSubstrate is idempotent — running it twice leaves identical flags", () => {
  const grid = makeGrid({ w: 120, h: 120, cellKm: 400 / 120 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  const once = Array.from(grid.flags);
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  assert.deepEqual(Array.from(grid.flags), once);
});

test("assignSubstrate CLEARS a stale substrate bit rather than OR-ing a second one on", () => {
  // grid.mjs has no setSubstrate helper and hasFlag on a multi-bit mask has
  // ANY semantics, so `setFlag(CARBONATE)` then `setFlag(VOLCANIC)` leaves a
  // cell reading as two rock types. Recorded as an open item by seam 1; this
  // is the test that closes it.
  const grid = makeGrid({ w: 120, h: 120, cellKm: 400 / 120 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  for (let i = 0; i < grid.n; i++) grid.flags[i] |= FLAG.CARBONATE | FLAG.SAND | FLAG.VOLCANIC;
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  for (let i = 0; i < grid.n; i++) {
    const set = SUBSTRATE_FLAGS.filter((f) => (grid.flags[i] & f) !== 0).length;
    assert.equal(set, maskField[i] === 0 ? 0 : 1, `cell ${i} kept ${set} substrate bits`);
  }
});

test("assignSubstrate is deterministic", () => {
  const a = Array.from(substrateWorld().grid.flags);
  const b = Array.from(substrateWorld().grid.flags);
  assert.deepEqual(a, b);
});

test("the swept mask equals the per-cell premiseMaskAt, cell for cell", () => {
  // applyPremiseMasks hoists the domain warp out of the premise loop for a 13x
  // speed-up. That hoist is only safe while the two paths stay ONE body; this
  // test is what makes a divergence loud instead of a differently-shaped world.
  const grid = makeGrid({ w: 60, h: 60, cellKm: 400 / 60 });
  const { maskField } = applyPremiseMasks({ grid, premises, stream: STREAM });
  for (let cyi = 0; cyi < grid.h; cyi++)
    for (let cxi = 0; cxi < grid.w; cxi++) {
      const [x, y] = cellCentreKm({ grid, cx: cxi, cy: cyi });
      let best = 0;
      for (const p of premises)
        best = Math.max(best, premiseMaskAt({ premise: p, xKm: x, yKm: y, stream: STREAM }));
      // maskField is a Float32Array, so compare against the float32 the sweep
      // would store — not the float64 the reference path returns.
      assert.equal(maskField[idx({ grid, cx: cxi, cy: cyi })], new Float32Array([best])[0],
        `swept mask diverged from premiseMaskAt at (${cxi}, ${cyi})`);
    }
});

// ── GOLDEN VECTORS ───────────────────────────────────────────────────────────
// THE SEAM-1 LESSON, applied. Six mutations there — a hash multiplier, an
// xor-shift, a divisor, an fbm frequency step, a digest algorithm, a join order
// — each produced a DIFFERENT WORLD while every property test stayed green,
// because the suite proved determinism without proving determinism AT THE RIGHT
// VALUES. Everything above this line survives a changed WARP_FREQ, BASE_FREQ,
// SUBSTRATE_FREQ, relief coefficient, ocean-floor band or premise radius. These
// do not.
//
// A field digest is the sum of Math.round(v * 1e6) over every cell — one
// integer that no single-cell change can survive — and the point samples say
// WHERE a drift landed. Re-baseline them only when the world is deliberately
// re-rolled, and say so in the commit.
const DIGEST = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.round(a[i] * 1e6); return s; };

function goldenWorld() {
  const grid = makeGrid({ w: 200, h: 200, cellKm: 2 });
  const { maskField, plateArea } = applyPremiseMasks({ grid, premises, stream: STREAM });
  buildElevation({ grid, premises, maskField, stream: STREAM });
  return { grid, maskField, plateArea };
}

test("GOLDEN: premiseMaskAt at six named coordinates", () => {
  const GOLD = [
    ["c02", 96, 148, 0.7927373616341917],    // its own centre, hollowed by the inland sea
    ["c02", 60, 180, 0.3226767427522486],    // out on the shell
    ["c04", 306, 246, 0.9761540258157704],
    ["c10", 122, 356, 0.98438678643163],
    ["c11", 338, 66, 0.4899769000184042],    // hollowed by the atoll lagoon
    ["c03", 285, 113, 0.9644921472390013],
  ];
  for (const [id, x, y, want] of GOLD) {
    const p = premises.find((q) => q.id === id);
    assert.equal(premiseMaskAt({ premise: p, xKm: x, yKm: y, stream: STREAM }), want,
      `${id} mask moved at (${x}, ${y}) — the warp, the radii or the structures changed`);
  }
});

test("GOLDEN: the mask field and the plate histogram", () => {
  const { maskField, plateArea } = goldenWorld();
  assert.equal(DIGEST(maskField), 6088911720, "the mask field moved");
  assert.deepEqual(Array.from(plateArea),
    [1868, 3449, 2995, 4034, 3122, 1105, 764, 1026, 255, 256, 330, 445, 359],
    "the plate histogram moved — a premise radius or the argmax changed");
});

test("GOLDEN: the elevation field, whole and at six points", () => {
  const { grid } = goldenWorld();
  assert.equal(DIGEST(grid.elev), -11056922549, "the elevation field moved");
  const GOLD = [
    [10, 10, -0.5790703892707825],       // ocean floor: pins the -0.75 + 0.25*fbm band
    [48, 74, 0.2761702537536621],
    [153, 123, 0.5547865629196167],
    [176, 33, 0.08689439296722412],      // the cap's shell, near the waterline
    [35, 133, 0.2798057198524475],
    [63, 177, 0.9305899739265442],       // high ground under a structural term
  ];
  for (const [cx, cy, want] of GOLD)
    assert.equal(grid.elev[idx({ grid, cx, cy })], want, `elevation moved at (${cx}, ${cy})`);
  // The clamps must stay RARE: if either end is doing the shaping rather than
  // bounding it, a coefficient change hides inside a saturated field.
  const elev = Array.from(grid.elev);
  assert.equal(elev.filter((v) => v === 1).length, 10, "the high clamp moved");
  assert.equal(elev.filter((v) => v === new Float32Array([0.01])[0]).length, 106, "the low clamp moved");
});

test("GOLDEN: the substrate assignment", () => {
  const { grid, maskField, plateArea } = goldenWorld();
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  let carbonate = 0, volcanic = 0, clastic = 0, arc = 0;
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.CARBONATE) !== 0) carbonate++;
    else if ((grid.flags[i] & FLAG.VOLCANIC) !== 0) volcanic++;
    else if ((grid.flags[i] & FLAG.SAND) !== 0) clastic++;
    if ((grid.flags[i] & FLAG.ARC) !== 0) arc++;
  }
  assert.deepEqual({ carbonate, volcanic, clastic, arc },
    { carbonate: 4034, volcanic: 256, clastic: 15718, arc: 256 },
    "the substrate split moved — SUBSTRATE_FREQ, a threshold or a kit changed");
  assert.equal(DIGEST(grid.flags), 2409344000000, "the flag field moved");
  // At this resolution c04 is wholly carbonate and c10 wholly volcanic, so the
  // two counts are exactly their plate areas. Stated, not left to be noticed:
  // a reviewer who spots the coincidence should not have to re-derive it.
  const k = (id) => premises.findIndex((p) => p.id === id);
  assert.equal(carbonate, plateArea[k("c04")]);
  assert.equal(volcanic, plateArea[k("c10")]);
});

test("GOLDEN: c04 is WHOLLY carbonate and c10 WHOLLY volcanic — the shares are 1.0, not >0.5", () => {
  // The plan's test asks only for > 0.5 and is therefore satisfied by a world
  // in which the substrate noise does nothing. It does nothing: SUBSTRATE_FREQ
  // is a recorded mutation survivor (see elevation.mjs) precisely because
  // neither threshold ever rejects a cell. Pinning the exact shares is what
  // makes that fact a fixture instead of a comment — the day a gate moves, or a
  // premise names two substrate kits, this reds.
  const { grid, maskField, plateArea } = goldenWorld();
  assignSubstrate({ grid, premises, maskField, stream: STREAM });
  const share = (id, flag) => {
    const k = premises.findIndex((p) => p.id === id);
    let hit = 0;
    for (let i = 0; i < grid.n; i++) if (grid.plate[i] === k && (grid.flags[i] & flag) !== 0) hit++;
    return hit / plateArea[k];
  };
  assert.equal(share("c04", FLAG.CARBONATE), 1);
  assert.equal(share("c10", FLAG.VOLCANIC), 1);
  assert.equal(share("c05", FLAG.SAND), 1, "c05 names the desert kit and is wholly clastic ground");
});

test("GOLDEN: the calibrated footprint radii, and the land split they were fitted to", () => {
  // Task 3 Step 11. The plan's table radii mask 47,142 km2 — 72% of the 65,600
  // the rank target needs — so P3 threw on day one, exactly as the plan's own
  // Step 11 predicted. The radii below are the fitted point of a damped
  // fixed-point iteration on POST-RANK land area per continent (8 iterations,
  // converged to worst error 0.1%); centres, aspect ratios, coastClass,
  // structures and every other field are the plan's, untouched.
  //
  // warpKm is NOT in the plan's table — only c02's example value, 12, written
  // against the pre-calibration radii [58, 44]. It is derived here by one rule,
  // `round(min(rx, ry) * 0.27)`, which reproduces that 12 exactly at those radii
  // and keeps the outline wobble proportional as the footprints grow.
  const RADII = {
    c01: [97.48, 27.55], c02: [79.7, 60.46], c03: [68.89, 63.59], c04: [70.31, 70.31],
    c05: [74.02, 55.52], c06: [41.51, 32.61], c07: [30.66, 30.66], c08: [45.51, 32.51],
    c09: [15.74, 21.64], c10: [27.86, 11.79], c11: [21.73, 21.73], c12: [38.25, 22.95],
    c13: [28.27, 15.42],
  };
  for (const p of premises) {
    assert.deepEqual(p.footprint.radiiKm, RADII[p.id], `${p.id} radiiKm moved`);
    for (const v of p.footprint.radiiKm)
      assert.equal(v, Math.round(v * 100) / 100, `${p.id} radiiKm is not quantised through q()`);
    assert.equal(p.footprint.warpKm, Math.round(Math.min(...p.footprint.radiiKm) * 0.27),
      `${p.id} warpKm left the round(min(rx, ry) * 0.27) rule`);
  }
});

test("a lobe that over-subtracts returns POSITIVE zero, not -0", () => {
  // The `m <= 0 ? 0` tail, killed directly. Outside the ellipse the `d >= 1`
  // early return already yields +0, so no real premise exercises this branch —
  // a synthetic one with an amplitude that drives the mask negative does, and
  // without it the branch could return -0 for the rest of the pipeline to
  // store in a Float32Array and compare against.
  const over = {
    ...premises[0], id: "c99",
    footprint: { centreKm: [200, 200], radiiKm: [30, 30], warpKm: 0 },
    structures: [{ kind: "inland-sea", atKm: [200, 200], radiusKm: 25, amplitude: 2 }],
  };
  const m = premiseMaskAt({ premise: over, xKm: 200, yKm: 200, stream: STREAM });
  assert.ok(Object.is(m, 0), `over-subtracted mask returned ${m}, not +0`);
});
