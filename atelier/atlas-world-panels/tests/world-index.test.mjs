// Plan D — Places & Meaning parity gate. Mirrors maps-index.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const index = JSON.parse(readFileSync(join(HERE, "..", "world-index.json"), "utf8"));

test("every continent row points at a resolved file that exists", () => {
  assert.ok(Array.isArray(index.continents) && index.continents.length > 0);
  for (const row of index.continents) {
    assert.match(row.id, /^c[0-9]{2}$/);
    assert.equal(row.resolved, `content/world/resolved/continent-${row.id.slice(1)}.json`);
    assert.ok(existsSync(join(REPO_ROOT, row.resolved)), `${row.resolved} does not exist on disk`);
  }
});

test("every committed resolved file has a row — a continent cannot hide", () => {
  const dir = join(REPO_ROOT, "content/world/resolved");
  const onDisk = readdirSync(dir).filter((f) => /^continent-\d\d\.json$/.test(f)).sort();
  const indexed = index.continents.map((r) => `continent-${r.id.slice(1)}.json`).sort();
  assert.deepEqual(indexed, onDisk);
});

test("each resolved file exposes the seventeen keys in RESOLVED_KEYS order", () => {
  // Byte-for-byte key order, not a set: canonStringify serialises insertion
  // order, so a reordered build changes the committed bytes for no semantic
  // reason and reds G-SLOT-STABLE on a no-op commit.
  const KEYS = [
    "continent", "coastline", "river", "saltmire", "iceEdge", "terrainPatches",
    "zones", "towns", "camps", "roads", "landmarks",
    "dungeons", "instances", "relay", "distances", "seaLane", "sheet",
  ];
  for (const row of index.continents) {
    const doc = JSON.parse(readFileSync(join(REPO_ROOT, row.resolved), "utf8"));
    assert.deepEqual(Object.keys(doc), KEYS, `${row.resolved} key order`);
    assert.ok(Array.isArray(doc.coastline?.points),
      `${row.resolved} has no coastline.points — basin-sheet.mjs dereferences it unconditionally`);
  }
});
