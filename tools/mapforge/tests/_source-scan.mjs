// tools/mapforge/tests/_source-scan.mjs — the ONE comment-stripper the two
// determinism scans share.
//
// NOT a *.test.mjs file, deliberately: `node --test tools/mapforge/tests/*.test.mjs`
// (scripts/integration.sh:110, .github/workflows/ci.yml:135) will not pick it up
// as a suite.
//
// WHY IT EXISTS (seam-1 fix pass, 2026-08-22). Two scans in this directory read
// the same source files and disagreed about comments:
//
//   * determinism-inventory.test.mjs strips them, and its header says why — the
//     lib headers legitimately NAME `Math.hypot` / `Math.cos` in order to
//     disclaim them, and a scan that reads prose as code goes permanently red
//     and gets worked around instead of obeyed;
//   * noise-determinism.test.mjs excluded only a line whose TRIMMED START is
//     `//`. Measured by the review: appending `/* Math.cos is not used here */`
//     or `/** @see Math.hypot */` to lib/noise.mjs reds the suite on a comment,
//     and a legitimate `Math\n  .floor(1.7)` reds it on correct code.
//
// One stripper, one policy. Stripping PRESERVES LINE NUMBERS (a block comment
// becomes the same number of newlines) so a violation still reports `file:line`.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A file's source with comments blanked out, line numbering intact. */
export const codeOfFile = (path) => stripComments(readFileSync(path, "utf8"));

/** 1-based line number of a character offset in `src`. */
export function lineOf(src, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

// ── COVERAGE, DERIVED FROM THE TREE ──────────────────────────────────────────
//
// The seam-2 reviews found this ban holed for the SECOND time in two seams, in
// two more ways, and both holes were the same shape: a MAINTAINED LIST of what
// to scan. Seam 1's hole was `readdirSync` not recursing, so `lib/passes/` —
// every generator pass Plan C adds — was dark to both scans. Seam 2's holes:
//
//   * `endsWith(".mjs")`. There is no root package.json, so a `.js` under lib/
//     is CommonJS — and an .mjs imports it happily. MEASURED by review D: a
//     `lib/helper-probe.js` carrying `Math.cos` AND `Date.now` left both scans
//     green while being reachable from every pass;
//   * noise-determinism.test.mjs's `SCANNED = ["noise.mjs","seed.mjs","grid.mjs"]`,
//     which nobody extended when the three passes landed. MEASURED: the
//     indirect form `const _M = Math; _M.cos(x)` appended to lib/passes/mask.mjs
//     was green, and the IDENTICAL line in lib/noise.mjs was red;
//   * `tools/mapforge/<newdir>/*.mjs` — the top-level scan was deliberately
//     non-recursive to avoid re-walking lib/ and tests/, so a sibling `cli/`
//     (exactly where Task 10's CLI helpers would go) was dark.
//
// Tasks 5-10 add many more files. So the rule below is STRUCTURAL: one
// recursive walk, one extension class, and the two scans derive their file
// lists from it. A new directory or a new extension is covered by DEFAULT, and
// there is no list left for a later task to forget.
const SOURCE_EXT = /\.[mc]?[jt]s$/;   // .js .cjs .mjs .ts .cts .mts — not only .mjs
const SKIP_DIRS = new Set(["node_modules"]);

/** Every source file under `dir`, recursively, path-relative with "/"
 *  separators so a key names the file the way an import does. Sorted, so the
 *  scans are order-independent. */
export function sourceFilesUnder(dir, prefix = "") {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...sourceFilesUnder(join(dir, e.name), `${prefix}${e.name}/`));
    } else if (SOURCE_EXT.test(e.name)) out.push(prefix + e.name);
  }
  return out;
}

/** The extension rule, exported so a test can pin it rather than restate it. */
export const isSourceFile = (name) => SOURCE_EXT.test(name);

// The four lib/ files that carried an imprecise Math call BEFORE this feature's
// base tag. They are frozen by count in determinism-inventory.test.mjs and
// exempted from noise-determinism.test.mjs's stricter whitelist — every OTHER
// file under lib/, present or future, gets the whitelist. Named here, once, so
// the exemption list and the inventory cannot drift apart: the inventory test
// asserts its own keys are exactly this set.
export const LEGACY_IMPRECISE_FILES = Object.freeze([
  "atlas-sheet.mjs", "basin-sheet.mjs", "draft.mjs", "world-gen.mjs",
]);
