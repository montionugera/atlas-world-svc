// F-185 unit contract: 1 game unit = 1 m (docs/unit-contract.md).
// Content is metres (Phase 2): maps and the runtime manifest carry the metres-v1 marker, no map is
// bigger than 1000 m, and no studio *_meters field is still in old 0.1 m units.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAPS = resolve(ROOT, "content/maps");
const MAX_METRES = 1000;

test("no content map is still in old 0.1 m units (width/height <= 1000)", () => {
  const bad = [];
  for (const f of readdirSync(MAPS).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
    const doc = JSON.parse(readFileSync(resolve(MAPS, f), "utf8"));
    for (const k of ["width", "height"]) {
      if (typeof doc[k] === "number" && doc[k] > MAX_METRES) bad.push(`${f}.${k}=${doc[k]}`);
    }
  }
  assert.deepEqual(bad, [], `maps still in old units: ${bad.join(", ")}`);
});

test("every content map and the runtime manifest carry unitContract metres-v1", () => {
  const bad = readdirSync(MAPS)
    .filter((n) => n.endsWith(".json"))
    .filter((n) => JSON.parse(readFileSync(resolve(MAPS, n), "utf8")).unitContract !== "metres-v1");
  assert.deepEqual(bad, []);
});

test("studio nodes hold true metres (dimensions_meters <= 1000, spawn_point_meters <= 1000)", () => {
  const bad = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = resolve(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".json")) {
        const d = JSON.parse(readFileSync(p, "utf8"));
        const dim = d.terrain_tile?.dimensions_meters;
        const sp = d.starter_arrival_binding?.spawn_point_meters;
        if (dim && (dim.width > MAX_METRES || dim.height > MAX_METRES)) bad.push(`${n} dimensions_meters`);
        if (sp && (sp.x > MAX_METRES || sp.y > MAX_METRES)) bad.push(`${n} spawn_point_meters`);
      }
    }
  };
  walk(resolve(ROOT, "content/studio/nodes"));
  assert.deepEqual(bad, []);
});

test("rescale_units_to_metres is idempotent: a re-run has nothing left to change", async () => {
  const { run } = await import("../rescale_units_to_metres.mjs");
  assert.equal(run({ check: true }).changed, 0);
});
