import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCluster1Sheet, SHEETS } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

test("spine-driven cluster1 sheet is byte-identical to the mirror-driven baseline", () => {
  const { svg, problems } = buildCluster1Sheet({ repoRoot: ROOT });
  assert.deepEqual(problems, []);
  assert.equal(
    svg,
    readFileSync(join(HERE, "fixtures/basin-baseline.svg"), "utf8"),
  );
});

test("building twice is deterministic", () => {
  assert.equal(
    buildCluster1Sheet({ repoRoot: ROOT }).svg,
    buildCluster1Sheet({ repoRoot: ROOT }).svg,
  );
});

test("SHEETS entries declare title, outSvg, outPng and maxLabelRank", () => {
  for (const [id, sheet] of Object.entries(SHEETS)) {
    assert.equal(typeof sheet.title, "string", `${id}.title`);
    assert.ok(sheet.title.length > 0, `${id}.title is empty`);
    assert.match(sheet.outSvg, /^game-client\/assets\/art\/maps\/.+\.svg$/, `${id}.outSvg`);
    assert.match(sheet.outPng, /^game-client\/assets\/art\/maps\/.+\.png$/, `${id}.outPng`);
    assert.equal(typeof sheet.maxLabelRank, "number", `${id}.maxLabelRank`);
    assert.equal(typeof sheet.build, "function", `${id}.build`);
  }
});
