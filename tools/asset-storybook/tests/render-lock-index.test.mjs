// Plan A Task 10 — the lock's review surface.
//
// "Every produced artifact must be observable in a review surface" (owner
// rule, 2026-08-15). content/world/render-lock.json is an artifact this plan
// produces; the Maps tab is where it becomes visible. This gate is the
// mechanical half — a sheet with no lock row shows a blank hash on its card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHEETS } from "../../mapforge/render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const lock = JSON.parse(
  readFileSync(join(REPO_ROOT, "content/world/render-lock.json"), "utf8"),
);

test("every SHEETS outSvg has a lock row", () => {
  for (const [id, sheet] of Object.entries(SHEETS))
    assert.match(
      lock.artifacts[sheet.outSvg] ?? "",
      /^sha256:[0-9a-f]{64}$/,
      `sheet "${id}" (${sheet.outSvg}) has no row in content/world/render-lock.json`,
    );
});

test("the Maps tab reads the lock URL from state.mjs", () => {
  const state = readFileSync(join(HERE, "../js/state.mjs"), "utf8");
  assert.match(state, /RENDER_LOCK_URL\s*=\s*.*render-lock\.json/);
  const maps = readFileSync(join(HERE, "../js/maps.mjs"), "utf8");
  assert.match(
    maps,
    /RENDER_LOCK_URL/,
    "maps.mjs does not read the lock — the artifact is unobservable",
  );
});
