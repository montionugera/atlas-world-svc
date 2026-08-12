import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCluster1Sheet } from "../render-sheet.mjs";

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
