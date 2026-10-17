// F-045 Task 1: TDD coverage for scripts/rescale_spine.mjs, the one-shot
// ÷5 world-rescale transform (I-095). Runs against a disposable copy of a
// small, REAL fixture (content/spine/nodes/{n-atlas,n-cluster1,
// n-millcross-ford,n-millcross,n-embervale,n-rooktide,n-frontier-shelf,
// n-site-thornveil,n-playroot,n-fixture-deflect}.json + the real
// content/spine/edges.json) — never against invented shapes, so a
// transform bug that only shows up on real coordinate ranges (e.g.
// decimals, negative offsets, null roadKm) still gets caught here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runRescale, transformEdge, transformGeographyNode, r1, roundHalf, SCALE, KM_PER_HOUR,
  GEOGRAPHY_TIERS, FOOTPRINT_TIERS,
} from "../rescale_spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE = join(ROOT, "scripts/tests/fixtures/spine/rescale-basic/spine");

function contentRoot() {
  const dir = mkdtempSync(join(tmpdir(), "rescale-spine-"));
  cpSync(FIXTURE, join(dir, "spine"), { recursive: true });
  return dir;
}

function readNode(root, id) {
  return JSON.parse(readFileSync(join(root, "spine/nodes", `${id}.json`), "utf8"));
}
function readEdges(root) {
  return JSON.parse(readFileSync(join(root, "spine/edges.json"), "utf8"));
}
function edgeById(edges, id) {
  const e = edges.find((x) => x.id === id);
  assert.ok(e, `fixture missing edge ${id}`);
  return e;
}

// bbox of a placement, in the placement's own units — works for both the
// "rect" and "polygon" shapes present in the committed content.
function bboxOf(placement) {
  if (placement.shape === "rect") return { w: placement.rect.w, h: placement.rect.h };
  const xs = placement.points.map((p) => p[0]), ys = placement.points.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const TOWN_IDS = ["n-millcross", "n-embervale", "n-rooktide"];

// ── (a) AC 1 — town-bbox invariance ────────────────────────────────────
test("AC1: every town-tier node's placement bbox w/h is unchanged (within 0.1) after rescale", () => {
  const root = contentRoot();
  const before = Object.fromEntries(TOWN_IDS.map((id) => [id, bboxOf(readNode(root, id).placement)]));
  runRescale({ contentRoot: root });
  for (const id of TOWN_IDS) {
    const after = bboxOf(readNode(root, id).placement);
    assert.ok(Math.abs(after.w - before[id].w) <= 0.1, `${id}: width drifted ${before[id].w} -> ${after.w}`);
    assert.ok(Math.abs(after.h - before[id].h) <= 0.1, `${id}: height drifted ${before[id].h} -> ${after.h}`);
  }
  rmSync(root, { recursive: true, force: true });
});

test("AC1 corollary: a town's placement is re-centred on its ×0.2 anchor, not left at the old position", () => {
  const root = contentRoot();
  const before = readNode(root, "n-millcross");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-millcross");
  assert.deepEqual(after.placement.anchor, [r1(before.placement.anchor[0] * SCALE), r1(before.placement.anchor[1] * SCALE)]);
  assert.deepEqual(after.absoluteAnchor, after.placement.anchor);
  // offset from the (old) anchor to the rect's corner is preserved exactly
  const oldOffset = [before.placement.rect.x - before.placement.anchor[0], before.placement.rect.y - before.placement.anchor[1]];
  const newOffset = [after.placement.rect.x - after.placement.anchor[0], after.placement.rect.y - after.placement.anchor[1]];
  assert.ok(Math.abs(newOffset[0] - oldOffset[0]) < 1e-9, "x offset from anchor must be preserved exactly");
  assert.ok(Math.abs(newOffset[1] - oldOffset[1]) < 1e-9, "y offset from anchor must be preserved exactly");
  rmSync(root, { recursive: true, force: true });
});

// ── (b) AC 5 — travel table ─────────────────────────────────────────────
// "the travel table in the spec" (spec §1's own worked list) names exactly
// five committed leg edges: the two war towns, Millcross->Embervale, both
// Gildmark legs, and the Cindervast haul (the one named exception). Two
// other "leg" edges exist in the content (millcross-rooktide,
// millcross-gildmark) that the spec's list does not mention — the
// formula-correctness assertion below still covers them (every edge with a
// roadKm gets a mechanically-correct hours value), but the "<=2h except
// Cindervast" business rule is scoped to the named table only, matching
// the literal AC5 text ("the travel table IN THE SPEC"). See
// task-1-report.md: e-leg-millcross-gildmark computes to 2.5h and is
// flagged there as an open question, not silently swept into either list.
test("AC5: road/leg edges' hours == round-to-nearest-half(new roadKm / 11), for every edge that has a roadKm", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const edges = readEdges(root);
  let checked = 0;
  for (const e of edges) {
    if (!e.attrs || !("hours" in e.attrs) && !("canonHours" in e.attrs)) continue;
    if (typeof e.attrs.roadKm !== "number") continue;
    checked++;
    const expected = roundHalf(e.attrs.roadKm / KM_PER_HOUR);
    if ("hours" in e.attrs) assert.equal(e.attrs.hours, expected, `${e.id}: hours`);
    if ("canonHours" in e.attrs) {
      assert.match(e.attrs.canonHours, /-?\d+(\.\d+)?/, `${e.id}: canonHours should contain a number`);
      const num = Number(e.attrs.canonHours.match(/(\d+(\.\d+)?)/)[1]);
      assert.equal(num, expected, `${e.id}: canonHours number`);
    }
  }
  assert.ok(checked >= 7, `expected to check at least the 7 committed leg-ish edges with roadKm, checked ${checked}`);
  rmSync(root, { recursive: true, force: true });
});

test("AC5: the spec's named travel table is all <= 2h except the Cindervast haul", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const edges = readEdges(root);
  const named = {
    "e-leg-embervale-norhollow": "war towns",
    "e-leg-millcross-embervale": "Millcross -> Embervale",
    "e-leg-embervale-gildmark": "Gildmark leg 1",
    "e-leg-norhollow-gildmark": "Gildmark leg 2",
  };
  for (const [id, label] of Object.entries(named)) {
    const hours = edgeById(edges, id).attrs.hours ?? edgeById(edges, id).attrs.canonHours;
    const num = typeof hours === "number" ? hours : Number(String(hours).match(/(\d+(\.\d+)?)/)[1]);
    assert.ok(num <= 2, `${id} (${label}): expected <=2h, got ${num}`);
  }
  const haul = edgeById(edges, "e-leg-cindervast-rooktide");
  const haulHours = Number(String(haul.attrs.canonHours).match(/(\d+(\.\d+)?)/)[1]);
  assert.ok(haulHours > 2, `e-leg-cindervast-rooktide should be the >2h exception, got ${haulHours}`);
  assert.equal(haulHours, 3.5, "spec §1: longest haul 38 km -> 3.5 h");
  rmSync(root, { recursive: true, force: true });
});

test("AC5: Millcross -> Embervale is exactly 1h at the new scale (spec §1's own worked example)", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const e = edgeById(readEdges(root), "e-leg-millcross-embervale");
  assert.equal(e.attrs.roadKm, 11, "55 km * 0.2 = 11 km");
  assert.equal(e.attrs.canonHours, "~1 h (A1-derived)", "11 km / 11 km/h = 1 h, parenthetical preserved");
  rmSync(root, { recursive: true, force: true });
});

test("AC5: a road edge with roadKm:null gets hours:null, and a purely-qualitative daysLabel survives as hoursLabel", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const e = edgeById(readEdges(root), "e-cindervast-approach");
  assert.equal(e.attrs.roadKm, null);
  assert.equal(e.attrs.hours, null);
  assert.equal(e.attrs.hoursLabel, "not maintained");
  assert.ok(!("days" in e.attrs) && !("daysLabel" in e.attrs), "days/daysLabel must be gone, not just null");
  rmSync(root, { recursive: true, force: true });
});

test("sealane: passageDays -> sailDays, Tallowquay lane locked to 1.5h (spec §2.3)", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const edges = readEdges(root);
  const tallowquay = edgeById(edges, "e-lane-coldreach");
  assert.equal(tallowquay.attrs.passageDays, undefined);
  assert.equal(tallowquay.attrs.sailDays, 1.5);
  const foreign = edgeById(edges, "e-lane-stonemoor-foreign");
  assert.ok(foreign.attrs.sailDays >= 1 && foreign.attrs.sailDays <= 2, "spec §2.3: sail-days 1-2");
  const noPassage = edgeById(edges, "e-sea-lane");
  assert.equal("sailDays" in noPassage.attrs, false, "an edge with no passageDays gets no sailDays either");
  rmSync(root, { recursive: true, force: true });
});

// ── (c) idempotence guard ───────────────────────────────────────────────
test("idempotence: a second run against an already-400 n-atlas exits 2 and touches nothing", () => {
  const root = contentRoot();
  const first = runRescale({ contentRoot: root });
  assert.equal(first.idempotent, false);
  const afterFirst = readNode(root, "n-millcross");
  const second = runRescale({ contentRoot: root });
  assert.equal(second.idempotent, true, "n-atlas is already 400x400 — must refuse, not double-transform");
  assert.deepEqual(readNode(root, "n-millcross"), afterFirst, "a refused run must not write any file");
  rmSync(root, { recursive: true, force: true });
});

test("idempotence guard fires as a CLI exit code 2", async () => {
  const { execFileSync } = await import("node:child_process");
  const root = contentRoot();
  runRescale({ contentRoot: root }); // first pass takes n-atlas to 400x400
  assert.throws(() => {
    execFileSync(process.execPath, [join(ROOT, "scripts/rescale_spine.mjs"), "--content-root", root], { stdio: "pipe" });
  }, (err) => {
    assert.equal(err.status, 2);
    return true;
  });
  rmSync(root, { recursive: true, force: true });
});

// ── (d) determinism ─────────────────────────────────────────────────────
test("determinism: two runs on identical fresh input produce byte-identical output", () => {
  const rootA = contentRoot();
  const rootB = contentRoot();
  runRescale({ contentRoot: rootA });
  runRescale({ contentRoot: rootB });
  for (const file of readdirSync(join(rootA, "spine/nodes")).sort()) {
    assert.equal(
      readFileSync(join(rootA, "spine/nodes", file), "utf8"),
      readFileSync(join(rootB, "spine/nodes", file), "utf8"),
      `spine/nodes/${file} differs between two runs on identical input`,
    );
  }
  assert.equal(readFileSync(join(rootA, "spine/edges.json"), "utf8"), readFileSync(join(rootB, "spine/edges.json"), "utf8"));
  rmSync(rootA, { recursive: true, force: true });
  rmSync(rootB, { recursive: true, force: true });
});

// ── supplementary coverage: the rest of the locked transform rules ──────
test("geography tier: n-atlas placement/interior go to exactly 400x400 (world tier, general rule, no special case)", () => {
  const root = contentRoot();
  runRescale({ contentRoot: root });
  const atlas = readNode(root, "n-atlas");
  assert.deepEqual(atlas.placement.rect, { x: 0, y: 0, w: 400, h: 400 });
  assert.deepEqual(atlas.placement.anchor, [200, 200]);
  assert.deepEqual(atlas.interior.size, [400, 400]);
  assert.deepEqual(atlas.absoluteAnchor, [200, 200]);
  rmSync(root, { recursive: true, force: true });
});

test("geography tier: continent polygon points, absoluteAnchor, and interior all scale by exactly 0.2", () => {
  const root = contentRoot();
  const before = readNode(root, "n-cluster1");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-cluster1");
  assert.deepEqual(after.absoluteAnchor, [r1(before.absoluteAnchor[0] * SCALE), r1(before.absoluteAnchor[1] * SCALE)]);
  assert.equal(after.placement.points.length, before.placement.points.length);
  for (let i = 0; i < before.placement.points.length; i++) {
    assert.deepEqual(after.placement.points[i], [r1(before.placement.points[i][0] * SCALE), r1(before.placement.points[i][1] * SCALE)]);
  }
  assert.deepEqual(after.interior.size, [r1(before.interior.size[0] * SCALE), r1(before.interior.size[1] * SCALE)]);
  rmSync(root, { recursive: true, force: true });
});

test("geography tier: feature at/points and attrs.labelAt/tidalLimit.at/ford.at all scale by 0.2", () => {
  const root = contentRoot();
  const before = readNode(root, "n-cluster1");
  const beforeFord = before.features.find((f) => f.id === "f-the-meltwash");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-cluster1");
  const afterFord = after.features.find((f) => f.id === "f-the-meltwash");
  assert.deepEqual(afterFord.attrs.labelAt, [r1(beforeFord.attrs.labelAt[0] * SCALE), r1(beforeFord.attrs.labelAt[1] * SCALE)]);
  assert.deepEqual(afterFord.attrs.tidalLimit.at, [r1(beforeFord.attrs.tidalLimit.at[0] * SCALE), r1(beforeFord.attrs.tidalLimit.at[1] * SCALE)]);
  assert.deepEqual(afterFord.attrs.ford.at, [r1(beforeFord.attrs.ford.at[0] * SCALE), r1(beforeFord.attrs.ford.at[1] * SCALE)]);
  // an off-sheet point feature still scales like any other point
  const beforeFar = before.features.find((f) => f.id === "f-trade-wind-far");
  const afterFar = after.features.find((f) => f.id === "f-trade-wind-far");
  assert.deepEqual(afterFar.at, [r1(beforeFar.at[0] * SCALE), r1(beforeFar.at[1] * SCALE)]);
  rmSync(root, { recursive: true, force: true });
});

test("geography tier: region lore.labelAt scales by 0.2", () => {
  const root = contentRoot();
  const before = readNode(root, "n-millcross-ford");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-millcross-ford");
  assert.deepEqual(after.lore.labelAt, [r1(before.lore.labelAt[0] * SCALE), r1(before.lore.labelAt[1] * SCALE)]);
  rmSync(root, { recursive: true, force: true });
});

test("site tier: a playspace child is left completely untouched (F-045 Task 2: playroot subtree reverted — u-world runtime mirror must not move)", () => {
  const root = contentRoot();
  const before = readNode(root, "n-site-thornveil");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-site-thornveil");
  assert.deepEqual(after, before);
  rmSync(root, { recursive: true, force: true });
});

test("town tier: interior and runtime are left byte-identical (plan-derived; check_spine_emit re-derives interior)", () => {
  const root = contentRoot();
  const before = readNode(root, "n-millcross");
  runRescale({ contentRoot: root });
  const after = readNode(root, "n-millcross");
  assert.deepEqual(after.interior, before.interior);
  assert.deepEqual(after.runtime, before.runtime);
  rmSync(root, { recursive: true, force: true });
});

test("the whole playroot subtree (playroot, playspace, fixture) is left completely untouched (F-045 Task 2: reverted after Task 1 scaled it by mistake)", () => {
  const root = contentRoot();
  const beforeRoot = readNode(root, "n-playroot");
  const beforeShelf = readNode(root, "n-frontier-shelf");
  const beforeFixture = readNode(root, "n-fixture-deflect");
  runRescale({ contentRoot: root });
  assert.deepEqual(readNode(root, "n-playroot"), beforeRoot);
  assert.deepEqual(readNode(root, "n-frontier-shelf"), beforeShelf);
  assert.deepEqual(readNode(root, "n-fixture-deflect"), beforeFixture);
  rmSync(root, { recursive: true, force: true });
});

test("tier partition sanity: playroot, playspace, site, and fixture are all in neither transformed set (F-045 Task 2: the entire runtime u-world subtree is excluded — see rescale_spine.mjs header)", () => {
  assert.equal(GEOGRAPHY_TIERS.has("fixture"), false);
  assert.equal(GEOGRAPHY_TIERS.has("playroot"), false);
  assert.equal(GEOGRAPHY_TIERS.has("playspace"), false);
  assert.equal(FOOTPRINT_TIERS.has("fixture"), false);
  assert.equal(FOOTPRINT_TIERS.has("site"), false);
  for (const t of ["world", "continent", "ocean", "region", "sea"]) assert.ok(GEOGRAPHY_TIERS.has(t));
  assert.ok(FOOTPRINT_TIERS.has("town"));
});

// ── unit coverage for the edge-transform helper directly ────────────────
test("transformEdge: road points scale, roadKm/hours derive correctly, throughRoute stays in sync", () => {
  const e = {
    id: "e-x", kind: "road", points: [[10, 20], [30, 40]],
    attrs: { days: 3, daysLabel: "3 d to Gildmark", roadKm: 43, throughRoute: { to: "gildmark", roadKm: 95, days: 3 } },
  };
  transformEdge(e);
  assert.deepEqual(e.points, [[2, 4], [6, 8]]);
  assert.equal(e.attrs.roadKm, 8.6);
  assert.equal(e.attrs.hours, 1); // roundHalf(8.6/11) = roundHalf(0.7818..) = 1
  assert.equal("days" in e.attrs, false);
  assert.equal("daysLabel" in e.attrs, false);
  assert.equal(e.attrs.throughRoute.roadKm, 19);
  assert.equal(e.attrs.throughRoute.hours, 1.5); // roundHalf(19/11) = roundHalf(1.727..) = 1.5
  assert.equal("days" in e.attrs.throughRoute, false);
});

test("transformEdge: relay/sealane-without-passageDays edges are left with no spurious fields", () => {
  const relay = { id: "e-r", kind: "relay", via: [{ feature: "f-tower-02" }], attrs: { note: "x" } };
  transformEdge(relay);
  assert.deepEqual(relay.attrs, { note: "x" });
});

// F-045 Task 4 regression: transformGeographyNode originally walked
// placement/interior/features/lore.labelAt but never `bands[].fromKm/toKm`
// (region gradient segments, e.g. n-ashvale-front's 3 grave-row bands).
// Caught live: content/spine/nodes/n-ashvale-front.json shipped from Task 1
// with its `placement.points` correctly ÷5'd but `bands` still at the OLD
// scale, putting grave-row segments outside the region's own (rescaled)
// polygon — basin-sheet.mjs's clip-path silently hid the whole layer, no
// error, no red gate. Hand-patched on the one affected node; this test
// covers the transform itself so a future full re-run (or a new bands-
// bearing region) can't regress the same way silently again.
test("geography tier: bands[].fromKm/toKm scale by 0.2 (r1-rounded), non-numeric bands untouched", () => {
  const node = {
    id: "n-x", tier: "region",
    bands: [
      { id: "b-1", axis: "y", fromKm: 78, toKm: 96 },
      { id: "b-2", axis: "y", fromKm: 60.3, toKm: 78 },
    ],
  };
  transformGeographyNode(node);
  assert.deepEqual(node.bands, [
    { id: "b-1", axis: "y", fromKm: 15.6, toKm: 19.2 },
    { id: "b-2", axis: "y", fromKm: 12.1, toKm: 15.6 },
  ]);
});

test("geography tier: a node with no bands field is untouched (defensive no-op)", () => {
  const node = { id: "n-y", tier: "region", placement: { anchor: [1, 1] } };
  transformGeographyNode(node);
  assert.equal("bands" in node, false);
});
