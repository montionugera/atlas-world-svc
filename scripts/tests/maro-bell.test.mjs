// F-183: Maro Bell grey-box map invariants (content/maps/maro-bell.json).
// Metres are centred on the map (x east, z south); server units = centre + metres / 0.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const doc = JSON.parse(
  readFileSync(resolve(ROOT, "content/maps/maro-bell.json"), "utf8"),
);
const byId = new Map(doc.structures.map((s) => [s.id, s]));
const CX = doc.width / 2;
const CY = doc.height / 2;
const rectOf = (s) => ({
  min_x: CX + (s.x - s.size.x / 2),
  max_x: CX + (s.x + s.size.x / 2),
  min_y: CY + (s.z - s.size.z / 2),
  max_y: CY + (s.z + s.size.z / 2),
});
const solid = (s) => s.solid !== false;

test("map is 80 m x 160 m in server units", () => {
  assert.equal(doc.mapId, "maro-bell");
  assert.equal(doc.width, 80);
  assert.equal(doc.height, 160);
});

test("every required id is present", () => {
  const ids = [
    "great-bell",
    "cliff-west",
    "cliff-east",
    "gate-west",
    "gate-east",
    "amber-shop",
    "bram-house",
    "tovin-shrine",
    "old-lantern",
  ];
  for (const n of ["bram", "pip", "edda", "amber", "reed", "tovin"])
    ids.push(`npc-spot-${n}`);
  for (const id of ids) assert.ok(byId.has(id), `missing ${id}`);
  assert.ok(
    [...byId.keys()].filter((i) => i.startsWith("porcelain-rib-")).length >= 4,
  );
  assert.ok(
    [...byId.keys()].filter((i) => i.startsWith("lantern-")).length >= 12,
  );
  assert.equal(
    [...byId.keys()].filter((i) => i.startsWith("height-post-")).length,
    12,
  );
  assert.ok(doc.routes.some((r) => r.id === "road-main"));
  for (const n of ["bram", "pip", "edda", "amber", "reed", "tovin"]) {
    assert.equal(byId.get(`npc-spot-${n}`).label.toLowerCase(), n);
  }
  assert.equal(
    new Set(doc.structures.map((s) => s.id)).size,
    doc.structures.length,
    "duplicate structure id",
  );
});

test("race-height posts match the F-183 scale table within 0.01 m", () => {
  const table = {
    daro: [1.2, 1.11],
    maro: [1.03, 0.94],
    linde: [1.03, 0.94],
    silme: [1.03, 0.94],
    tava: [0.91, 0.82],
    ondo: [0.84, 0.77],
  };
  for (const [race, [m, f]] of Object.entries(table)) {
    assert.ok(
      Math.abs(byId.get(`height-post-${race}-m`).size.y - m) <= 0.01,
      `${race} m`,
    );
    assert.ok(
      Math.abs(byId.get(`height-post-${race}-f`).size.y - f) <= 0.01,
      `${race} f`,
    );
  }
});

test("every solid block has a matching static obstacle, and nothing else does", () => {
  const solids = doc.structures.filter(solid);
  const obsById = new Map(doc.staticObstacles.map((o) => [o.id, o]));
  assert.equal(obsById.size, solids.length);
  for (const s of solids) {
    const o = obsById.get(s.id);
    assert.ok(o, `no obstacle for ${s.id}`);
    for (const [k, v] of Object.entries(rectOf(s)))
      assert.ok(Math.abs(o[k] - v) < 0.051, `${s.id}.${k} ${o[k]} vs ${v}`);
  }
  assert.ok(
    !solid(byId.get("great-bell")),
    "the hanging bell must not block the terrace",
  );
});

const hits = (a, b, r, pad) => {
  // segment a->b (metres) vs rect inflated by pad: sample densely.
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 10);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const y = a[1] + ((b[1] - a[1]) * i) / n;
    if (
      x > r.min_x - pad &&
      x < r.max_x + pad &&
      y > r.min_y - pad &&
      y < r.max_y + pad
    )
      return true;
  }
  return false;
};

test("spawn is at the arrival gate and the road reaches the bell terrace clear of obstacles", () => {
  const sp = [doc.playerSpawn.x, doc.playerSpawn.y];
  const gate = byId.get("gate-west");
  const gz = CY + gate.z;
  assert.ok(
    Math.abs(sp[1] - gz) <= 10 && Math.abs(sp[0] - CX) <= 5,
    "spawn within 10 m of the gate opening",
  );
  assert.ok(
    !doc.staticObstacles.some(
      (o) =>
        sp[0] > o.min_x &&
        sp[0] < o.max_x &&
        sp[1] > o.min_y &&
        sp[1] < o.max_y,
    ),
    "spawn inside an obstacle",
  );
  const road = doc.routes.find((r) => r.id === "road-main");
  const pts = road.points.map(([x, z]) => [CX + x, CY + z]);
  assert.ok(
    Math.hypot(pts[0][0] - sp[0], pts[0][1] - sp[1]) <= 10,
    "road starts within 10 m of spawn",
  );
  const bell = byId.get("great-bell");
  const end = pts.at(-1);
  assert.ok(
    Math.hypot(end[0] - (CX + bell.x), end[1] - (CY + bell.z)) <= 10,
    "road ends within 10 m of the bell",
  );
  const halfW = road.width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    for (const o of doc.staticObstacles)
      assert.ok(
        !hits(pts[i], pts[i + 1], o, halfW),
        `road segment ${i} touches ${o.id}`,
      );
  }
});

// ---- F-218 / I-303: canon re-block, gate tower art, lantern post, barrels ----
const near = (a, b, t) => Math.abs(a - b) <= t;
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "game-client/assets/manifest.json"), "utf8"),
).entries;
const pocSrc = readFileSync(
  resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"),
  "utf8",
);
const lanterns = doc.structures.filter((s) => /^lantern-\d+$/.test(s.id));

test("canon block heights (spec re-block table)", () => {
  for (const id of ["amber-shop", "bram-house", "tovin-shrine"])
    assert.ok(near(byId.get(id).size.y, 6.5, 0.01), `${id}.y`);
  assert.equal(lanterns.length, 14);
  for (const s of lanterns) assert.ok(near(s.size.y, 3.1, 0.01), `${s.id}.y`);
  assert.ok(
    near(byId.get("amber-shop").size.x, 7, 0.01) &&
      near(byId.get("amber-shop").size.z, 6, 0.01),
    "footprint unchanged",
  );
});

test("gate towers match the r01 art footprint, inner faces stay at +-2.0 m", () => {
  for (const id of ["gate-west", "gate-east"]) {
    const g = byId.get(id);
    assert.ok(
      near(Math.abs(g.x) - g.size.x / 2, 2.0, 0.01),
      `${id} inner face`,
    );
    assert.ok(
      near(g.size.x, 3.74, 0.01) &&
        near(g.size.y, 7.1, 0.01) &&
        near(g.size.z, 2.37, 0.01),
      `${id} size`,
    );
    assert.equal(g.rotY, 0);
    assert.equal(g.z, 76);
    assert.ok(!("assetOffset" in g), "no assetOffset");
    assert.equal(g.assetPath, "env:maro-gate-tower");
  }
});

test("only the 2 gate obstacle rows changed, with the spec values", () => {
  const want = {
    "gate-west": { min_x: 34.26, max_x: 38.0, min_y: 154.815, max_y: 157.185 },
    "gate-east": { min_x: 42.0, max_x: 45.74, min_y: 154.815, max_y: 157.185 },
  };
  for (const o of doc.staticObstacles.filter((r) => want[r.id]))
    for (const [k, v] of Object.entries(want[o.id]))
      assert.ok(near(o[k], v, 0.001), `${o.id}.${k} ${o[k]} vs ${v}`);
  assert.equal(doc.staticObstacles.length, 42);
});

test("every assetPath is a manifest key whose scene file exists; map holds no res:// or studio-cache", () => {
  const withAsset = [...doc.structures, ...doc.props].filter(
    (x) => x.assetPath,
  );
  assert.equal(
    doc.structures.filter((s) => s.assetPath).length,
    16,
    "2 gates + 14 lanterns",
  );
  assert.equal(doc.props.length, 2);
  for (const x of withAsset) {
    const e = manifest[x.assetPath];
    assert.ok(e, `no manifest entry for ${x.assetPath}`);
    const p = resolve(ROOT, "game-client", e.scene.replace("res://", ""));
    assert.ok(
      existsSync(p) && statSync(p).size > 0,
      `missing scene ${e.scene}`,
    );
  }
  const text = JSON.stringify(doc);
  assert.ok(
    !text.includes("studio-cache") && !text.includes("res://"),
    "keys only",
  );
});

test("barrel props sit beside the gate: no collision, off the road margin, clear of the tower", () => {
  const barrels = doc.props.filter((p) => p.assetPath === "env:maro-barrel");
  assert.deepEqual(barrels.map((b) => b.id).sort(), [
    "barrel-gate-01",
    "barrel-gate-02",
  ]);
  for (const b of barrels) {
    assert.equal(b.blocksMovement, false);
    assert.ok(Math.abs(b.x) >= 3.5, `${b.id} inside road clear margin`);
    const inTower =
      Math.abs(b.x) < 5.74 + 0.31 &&
      Math.abs(b.x) > 2.0 - 0.31 &&
      b.z > 74.815 - 0.31 &&
      b.z < 77.185 + 0.31;
    assert.ok(!inTower, `${b.id} overlaps the tower`);
  }
});

test("workshop lantern light and label sit on the 3.1 m post (lantern-06)", () => {
  const m = pocSrc.match(
    /Lantern06WorldPos\s*=\s*new\(\s*(-?[\d.]+)f,\s*(-?[\d.]+)f,\s*(-?[\d.]+)f\s*\)/,
  );
  assert.ok(m, "Lantern06WorldPos not found");
  const l6 = byId.get("lantern-06");
  assert.ok(
    near(+m[1], l6.x, 0.01) && near(+m[3], l6.z, 0.01) && +m[2] === 0,
    "x/z match, y 0 (glb floor pivot)",
  );
  const lamp = +pocSrc.match(/WorkshopLanternLampY\s*=\s*([\d.]+)f/)?.[1];
  const label = +pocSrc.match(/WorkshopLanternLabelY\s*=\s*([\d.]+)f/)?.[1];
  assert.ok(lamp >= 2.5 && lamp <= 3.1, `lamp y ${lamp}`);
  assert.ok(label >= 3.3, `label y ${label}`);
  assert.equal(
    (pocSrc.match(/new Vector3\(0f, WorkshopLanternLampY, 0f\)/g) ?? []).length,
    2,
    "light + glow head",
  );
  assert.ok(
    !/AttachLanternLabel\(WorkshopLanternNode,[^;]*\);/.test(
      pocSrc.replace(
        /AttachLanternLabel\(WorkshopLanternNode,[^;]*WorkshopLanternLabelY\);/g,
        "",
      ),
    ),
    "all workshop labels pass the new height",
  );
});
