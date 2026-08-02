// §4.1's render-type resolution is intentionally duplicated in two places —
// scripts/check_asset_manifest.mjs (the drift-gate) and
// tools/asset-storybook/js/renderers.mjs (the storybook) — so the gate and
// the page can never disagree on what a given manifest entry renders as.
// Both files say so in a comment, but until this test existed nothing
// actually checked it: the comment WAS the enforcement mechanism, which
// means a future edit to one copy and not the other would silently drift
// and no test would catch it. This test reads the `primaryPath` +
// `resolveRender` block out of both files and asserts they're identical
// (module-export syntax aside), so a drift fails loudly here instead of
// surfacing later as a gate/storybook disagreement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GATE_FILE = join(ROOT, "scripts/check_asset_manifest.mjs");
const STORYBOOK_FILE = join(ROOT, "tools/asset-storybook/js/renderers.mjs");

// Matches from `function primaryPath(entry) {` through the closing `}` of
// resolveRender, tolerating an optional `export ` prefix on resolveRender
// (the storybook module exports it for main.mjs/sidebar.mjs to import; the
// gate script doesn't export anything). That's the only syntactic
// difference the module split is allowed to introduce — everything else
// inside the block must be byte-identical.
const BLOCK_PATTERN =
  /function primaryPath\(entry\) \{[\s\S]*?\n\}\n\n(?:export )?function resolveRender\(entry, spec\) \{[\s\S]*?\n\}/;

function extractBlock(filePath) {
  const src = readFileSync(filePath, "utf8");
  const match = BLOCK_PATTERN.exec(src);
  assert.ok(
    match,
    `could not find the primaryPath/resolveRender block in ${filePath} — ` +
      "has it been renamed or restructured? Update BLOCK_PATTERN in " +
      "scripts/tests/resolve_render_mirror.test.mjs to match.",
  );
  // Normalize the one allowed difference so the comparison below is a pure
  // logic diff, not a module-syntax diff.
  return match[0].replace("export function resolveRender", "function resolveRender");
}

test("resolveRender mirror: check_asset_manifest.mjs and js/renderers.mjs agree byte-for-byte", () => {
  const gateBlock = extractBlock(GATE_FILE);
  const storybookBlock = extractBlock(STORYBOOK_FILE);

  assert.equal(
    gateBlock,
    storybookBlock,
    "\n\nscripts/check_asset_manifest.mjs and tools/asset-storybook/js/renderers.mjs " +
      "have drifted: their primaryPath/resolveRender render-type resolution logic " +
      "no longer matches byte-for-byte. §4.1 requires these to be mirrored exactly " +
      "so the drift-gate and the storybook can never disagree on what a manifest " +
      "entry renders as. Fix by making one copy match the other — do not just " +
      "update this test.\n",
  );
});
