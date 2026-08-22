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
import { readFileSync } from "node:fs";

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
