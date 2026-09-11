import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorBoundEntrances } from "../lib/passes/dungeons.mjs";

const LEX = new Map([
  ["karst-cenote", { id: "karst-cenote", dungeonCapable: true }],
  ["coastal-drowned-valley", { id: "coastal-drowned-valley", dungeonCapable: false }],
]);
const INST = [
  { id: "lf-1", type: "karst-cenote", handle: "c02/karst/h-0f42", region: "c02/r02" },
  { id: "lf-2", type: "coastal-drowned-valley", handle: "c02/coastal/h-a1b2", region: "c02/r01" },
];

test("a bound entrance anchors onto its handle's instance", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-a", bind: { handle: "c02/karst/h-0f42" } }], lexicon: LEX });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.anchored, [{ dungeon: "dungeon-a", handle: "c02/karst/h-0f42", instanceId: "lf-1" }]);
});

test("anchoring onto a non-capable landform is a generation problem, not a silent pass", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-b", bind: { handle: "c02/coastal/h-a1b2" } }], lexicon: LEX });
  assert.equal(r.anchored.length, 0);
  assert.match(r.problems[0], /^anchorBoundEntrances: dungeon-b handle "c02\/coastal\/h-a1b2" is a "coastal-drowned-valley", which is not dungeonCapable$/);
});

test("a handle with no instance is named, never dropped", () => {
  const r = anchorBoundEntrances({ instances: INST, dungeons: [{ id: "dungeon-c", bind: { handle: "c02/karst/h-dead" } }], lexicon: LEX });
  assert.match(r.problems[0], /handle "c02\/karst\/h-dead" has no instance/);
});

test("anchoring is deterministic in dungeon input order", () => {
  const ds = [
    { id: "dungeon-b", bind: { handle: "c02/karst/h-0f42" } },
    { id: "dungeon-a", bind: { handle: "c02/karst/h-0f42" } },
  ];
  const forward = anchorBoundEntrances({ instances: INST, dungeons: ds, lexicon: LEX });
  const reverse = anchorBoundEntrances({ instances: INST, dungeons: [...ds].reverse(), lexicon: LEX });
  assert.deepEqual(forward.anchored.map((a) => a.dungeon), ["dungeon-a", "dungeon-b"]);
  assert.deepEqual(reverse.anchored, forward.anchored);
});
