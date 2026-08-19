import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawBasinSheet } from "../lib/basin-sheet.mjs";
import { loadSpine, buildTree } from "../../../scripts/lib/spine.mjs";
import { resolveWorld } from "../../../scripts/lib/places.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const LOCK = join(ROOT, "content/world/render-lock.json");
const LOCKED_ARTIFACT = "game-client/assets/art/maps/cluster1-world.svg";

// Plan A Task 12: the doc came from content/maps/cluster1-geography.json,
// which no longer exists. The four behavioural tests below are unchanged and
// still mutate this doc — resolveWorld returns a fresh object each call, so
// structuredClone is still the right tool.
const doc = (() => {
  const spine = loadSpine({ contentRoot: join(ROOT, "content") });
  const tree = buildTree({ nodes: spine.nodes, rootIds: spine.roots });
  const { doc: d, problems } = resolveWorld({ spine, tree });
  assert.deepEqual(problems, [], "the real spine must resolve a world");
  return d;
})();

function lockedHash() {
  return JSON.parse(readFileSync(LOCK, "utf8")).artifacts[LOCKED_ARTIFACT];
}

test("drawBasinSheet matches the committed render lock", () => {
  // Was: a byte comparison against fixtures/basin-baseline.svg — 47,020 bytes
  // byte-identical to game-client/assets/art/maps/cluster1-world.svg, one of
  // three consumers of one redundant copy. Now: one line in one lock file.
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  const expected = lockedHash();
  assert.equal(typeof expected, "string",
    `render-lock.json has no row for ${LOCKED_ARTIFACT} — the assertion below would compare against undefined`);
  assert.equal("sha256:" + createHash("sha256").update(svg, "utf8").digest("hex"), expected);
});

test("drawBasinSheet flags a town outside its zone", () => {
  const bad = structuredClone(doc);
  bad.towns[0].at = [-999, -999];
  const { problems } = drawBasinSheet({ doc: bad });
  assert.ok(problems.some((p) => p.includes(bad.towns[0].id)));
});

// F-045 Task 4 regression: basin-sheet.mjs read road.days/daysLabel and
// leg.canonDays — field names Task 1's rescale_spine.mjs renamed to
// hours/hoursLabel/canonHours everywhere else (edges.json, the geography
// mirror). Every access silently evaluated `undefined`: the walking table
// printed the literal string "undefined" for every leg, and the waystation
// + road-lettering loops both `continue`d immediately for every road (zero
// rendered, no error, no red gate — a whole layer of chart content
// vanished). This is a general trap for the whole SVG, not just these two
// call sites, so assert on the string directly rather than re-deriving
// which specific field would go missing next time.
test("rendered SVG never contains the literal string \"undefined\" (days->hours field-rename guard)", () => {
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  assert.ok(!svg.includes("undefined"), 'svg contains "undefined" — a data field the renderer reads is missing');
});

test("walking table prints each leg's real canonHours, not the stale canonDays field", () => {
  const { svg } = drawBasinSheet({ doc });
  for (const leg of doc.distances.legs) assert.ok(svg.includes(leg.canonHours), `missing ${leg.canonHours}`);
});

test("waystations + hour-lettering draw for a road with hours >= 2 (synthetic: real content's roads are all < 2h)", () => {
  const withLongRoad = structuredClone(doc);
  const road = withLongRoad.roads[0];
  road.hours = 3;
  road.hoursLabel = "3 h";
  const { svg, problems } = drawBasinSheet({ doc: withLongRoad });
  assert.deepEqual(problems, []);
  assert.ok(svg.includes("3 h"), "hoursLabel not lettered on the road");
  // 2 interior waystation circles for an hours=3 road (k=1,2), radius 3.4
  const before = drawBasinSheet({ doc }).svg;
  const circlesBefore = (before.match(/r="3\.4"/g) ?? []).length;
  const circlesAfter = (svg.match(/r="3\.4"/g) ?? []).length;
  assert.equal(circlesAfter, circlesBefore + 2);
});
