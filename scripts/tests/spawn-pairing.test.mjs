import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpawnPairing, LEGACY_UNPAIRED } from "../lib/spawn-pairing.mjs";

function run(authored, runtime) {
  const failures = [];
  checkSpawnPairing(authored, runtime, (m) => failures.push(m));
  return failures;
}

test("a paired area with matching mobType and count passes", () => {
  const authored = [{ id: "thornveil_interior", mobType: "bramble_drake", count: 1 }];
  const runtime = [{ id: "thornveil_interior", mobType: "bramble_drake", count: 1 }];
  assert.deepEqual(run(authored, runtime), []);
});

test("geometry is NOT compared — only id, mobType and count", () => {
  const authored = [{ id: "a", mobType: "m", count: 1, x: 0, y: 0, width: 5, height: 5 }];
  const runtime = [{ id: "a", mobType: "m", count: 1 }];
  assert.deepEqual(run(authored, runtime), []);
});

test("an authored area with no runtime counterpart FAILS", () => {
  const failures = run([{ id: "ghost", mobType: "m", count: 1 }], []);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ghost/);
  assert.match(failures[0], /no runtime counterpart/);
});

test("a mobType mismatch FAILS", () => {
  const failures = run(
    [{ id: "a", mobType: "bramble_drake", count: 1 }],
    [{ id: "a", mobType: "spear_thrower", count: 1 }],
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /mobType/);
});

test("a count mismatch FAILS", () => {
  const failures = run(
    [{ id: "a", mobType: "m", count: 2 }],
    [{ id: "a", mobType: "m", count: 4 }],
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /count/);
});

test("pre-content ids are allow-listed and skipped", () => {
  const authored = [...LEGACY_UNPAIRED].map((id) => ({ id, mobType: "whatever", count: 99 }));
  assert.deepEqual(run(authored, []), []);
});

test("the allowlist is exactly the eight pre-F-031 ids", () => {
  // Pinned deliberately: the allowlist is a record of historical debt owned by
  // I-015, not a place to park new unpaired areas. Growing it should require
  // editing this test on purpose.
  assert.deepEqual([...LEGACY_UNPAIRED].sort(), [
    "boss_area",
    "center_courtyard",
    "east_dunes",
    "icefield_stoneguard",
    "meadow_wilds",
    "north_ice_fields",
    "south_mud_pit",
    "thornveil_skirmishers",
  ]);
});

test("a single area can report BOTH a mobType and a count mismatch", () => {
  const failures = run(
    [{ id: "a", mobType: "x", count: 1 }],
    [{ id: "a", mobType: "y", count: 2 }],
  );
  assert.equal(failures.length, 2);
});
