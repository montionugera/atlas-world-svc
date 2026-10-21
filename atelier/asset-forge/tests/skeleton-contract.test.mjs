// F-153: kaykit-core skeleton extension contract (S1-S4). Rigs are built in
// memory and written to a temp dir, so nothing depends on the LFS donor.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Document, NodeIO } from "@gltf-transform/core";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGlb } from "../validate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE = JSON.parse(
  readFileSync(path.join(HERE, "../rig-reference/kaykit-core.bones.json"), "utf8"),
);
const TMP = mkdtempSync(path.join(os.tmpdir(), "skeleton-contract-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
/**
 * Builds a skinned character on the 23-joint core.
 * opts: extras [{name,parent}], drop [joint], reparent {joint: newParent},
 *       wrap (root under a non-joint "Rig" node, default true), weights
 *       ("ok" | "sum-half" | "zero" | "u16" | "u8" | "joints1" | "unskinned")
 */
async function writeRig(opts = {}) {
  const { extras = [], drop = [], reparent = {}, wrap = true, weights = "ok" } = opts;
  const doc = new Document();
  const buffer = doc.createBuffer();
  const nodes = {};
  const parentOf = { ...CORE.parents, ...reparent };
  for (const name of CORE.joints) if (!drop.includes(name)) nodes[name] = doc.createNode(name);
  for (const e of extras) nodes[e.name] = doc.createNode(e.name);
  for (const e of extras) parentOf[e.name] = e.parent;
  const scene = doc.createScene("s");
  const rig = doc.createNode("Rig");
  scene.addChild(wrap ? rig : doc.createNode("Top"));
  const top = scene.listChildren()[0];
  for (const [name, node] of Object.entries(nodes)) {
    const p = parentOf[name];
    if (p && nodes[p]) nodes[p].addChild(node);
    else top.addChild(node);
  }
  const skin = doc.createSkin("skin");
  for (const node of Object.values(nodes)) skin.addJoint(node);

  const pos = doc.createAccessor().setBuffer(buffer).setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const prim = doc.createPrimitive().setAttribute("POSITION", pos);
  const acc = (type, arr, normalized = false) =>
    doc.createAccessor().setBuffer(buffer).setType(type).setArray(arr).setNormalized(normalized);
  const J = new Uint8Array(12);
  let W;
  if (weights === "u16") W = acc("VEC4", new Uint16Array([65535, 0, 0, 0, 32768, 32767, 0, 0, 0, 0, 65535, 0]), true);
  else if (weights === "u8") W = acc("VEC4", new Uint8Array([255, 0, 0, 0, 128, 127, 0, 0, 0, 0, 255, 0]), true);
  else if (weights === "sum-half") W = acc("VEC4", new Float32Array([0.5, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  else if (weights === "zero") W = acc("VEC4", new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]));
  else W = acc("VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  prim.setAttribute("JOINTS_0", acc("VEC4", J)).setAttribute("WEIGHTS_0", W);
  if (weights === "joints1") {
    prim.setAttribute("JOINTS_1", acc("VEC4", new Uint8Array(12)))
      .setAttribute("WEIGHTS_1", acc("VEC4", new Float32Array(12)));
  }
  const meshNode = doc.createNode("body").setMesh(doc.createMesh("m").addPrimitive(prim));
  if (weights !== "unskinned") meshNode.setSkin(skin);
  top.addChild(meshNode);
  const file = path.join(TMP, `rig${counter++}.glb`);
  await new NodeIO().write(file, doc);
  return file;
}

const run = (file, extra = {}) => validateGlb(file, { kind: "chibiPlayer", tier: "bespoke", ...extra });
const ids = (r) => r.failures.map((f) => f.split(":")[0]);
const skelOrWeights = (r) => ids(r).filter((i) => i.startsWith("skeleton") || i === "skin-weights");

// --- pass cases -------------------------------------------------------
for (const [label, extras] of [
  ["hair chain under head", [
    { name: "sec_hair_c0_1", parent: "head" },
    { name: "sec_hair_c0_2", parent: "sec_hair_c0_1" },
  ]],
  ["bag under hips", [{ name: "sec_bag_c0_1", parent: "hips" }]],
  ["prop_weapon_r under handslot.r", [{ name: "prop_weapon_r", parent: "handslot.r" }]],
  ["sleeve under upperarm.l", [{ name: "sec_sleeve_l0_1", parent: "upperarm.l" }]],
]) {
  test(`pass: ${label} (root under non-joint Rig)`, async () => {
    const r = await run(await writeRig({ extras }));
    assert.deepEqual(skelOrWeights(r), [], r.failures.join(" | "));
    assert.ok(!ids(r).includes("structural"), r.failures.join(" | "));
  });
}

test("pass: bare 23-joint core keeps today's exact-match behaviour", async () => {
  const r = await run(await writeRig());
  assert.deepEqual(skelOrWeights(r), []);
});

// --- negative cases ---------------------------------------------------
const many = (n) => {
  const out = [];
  for (const kind of ["hair", "cloth"]) for (const side of ["l", "r", "c"]) for (let c = 0; c < 10; c++) out.push({ name: `sec_${kind}_${side}${c}_1`, parent: "head" });
  return out.slice(0, n);
};
const NEGATIVES = [
  ["missing hips", { drop: ["hips"], extras: [{ name: "sec_hair_c0_1", parent: "head" }] }, "skeleton-core"],
  ["head re-parented under hips", { reparent: { head: "hips" }, extras: [{ name: "sec_hair_c0_1", parent: "head" }] }, "skeleton-core"],
  ["bad prefix hair_1", { extras: [{ name: "hair_1", parent: "head" }] }, "skeleton-grammar"],
  ["depth 4 sec_hair_c0_4", { extras: [{ name: "sec_hair_c0_4", parent: "head" }] }, "skeleton-grammar"],
  ["sec_hair_c0_1 under foot.l", { extras: [{ name: "sec_hair_c0_1", parent: "foot.l" }] }, "skeleton-topology"],
  ["orphan sec_hair_c0_2 under head", { extras: [{ name: "sec_hair_c0_2", parent: "head" }] }, "skeleton-topology"],
  ["sec_hem_l0_1 under upperarm.l (sleeve-only parent)", { extras: [{ name: "sec_hem_l0_1", parent: "upperarm.l" }] }, "skeleton-topology"],
  ["prop_weapon_r under foot.l", { extras: [{ name: "prop_weapon_r", parent: "foot.l" }] }, "skeleton-topology"],
  ["31 extras", { extras: many(31) }, "skeleton-cap"],
];
for (const [label, opts, rule] of NEGATIVES) {
  test(`fail: ${label} -> ${rule}`, async () => {
    const r = await run(await writeRig(opts));
    assert.ok(ids(r).includes(rule), `expected ${rule}, got: ${r.failures.join(" | ")}`);
    assert.ok(!ids(r).includes("skeleton"), "must not fall back to the legacy single skeleton FAIL");
  });
}

test("30 extras is within the cap", async () => {
  const r = await run(await writeRig({ extras: many(30) }));
  assert.ok(!ids(r).includes("skeleton-cap"), r.failures.join(" | "));
});

test("seed tier demotes the new skeleton rules to warnings", async () => {
  const r = await run(await writeRig({ extras: [{ name: "hair_1", parent: "head" }] }), { tier: "seed" });
  assert.ok(!ids(r).includes("skeleton-grammar"));
  assert.match(r.warnings.join(), /skeleton-grammar/);
});

test("joints that do not engage a core reference keep the legacy skeleton FAIL", async () => {
  const r = await run(await writeRig({ drop: ["hips"] }));
  assert.ok(ids(r).includes("skeleton"), r.failures.join(" | "));
  assert.ok(!ids(r).some((i) => i.startsWith("skeleton-")));
});

// --- skin weights (S4) ------------------------------------------------
const WITH_EXTRA = [{ name: "sec_hair_c0_1", parent: "head" }];
test("skin-weights: sum != 1 fails", async () => {
  const r = await run(await writeRig({ extras: WITH_EXTRA, weights: "sum-half" }));
  assert.ok(ids(r).includes("skin-weights"), r.failures.join(" | "));
});
test("skin-weights: all-zero vertex fails", async () => {
  const r = await run(await writeRig({ extras: WITH_EXTRA, weights: "zero" }));
  assert.ok(ids(r).includes("skin-weights"), r.failures.join(" | "));
});
test("skin-weights: normalized UNSIGNED_SHORT / UNSIGNED_BYTE weights decode and pass", async () => {
  for (const weights of ["u16", "u8"]) {
    const r = await run(await writeRig({ extras: WITH_EXTRA, weights }));
    assert.ok(!ids(r).includes("skin-weights"), `${weights}: ${r.failures.join(" | ")}`);
  }
});
test("skin-weights: JOINTS_1 present warns", async () => {
  const r = await run(await writeRig({ extras: WITH_EXTRA, weights: "joints1" }));
  assert.ok(!ids(r).includes("skin-weights"));
  assert.match(r.warnings.join(), /JOINTS_1/);
});
test("skin-weights: unskinned meshes are skipped", async () => {
  const r = await run(await writeRig({ extras: WITH_EXTRA, weights: "unskinned" }));
  assert.ok(!ids(r).includes("skin-weights"));
});
test("skin-weights: not run for a bare core rig (no extras engaged)", async () => {
  const r = await run(await writeRig({ weights: "sum-half" }));
  assert.ok(!ids(r).includes("skin-weights"));
});
