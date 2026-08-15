// F-044 — Maps tab parity gate.
//
// maps-index.json (committed, sibling to this test's tools/asset-storybook/)
// is the storybook's OWN registry of mapforge sheets. It must never drift
// from tools/mapforge/render-sheet.mjs's SHEETS export — the source of truth
// for which sheets exist and where they're written. This is the
// "every produced artifact must be observable in a review surface" rule
// (owner intent, 2026-08-15) made mechanical: add a third sheet to SHEETS
// without indexing it here, and this suite goes red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORYBOOK_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(STORYBOOK_ROOT, "../..");
const INDEX_PATH = join(STORYBOOK_ROOT, "maps-index.json");

function loadIndex() {
  const raw = readFileSync(INDEX_PATH, "utf8");
  return JSON.parse(raw);
}

test("maps-index.json exists and is well-formed", () => {
  const index = loadIndex();
  assert.ok(Array.isArray(index.sheets), "index.sheets must be an array");
  assert.ok(index.sheets.length > 0, "index.sheets must not be empty");
});

test("every mapforge SHEETS id appears in maps-index.json", () => {
  const index = loadIndex();
  const indexedIds = new Set(index.sheets.map((s) => s.id));
  for (const id of Object.keys(SHEETS)) {
    assert.ok(
      indexedIds.has(id),
      `sheet "${id}" is registered in tools/mapforge/render-sheet.mjs SHEETS ` +
        `but missing from tools/asset-storybook/maps-index.json`,
    );
  }
});

test("every indexed sheet's svg/png paths match SHEETS and exist on disk", () => {
  const index = loadIndex();
  for (const sheet of index.sheets) {
    const registrySheet = SHEETS[sheet.id];
    assert.ok(
      registrySheet,
      `maps-index.json row "${sheet.id}" has no matching SHEETS entry`,
    );
    assert.equal(
      sheet.svg,
      registrySheet.outSvg,
      `maps-index.json "${sheet.id}".svg must match SHEETS[${sheet.id}].outSvg`,
    );
    assert.equal(
      sheet.png,
      registrySheet.outPng,
      `maps-index.json "${sheet.id}".png must match SHEETS[${sheet.id}].outPng`,
    );
    assert.ok(
      existsSync(join(REPO_ROOT, sheet.svg)),
      `${sheet.svg} does not exist on disk`,
    );
    assert.ok(
      existsSync(join(REPO_ROOT, sheet.png)),
      `${sheet.png} does not exist on disk`,
    );
  }
});
