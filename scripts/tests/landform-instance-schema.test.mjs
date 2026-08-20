// Plan B Task 2 — the two schemas the machine-written layers are held to.
// The fabric layer is generated, so every unexpected key is a bug:
// additionalProperties is false on BOTH schemas, in both directions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rd = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const INSTANCE = rd("content/schemas/landform-instance.schema.json");
const NODE = rd("content/schemas/spine-node.schema.json");
const LEX_PATH = join(ROOT, "content/world/lexicon/landforms.json");
const ajv = () => new Ajv({ allErrors: true });

const POINT = {
  id: "lf-c03-r07-0142",
  type: "cenote",
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
// against ids quoted from a plan draft — the plan's own fixture cites
// "karst-cenote", and Task 1's id grammar is bare ("cenote"). Deriving the
// fixtures from the file makes the join a real check instead of a spelling bet.
test("an instance built from a real lexicon row validates, and agrees with the row", {
  skip: existsSync(LEX_PATH)
    ? false
    : "content/world/lexicon/landforms.json is not present yet (Plan B Task 1)",
}, () => {
  const LEX = JSON.parse(readFileSync(LEX_PATH, "utf8"));
  const v = ajv().compile(INSTANCE);
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
    assert.match(row.glyph, /^g-[a-z0-9]+(-[a-z0-9]+)*$/, `${row.id} glyph must match the instance pattern`);
    n += 1;
  }
  assert.equal(n, 3, "all three geometries must be represented in the lexicon");
});

test("all 44 committed spine nodes still validate under the tightened node schema", () => {
  const v = ajv().compile(NODE);
  const dir = join(ROOT, "content/spine/nodes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  assert.ok(files.length >= 36, "expected the committed trunk");
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    assert.ok(v(doc), `${f}: ${JSON.stringify(v.errors)}`);
  }
});

test("all 58 committed features validate unchanged, and the census is unmoved", () => {
  // The typed item is only safe because it was written FROM the corpus. If a
  // later commit adds a feature shape or an attrs key the schema does not
  // enumerate, this fails here rather than reddening a gate for a node nobody
  // touched. Census measured 2026-08-20: 58 features, 47 point / 10 line /
  // 1 offSheet, 12 distinct attrs keys.
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

test("the closed root still admits loadSpine's injected `file` key", () => {
  // The plan's premise for closing the root — "the union of keys across all 44
  // committed node files is exactly the 24 enumerated properties" — is true of
  // the FILES and false of what the gate validates. loadSpine (spine.mjs:220)
  // pushes `{ ...doc, file }` and checkSpine (check_content.mjs:1778) runs the
  // validator over that object, so a 24-property closed root fails all 44 nodes
  // with `must NOT have additional properties`. Observed, then fixed by
  // enumerating `file`. Asserted here so a later "the schema describes the FILE,
  // drop the loader key" tidy-up reds this instead of the whole spine gate.
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  assert.ok(v({ ...base, file: "n-atlas.json" }), JSON.stringify(v.errors));
  assert.equal(v({ ...base, file: 7 }), false, "`file` is still typed");
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

test("a feature may carry a nullable lexicon `type`", () => {
  // null on all 58 today — Plan D is the first writer. The key exists now so
  // that binding a feature to a landform id is a content edit, not a schema change.
  const v = ajv().compile(NODE);
  const base = JSON.parse(readFileSync(join(ROOT, "content/spine/nodes/n-atlas.json"), "utf8"));
  const ok = {
    ...base,
    features: [
      { id: "f-a", kind: "point", at: [1, 1], type: "cenote", attrs: {} },
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
