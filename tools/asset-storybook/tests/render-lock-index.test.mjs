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

// This is a SOURCE-level binding, and it says so rather than pretending
// otherwise: the storybook has no DOM harness and no dependencies, so nothing
// here mounts maps.mjs and reads a rendered card. The behavioural half is the
// manual load of the page (Task 10 Step 8).
//
// What matters is that the binding covers the FEATURE and not merely the
// import. The first shape of this test asserted only that the identifier
// RENDER_LOCK_URL appears in maps.mjs — which it does from the import line
// alone, so the whole `locked <hash>` card line could be deleted with both
// storybook suites green. Each assertion below names one thing whose removal
// makes the hash invisible on the card.
test("the Maps tab renders each sheet's locked hash on its card", () => {
  const state = readFileSync(join(HERE, "../js/state.mjs"), "utf8");
  assert.match(state, /RENDER_LOCK_URL\s*=\s*.*render-lock\.json/);

  const maps = readFileSync(join(HERE, "../js/maps.mjs"), "utf8");
  assert.match(
    maps,
    /fetch\(RENDER_LOCK_URL\)/,
    "maps.mjs never fetches the lock — the artifact is unobservable",
  );
  assert.match(
    maps,
    /lock\[sheet\.svg\]/,
    "maps.mjs fetches the lock but never looks a sheet up in it",
  );
  assert.match(
    maps,
    /"locked "/,
    "no `locked <hash>` text is produced for the card",
  );
  assert.match(
    maps,
    /NOT LOCKED/,
    "a sheet with no lock row must say so on the card, not render blank",
  );
  assert.match(
    maps,
    /meta\.appendChild\(hashP\)/,
    "the hash line is built but never attached to the card",
  );
});
