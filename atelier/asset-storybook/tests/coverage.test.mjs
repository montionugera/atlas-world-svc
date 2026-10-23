// W1-C — Asset Key Coverage model. Pins the REAL data path: content/generated/asset-keys.json
// must parse and join cleanly against both manifests. The dead colyseus-server/ path is what
// silently hid the Coverage tab before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assetDeepLink,
  computeCoverage,
  filterCoverageRows,
} from "../js/coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

test("computeCoverage joins keys to entry ids", () => {
  const m = computeCoverage(
    { keys: [{ id: "a", kind: "character" }, { id: "b", kind: "vfx" }, { id: "c" }] },
    ["a"],
  );
  assert.deepEqual(
    [m.total, m.mapped, m.unmapped, m.pct],
    [3, 1, 2, 33],
  );
  assert.equal(m.rows[2].kind, "unknown");
});

test("computeCoverage edge cases: no keys, null input, junk rows", () => {
  assert.deepEqual(computeCoverage(null, null), { rows: [], total: 0, mapped: 0, unmapped: 0, pct: 0 });
  const m = computeCoverage({ keys: [null, {}, { id: "" }, { id: "x", kind: "k" }] }, []);
  assert.equal(m.total, 1);
  assert.equal(m.pct, 0);
});

test("filterCoverageRows by status, kind and text", () => {
  const rows = [
    { id: "mob:a", kind: "character", mapped: true },
    { id: "mob:b", kind: "character", mapped: false },
    { id: "vfx:c", kind: "vfx", mapped: false },
  ];
  assert.equal(filterCoverageRows(rows).length, 3);
  assert.deepEqual(filterCoverageRows(rows, { status: "unmapped" }).map((r) => r.id), ["mob:b", "vfx:c"]);
  assert.deepEqual(filterCoverageRows(rows, { status: "mapped" }).map((r) => r.id), ["mob:a"]);
  assert.deepEqual(filterCoverageRows(rows, { kind: "vfx" }).map((r) => r.id), ["vfx:c"]);
  assert.deepEqual(filterCoverageRows(rows, { text: " MOB:B " }).map((r) => r.id), ["mob:b"]);
  assert.equal(filterCoverageRows(rows, { status: "mapped", kind: "vfx" }).length, 0);
});

test("assetDeepLink targets the assets tab and survives ':' in ids", () => {
  const link = assetDeepLink("mob:bramble_drake");
  assert.equal(link, "#tab=assets&key=mob%3Abramble_drake");
  const p = new URLSearchParams(link.slice(1));
  assert.equal(p.get("tab"), "assets");
  assert.equal(p.get("key"), "mob:bramble_drake");
});

test("real data: asset-keys.json parses and joins against both manifests", () => {
  const keys = readJson("content/generated/asset-keys.json");
  assert.ok(Array.isArray(keys.keys) && keys.keys.length > 0);
  const ids = [
    ...Object.keys(readJson("game-client/assets/manifest.json").entries),
    ...Object.keys(readJson("game-client/assets/catalog-manifest.json").entries),
  ];
  const m = computeCoverage(keys, ids);
  assert.equal(m.total, keys.keys.length);
  assert.equal(m.mapped + m.unmapped, m.total);
  assert.ok(m.rows.every((r) => typeof r.kind === "string" && r.kind));
});
