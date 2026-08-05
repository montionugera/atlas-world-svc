import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBestiarySheet } from "../lib/bestiary-sheet.mjs";

const ROW = {
  id: "mob-bramble-stalker",
  archetype: "skirmisher",
  durability: "mid",
  speed: "high",
  threat: "melee",
  element: "earth",
};
const SHEET = {
  id: "mob-bramble-stalker",
  assetKey: "mob:bramble_stalker",
  stats: { archetype: "skirmisher", durability: "mid", speed: "high", threat: "melee" },
};
const ELEMENTS = { bramble_stalker: "earth" };

function run(sheet, row, elements) {
  const failures = [];
  checkBestiarySheet(sheet, row, elements, (m) => failures.push(m));
  return failures;
}

test("a sheet mirroring its bestiary row passes", () => {
  assert.deepEqual(run(SHEET, ROW, ELEMENTS), []);
});

test("a mismatched enum FAILS and names the field", () => {
  const bad = { ...SHEET, stats: { ...SHEET.stats, durability: "low" } };
  const failures = run(bad, ROW, ELEMENTS);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /durability/);
});

test("every one of the four enums is checked", () => {
  for (const field of ["archetype", "durability", "speed", "threat"]) {
    const bad = { ...SHEET, stats: { ...SHEET.stats, [field]: "definitely-wrong" } };
    const failures = run(bad, ROW, ELEMENTS);
    assert.ok(failures.length >= 1, `${field} was not checked`);
    assert.match(failures[0], new RegExp(field));
  }
});

test("a runtime element that differs from the row FAILS", () => {
  const failures = run(SHEET, ROW, { bramble_stalker: "wind" });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /element/);
});

test("a neutral runtime mob against an elemental row FAILS", () => {
  // Absent from the elements map means neutral — that is the F-031 encoding.
  const failures = run(SHEET, ROW, {});
  assert.equal(failures.length, 1);
  assert.match(failures[0], /element/);
});

test("a neutral row against a neutral runtime mob passes", () => {
  const neutralRow = { ...ROW, element: undefined };
  assert.deepEqual(run(SHEET, neutralRow, {}), []);
});

test("a sheet whose assetKey is not a mob: key skips the element check", () => {
  // NPC and player sheets can legitimately share a bestiary-shaped id space
  // without a MobTypeConfig behind them.
  const npc = { ...SHEET, assetKey: "npc:camp_quartermaster" };
  assert.deepEqual(run(npc, ROW, {}), []);
});

test("a sheet with no stats block FAILS on all four enums rather than throwing", () => {
  const failures = run({ id: "x", assetKey: "mob:x" }, ROW, { x: "earth" });
  assert.equal(failures.length, 4);
});
