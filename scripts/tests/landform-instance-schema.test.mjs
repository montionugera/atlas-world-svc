// Plan B Task 2 — the two schemas the machine-written layers are held to.
// The fabric layer is generated, so every unexpected key is a bug:
// additionalProperties is false on BOTH schemas, in both directions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

// Same ESM/CJS interop guard as scripts/lib/story.mjs:11 and the two sibling
// test files — `ajv` is CJS, so under ESM the constructor may arrive as the
// module namespace's `.default`.
const AjvClass = Ajv.default ?? Ajv;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const INSTANCE = rd("content/schemas/landform-instance.schema.json");
const NODE = rd("content/schemas/spine-node.schema.json");
const LEX_PATH = join(ROOT, "content/world/lexicon/landforms.json");
const ajv = () => new AjvClass({ allErrors: true });

const POINT = {
  id: "lf-c03-r07-0142",
  // `karst-cenote` is the id Task 1 actually shipped. (An earlier revision used
  // a bare "cenote" and a comment claiming Task 1's grammar was bare and the
  // plan's "karst-cenote" was wrong. It is the other way round: there is no
  // bare `cenote` row, and plan line 2808 pins
  // glyphForType({typeId: "karst-cenote"}) -> "g-cenote" for Task 7.) The
  // lexicon-guarded test below asserts this spelling against the file, so the
  // literal cannot drift back.
  type: "karst-cenote",
  geometry: { shape: "point", at: [212.4, 88.9] },
  sizeKm: 0.31,
  cell: [425, 178],
  handle: "c03/karst/h-0f42",
  region: "c03/r07",
  named: false,
  glyph: "g-cenote",
  dungeonCapable: true,
  provenance: {
    authored: "generated",
    generator: { pass: "karst", seedStream: "landform", epoch: 0 },
    fabric: "fabric/continent-03",
  },
};
const LINE = {
  ...POINT,
  id: "lf-c03-r07-0143",
  type: "esker",
  glyph: "g-moraine",
  dungeonCapable: false,
  geometry: { shape: "line", points: [[1, 1], [2, 2], [3, 1]] },
};
const AREA = {
  ...POINT,
  id: "lf-c03-r07-0144",
  type: "polje",
  glyph: "g-pavement",
  dungeonCapable: false,
  geometry: { shape: "area", ring: [[0, 0], [2, 0], [2, 2]] },
};

test("the instance schema accepts all three geometries", () => {
  const v = ajv().compile(INSTANCE);
  for (const doc of [POINT, LINE, AREA])
    assert.ok(v(doc), `${doc.geometry.shape}: ${JSON.stringify(v.errors)}`);
});

test("the instance schema rejects a coordinate-free record", () => {
  // A generated record with no geometry payload at all is the failure mode
  // maxItems cannot see: the pass ran, produced an id, and placed nothing.
  const v = ajv().compile(INSTANCE);
  const { geometry, ...noGeometry } = POINT;
  assert.equal(v(noGeometry), false, "geometry is required");
  assert.equal(v({ ...POINT, geometry: { shape: "point" } }), false, "point without `at`");
  assert.equal(v({ ...POINT, geometry: { shape: "line" } }), false, "line without `points`");
  assert.equal(v({ ...POINT, geometry: { shape: "area" } }), false, "area without `ring`");
});

// MA-1: `required` listed eleven keys but only `geometry` was exercised, so
// cutting the list to ["geometry"] left the suite green — and a generated
// record with no id, no type, no handle, no region and no provenance validated.
// That is the "the pass ran and placed nothing" failure one level up.
test("every one of the eleven required keys is genuinely required", () => {
  const REQUIRED = ["id", "type", "geometry", "sizeKm", "cell", "handle",
    "region", "named", "glyph", "dungeonCapable", "provenance"];
  assert.deepEqual([...INSTANCE.required].sort(), [...REQUIRED].sort(),
    "the schema's required list has moved — update this test deliberately");
  const v = ajv().compile(INSTANCE);
  for (const key of REQUIRED) {
    const doc = { ...POINT };
    delete doc[key];
    assert.equal(v(doc), false, `a record with no \`${key}\` must be rejected`);
    assert.ok(
      v.errors.some((e) => e.keyword === "required" && e.params?.missingProperty === key),
      `${key}: ${JSON.stringify(v.errors)}`,
    );
  }
  assert.deepEqual(INSTANCE.provenance, undefined);
  for (const key of ["authored", "generator", "fabric"]) {
    const provenance = { ...POINT.provenance };
    delete provenance[key];
    assert.equal(v({ ...POINT, provenance }), false, `provenance.${key} must be required`);
  }
});

// MA-2: four value rules that survived their own deletion. Each pattern is read
// OUT of the schema, the way the handle test already does — a regex literal
// here would check the fixture against this file and stay green if the schema's
// `pattern` were deleted.
test("the id, region and glyph grammars are pinned to the schema's own patterns", () => {
  const v = ajv().compile(INSTANCE);
  for (const [key, ok, bad] of [
    ["id", ["lf-c03-r07-0142", "lf-c99-r99-9999"],
      ["lf-c3-r07-0142", "lf-c03-r07-142", "LF-c03-r07-0142", "lf-c03-0142", "lf-c03-r07-0142x"]],
    ["region", ["c03/r07", "c00/r00"], ["c3/r07", "c03/r7", "c03-r07", "c03/r07/x", "C03/r07"]],
    ["glyph", ["g-cenote", "g-lava-field", "g-arch2"],
      ["cenote", "g_cenote", "G-cenote", "g-", "g-cenote-", "g--cenote"]],
  ]) {
    assert.ok(INSTANCE.properties[key].pattern, `${key} must declare a pattern`);
    const re = new RegExp(INSTANCE.properties[key].pattern);
    for (const value of ok) {
      assert.match(value, re, `${key}: ${value} should match the declared pattern`);
      assert.ok(v({ ...POINT, [key]: value }), `${key}=${value}: ${JSON.stringify(v.errors)}`);
    }
    for (const value of bad)
      assert.equal(v({ ...POINT, [key]: value }), false, `${key}=${value} must be rejected`);
  }
});

test("sizeKm is strictly positive and cell is a pair of non-negative integers", () => {
  const v = ajv().compile(INSTANCE);
  assert.ok(v({ ...POINT, sizeKm: 0.0001 }));
  for (const sizeKm of [0, -1, -0.5, "0.3"])
    assert.equal(v({ ...POINT, sizeKm }), false, `sizeKm ${JSON.stringify(sizeKm)} must be rejected`);
  assert.ok(v({ ...POINT, cell: [0, 0] }));
  for (const cell of [[425.5, 178], [-1, 178], [425], [425, 178, 3], ["425", "178"]])
    assert.equal(v({ ...POINT, cell }), false, `cell ${JSON.stringify(cell)} must be rejected`);
});

test("provenance.authored is the const `generated` — these records are MACHINE-WRITTEN", () => {
  // The whole schema's premise ("every unexpected key here is a generator bug")
  // rests on this record having come out of a pass. A hand-authored record
  // claiming `"authored": "by-hand"` while carrying a generator block is the
  // provenance lie the const exists to stop.
  assert.equal(INSTANCE.properties.provenance.properties.authored.const, "generated");
  const v = ajv().compile(INSTANCE);
  for (const authored of ["by-hand", "authored", "GENERATED", "", null, true])
    assert.equal(v({ ...POINT, provenance: { ...POINT.provenance, authored } }), false,
      `authored ${JSON.stringify(authored)} must be rejected`);
  assert.equal(v({ ...POINT, provenance: { ...POINT.provenance, generator: { pass: "karst", seedStream: "landform", epoch: -1 } } }),
    false, "generator.epoch is a non-negative integer");
});

// The three geometry branches are MUTUALLY EXCLUSIVE by construction: each one
// `required`s `shape` and pins it to a distinct `const`, so no document can
// ever satisfy two. That is why `oneOf` -> `anyOf` is behaviour-neutral here
// and no test can catch it (12 candidate documents, including deliberate
// multi-payload bait, agree under both). What IS worth pinning is the property
// that makes it so — lose it and `oneOf` starts rejecting documents `anyOf`
// would accept, silently and only for some shapes.
test("the geometry branches are mutually exclusive, which is what makes oneOf safe", () => {
  const branches = INSTANCE.properties.geometry.oneOf;
  assert.equal(branches.length, 3);
  const consts = branches.map((b) => b.properties.shape.const);
  assert.deepEqual([...consts].sort(), ["area", "line", "point"]);
  for (const b of branches) {
    assert.ok(b.required.includes("shape"), `${b.properties.shape.const}: shape must be required`);
    assert.equal(b.additionalProperties, false, `${b.properties.shape.const}: branch must be closed`);
  }
});

test("the instance schema rejects an unknown key anywhere", () => {
  const v = ajv().compile(INSTANCE);
  assert.equal(v({ ...POINT, spineId: "n-thornveil" }), false, "top level");
  assert.equal(v({ ...POINT, geometry: { shape: "point", at: [1, 1], z: 3 } }), false, "geometry");
  assert.equal(
    v({ ...POINT, provenance: { ...POINT.provenance, note: "x" } }),
    false,
    "provenance",
  );
  assert.equal(
    v({
      ...POINT,
      provenance: {
        ...POINT.provenance,
        generator: { ...POINT.provenance.generator, tuning: 1 },
      },
    }),
    false,
    "provenance.generator",
  );
});

test("the instance schema rejects a wrong-shape geometry payload", () => {
  const v = ajv().compile(INSTANCE);
  assert.equal(v({ ...POINT, geometry: { shape: "point", points: [[1, 1]] } }), false);
  assert.equal(
    v({ ...AREA, geometry: { shape: "area", ring: [[0, 0], [1, 1]] } }),
    false,
    "an area ring needs >= 3 points",
  );
});

test("the instance schema rejects a ring over G-VERTEX-BUDGET's 40-vertex landform cap", () => {
  // Spec §8.3: "world-tier children <= 800 vertices, regions <= 200, landforms
  // <= 40", and §8.4: every cost in this design is linear or worse in vertex
  // count. Plan A implements the first two tiers over SPINE NODES; instances
  // are deliberately not nodes, so without maxItems here and Plan C's
  // gWorldInstanceGeometry, nothing at all constrains a generated ring.
  const v = ajv().compile(INSTANCE);
  const ring = Array.from({ length: 41 }, (_, n) => [n, (n * 7) % 13]);
  assert.equal(v({ ...AREA, geometry: { shape: "area", ring } }), false, "41-point area ring");
  assert.equal(
    v({ ...AREA, geometry: { shape: "area", ring: ring.slice(0, 40) } }),
    true,
    "40 is the cap, not 39",
  );
  const line = Array.from({ length: 41 }, (_, n) => [n, 0]);
  assert.equal(v({ ...LINE, geometry: { shape: "line", points: line } }), false, "41-point line");
  assert.equal(
    v({ ...LINE, geometry: { shape: "line", points: line.slice(0, 40) } }),
    true,
    "40 is the cap for a line too",
  );
});

test("the instance schema CANNOT check winding — that is the fabric gate's job", () => {
  // Stated as a test so nobody later "adds winding validation to the schema"
  // and believes the fabric is covered. A reversed ring is structurally
  // identical to a correct one; only gWorldInstanceGeometry (Plan C Task 11
  // Step 5c) computes the signed shoelace, and it reports
  //   G-POLY: instance <id> ring winding is <n> — an area ring must be OPEN
  //   with a STRICTLY POSITIVE signed shoelace
  const v = ajv().compile(INSTANCE);
  const reversed = {
    ...AREA,
    geometry: { shape: "area", ring: [...AREA.geometry.ring].reverse() },
  };
  assert.ok(v(reversed), "a reversed ring is schema-VALID — this is why the fabric gate exists");
});

test("the instance handle grammar is IDENTICAL to the handle-ledger grammar", () => {
  // Plan C's handle-ledger.schema.json permits 4-6 hex, because mintHandle
  // widens on a real contentHash collision. A stricter {4} here would
  // hard-reject a handle the ledger considers valid the first time that fires.
  const v = ajv().compile(INSTANCE);
  assert.ok(v({ ...POINT, handle: "c03/karst/h-0f42" }));
  assert.ok(v({ ...POINT, handle: "c03/karst/h-0f42ab" }), "6-hex collision-resolved handle");
  assert.ok(v({ ...POINT, handle: "c03/river-terrace/h-0f42" }), "hyphenated group name");
  assert.equal(v({ ...POINT, handle: "c3/karst/h-0f42" }), false);
  assert.equal(INSTANCE.properties.handle.pattern, "^c[0-9]{2}/[a-z-]+/h-[0-9a-f]{4,6}$");
});

// The lexicon is Plan B Task 1's artifact. This suite is the schema's, so the
// join is asserted against whatever rows Task 1 actually shipped rather than
// against ids quoted from a plan draft: every id used below is READ OUT of the
// file, and the one literal this file carries (POINT.type) is checked against
// the file here so a spelling bet cannot survive.
test("an instance built from a real lexicon row validates, and agrees with the row", {
  skip: existsSync(LEX_PATH)
    ? false
    : "content/world/lexicon/landforms.json is not present yet (Plan B Task 1)",
}, () => {
  const LEX = JSON.parse(readFileSync(LEX_PATH, "utf8"));
  const v = ajv().compile(INSTANCE);
  // The shared fixture's `type`/`glyph` must name a REAL row. This is the
  // assertion that settles the id-grammar question against the file instead of
  // against either party's recollection of it.
  const fixtureRow = LEX.find((r) => r.id === POINT.type);
  assert.ok(fixtureRow, `the fixture type "${POINT.type}" is not a lexicon id`);
  assert.equal(POINT.glyph, fixtureRow.glyph, `${POINT.type} glyph`);
  assert.equal(POINT.dungeonCapable, fixtureRow.dungeonCapable, `${POINT.type} dungeonCapable`);
  const payload = {
    point: { shape: "point", at: [212.4, 88.9] },
    line: { shape: "line", points: [[1, 1], [2, 2], [3, 1]] },
    area: { shape: "area", ring: [[0, 0], [2, 0], [2, 2]] },
  };
  let n = 0;
  for (const shape of ["point", "line", "area"]) {
    const row = LEX.find((r) => r.geometry === shape);
    assert.ok(row, `the lexicon carries no ${shape} row`);
    const doc = {
      ...POINT,
      type: row.id,
      glyph: row.glyph,
      dungeonCapable: row.dungeonCapable,
      geometry: payload[shape],
    };
    assert.ok(v(doc), `${row.id}: ${JSON.stringify(v.errors)}`);
    // Read the pattern OUT of the schema — a regex literal here would only
    // check the lexicon against this test, never against the schema, and would
    // stay green if properties.glyph.pattern were deleted outright.
    assert.match(row.glyph, new RegExp(INSTANCE.properties.glyph.pattern),
      `${row.id} glyph must match the instance pattern`);
    n += 1;
  }
  assert.equal(n, 3, "all three geometries must be represented in the lexicon");
});

test("all 44 committed spine nodes still validate under the tightened node schema", () => {
  const v = ajv().compile(NODE);
  const dir = join(ROOT, "content/spine/nodes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  // EXACT, not `>= 36`: the title, the task's acceptance claim and the spine
  // gate's own "44 nodes" line all say 44, and a `>=` eight below the real
  // count let eight node deletions stay green while still calling itself
  // "all 44". Trap 3 — assert the census, not just that something validated.
  assert.equal(files.length, 44, "the committed node census");
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.ok(v(doc), `${f}: ${JSON.stringify(v.errors)}`);
  }
});

test("all 58 committed features validate unchanged, and the census is unmoved", () => {
  // The typed item is only safe because it was written FROM the corpus. If a
  // later commit adds a feature shape or an attrs key the schema does not
  // enumerate, this fails here rather than reddening a gate for a node nobody
  // touched. Census measured 2026-08-20: 58 features — 48 point / 10 line /
  // 0 area, of which exactly 1 point is offSheet — and 12 distinct attrs keys.
  // (`offSheet` is a flag on a point, not a fourth kind; the prose used to say
  // "47 point ... 1 offSheet", which invited a reader to "fix" the 48 below.)
  const v = ajv().compile(NODE);
  const dir = join(ROOT, "content/spine/nodes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const itemSchema = { ...NODE.properties.features.items, $schema: NODE.$schema };
  const vItem = ajv().compile(itemSchema);
  const attrsKeys = new Set();
  let total = 0;
  const byKind = { point: 0, line: 0, area: 0 };
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const ft of doc.features ?? []) {
      total += 1;
      byKind[ft.kind] += 1;
      for (const k of Object.keys(ft.attrs ?? {})) attrsKeys.add(k);
      assert.ok(vItem(ft), `${f} / ${ft.id}: ${JSON.stringify(vItem.errors)}`);
    }
  }
  assert.equal(total, 58, "the committed feature census");
  assert.deepEqual(byKind, { point: 48, line: 10, area: 0 });
  assert.equal(attrsKeys.size, 12, "12 distinct attrs keys");
  for (const k of attrsKeys)
    assert.ok(k in NODE.properties.features.items.properties.attrs.properties, `attrs.${k} unenumerated`);
  assert.ok(v({ id: "x" }) === false); // sanity: the node validator is live
});

test("the closed root REJECTS loadSpine's injected `file` key — the gate strips it", () => {
  // The plan's premise for closing the root — "the union of keys across all 44
  // committed node files is exactly the 24 enumerated properties" — is true of
  // the FILES and false of what the gate validated. loadSpine (spine.mjs:220)
  // pushes `{ ...doc, file }`, so a closed root failed all 44 nodes with
  // `must NOT have additional properties`.
  //
  // The first fix enumerated `file` in the schema. That was a schema LIE: this
  // schema is the contract on the committed file, and enumerating a key no
  // node file may carry made a node that really does carry `file` valid — after
  // which loadSpine's spread silently overwrites the authored value with the
  // real stem, so the lie is not even inert. The shipped fix instead strips the
  // injected key at the one call site that validates (check_content.mjs), the
  // same move check_spine_emit.mjs:55 already makes for the same reason.
  //
  // Both halves are asserted: the schema rejects `file`, and no committed node
  // carries one — so the strip cannot be "tidied away" without reddening here.
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.ok(v(base), JSON.stringify(v.errors));
  assert.equal(v({ ...base, file: "n-atlas.json" }), false, "`file` is a loader key, not a content key");
  assert.equal("file" in NODE.properties, false, "the schema must not enumerate `file`");
  const dir = join(ROOT, "content/spine/nodes");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.equal("file" in doc, false, `${f} carries a literal \`file\` key`);
  }
});

test("the node schema now rejects a typo'd top-level key and a typo'd attrs key", () => {
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.ok(v(base), `n-atlas must be valid first: ${JSON.stringify(v.errors)}`);
  assert.equal(v({ ...base, terainKind: "ice" }), false, "root additionalProperties must be false");
  const withFeature = {
    ...base,
    features: [{ id: "f-x", kind: "point", at: [1, 1], attrs: { nmae: "x" } }],
  };
  assert.equal(v(withFeature), false, "attrs additionalProperties must be false");
  const badKind = { ...base, features: [{ id: "f-x", kind: "blob", at: [1, 1], attrs: {} }] };
  assert.equal(v(badKind), false, "kind is a closed enum");
  const noAttrs = { ...base, features: [{ id: "f-x", kind: "point", at: [1, 1] }] };
  assert.equal(v(noAttrs), false, "every committed feature carries attrs, so it is required");
});

// MINOR-5: `features.items` required only [id, kind, attrs], so a point with no
// `at` validated and so did a point carrying an area's `ring` — while the
// landform-instance schema written in the SAME commit couples shape to payload
// twenty lines away. Coupled now, after sweeping 100 features (44 committed
// nodes + every gate fixture): 0 affected.
test("a feature's kind is coupled to its geometry payload", () => {
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  const feat = (f) => v({ ...base, features: [{ id: "f-x", attrs: {}, ...f }] });
  const at = [1, 1], points = [[1, 1], [2, 2]], ring = [[0, 0], [2, 0], [2, 2]];
  assert.ok(feat({ kind: "point", at }), JSON.stringify(v.errors));
  assert.ok(feat({ kind: "line", points }), JSON.stringify(v.errors));
  assert.ok(feat({ kind: "area", ring }), JSON.stringify(v.errors));
  // the missing payload — "the writer ran and placed nothing"
  assert.equal(feat({ kind: "point" }), false, "a point with no `at`");
  assert.equal(feat({ kind: "line" }), false, "a line with no `points`");
  assert.equal(feat({ kind: "area" }), false, "an area with no `ring`");
  // the wrong payload — a point carrying an area's ring
  assert.equal(feat({ kind: "point", at, ring }), false, "a point carrying a ring");
  assert.equal(feat({ kind: "point", at, points }), false, "a point carrying points");
  assert.equal(feat({ kind: "line", points, at }), false, "a line carrying an at");
  assert.equal(feat({ kind: "area", ring, at }), false, "an area carrying an at");
  // and the one committed feature that is a point WITH offSheet still validates
  assert.ok(feat({ kind: "point", at, offSheet: true }), JSON.stringify(v.errors));
});

// MA-6: the header of this file says "additionalProperties is false on BOTH
// schemas, in both directions", but the FEATURE ITEM level was untested — the
// test above covers the node root and the feature `attrs`, and flipping
// features.items.additionalProperties to true left the suite green. So a typo'd
// feature-level key (`ofSheet` for `offSheet`, a stray `label`) was silently
// accepted on a machine-consumed table.
test("the node schema rejects a typo'd FEATURE-level key", () => {
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.equal(NODE.properties.features.items.additionalProperties, false);
  const ok = { ...base, features: [{ id: "f-x", kind: "point", at: [1, 1], attrs: {} }] };
  assert.ok(v(ok), JSON.stringify(v.errors));
  for (const key of ["ofSheet", "label", "wobble", "ats"])
    assert.equal(
      v({ ...base, features: [{ id: "f-x", kind: "point", at: [1, 1], attrs: {}, [key]: 1 }] }),
      false,
      `a feature carrying \`${key}\` must be rejected`,
    );
});

test("a feature may carry a nullable lexicon `type`", () => {
  // null on all 58 today — Plan D is the first writer. The key exists now so
  // that binding a feature to a landform id is a content edit, not a schema change.
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  const ok = {
    ...base,
    features: [
      { id: "f-a", kind: "point", at: [1, 1], type: "karst-cenote", attrs: {} },
      { id: "f-b", kind: "point", at: [1, 1], type: null, attrs: {} },
    ],
  };
  assert.ok(v(ok), JSON.stringify(v.errors));
  const dir = join(ROOT, "content/spine/nodes");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const ft of doc.features ?? [])
      assert.equal("type" in ft, false, `${f} / ${ft.id} already carries a type — Plan D is the first writer`);
  }
});
