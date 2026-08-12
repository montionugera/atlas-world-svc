import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawBasinSheet } from "../lib/basin-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const doc = JSON.parse(
  readFileSync(join(ROOT, "content/maps/cluster1-geography.json"), "utf8"),
);

test("drawBasinSheet matches the baseline fixture", () => {
  const { svg, problems } = drawBasinSheet({ doc });
  assert.deepEqual(problems, []);
  assert.equal(
    svg,
    readFileSync(join(HERE, "fixtures/basin-baseline.svg"), "utf8"),
  );
});

test("drawBasinSheet flags a town outside its zone", () => {
  const bad = structuredClone(doc);
  bad.towns[0].at = [-999, -999];
  const { problems } = drawBasinSheet({ doc: bad });
  assert.ok(problems.some((p) => p.includes(bad.towns[0].id)));
});
