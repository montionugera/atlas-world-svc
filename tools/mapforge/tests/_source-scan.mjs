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

// ONE PASS, NOT TWO REGEXES — and the reason is a measured hole, not taste.
// The two-regex form ran the BLOCK rule first, so a `/*` appearing inside a
// LINE comment opened a block comment and blanked everything down to the next
// `*/` anywhere in the file. That is not a hypothetical spelling: a header line
// as ordinary as
//
//     // 2. content/world/premises/*.json
//
// blanked the whole of tools/mapforge/generate-world.mjs. Reproduced against
// the ban itself on 2026-08-22: prepending that comment plus
// `export const PROBE = Math.cos(1) + Date.now();` to lib/fabric.mjs left BOTH
// determinism scans at 30 pass / 0 fail. This is the third time the ban's
// COVERAGE has been found holed (seam 1: lib/passes/ never walked; seam 2: a
// maintained file list), and the pattern each time is that the scan reads
// something other than the code.
//
// The scanner also skips STRING and TEMPLATE literals, so a path in a string
// cannot open a comment either.
//
// REGEX LITERALS ARE NOW SKIPPED TOO — the FIFTH hole in this ban, found by the
// seam-6 review and the same shape as the other four (the scan reads something
// other than the code). A regex body containing an escaped slash, `\/`, was
// read as an ordinary backslash followed by a live `/`, so
//
//     .replace(/\/\*[\s\S]*?\*\//g, " ")
//
// opened a block comment at the `/*` inside the pattern and blanked forward to
// the next `*/` in the file. MEASURED before the fix: 5 of the 63 files under
// tools/mapforge/ no longer PARSED after stripping — arcs, glyphs, labels,
// raster and texture-bake .test.mjs. All five are under tests/, which the ban
// excludes, so it was latent rather than live; the previous four holes were
// latent right up until they were not.
//
// Telling a regex `/` from a division `/` is the classic JS lexing ambiguity
// and the heuristic below is a heuristic. THAT IS ACCEPTABLE HERE ONLY BECAUSE
// IT IS VERIFIED: `determinism-inventory.test.mjs`'s "the stripper never eats
// live code" parses every scanned file's stripped output with
// `vm.SourceTextModule`. A file the heuristic gets wrong reds that test with
// the file named, instead of quietly going dark — which converts this whole
// class of hole from "found by a reviewer, once per seam" into "cannot recur".
// A `/` after one of these starts a REGEX, not a division. The trailing-word
// list is what makes `return /re/` and `typeof /re/` lex correctly; without it
// the last significant character is a letter and the `/` reads as division.
const REGEX_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete",
                                "void", "case", "do", "else", "yield", "await"]);

/** Does a `/` at `pos` open a regex literal, given the source before it? */
export function regexStartsAt(src, pos) {
  let j = pos - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;                       // a file may not begin with division
  const prev = src[j];
  if (!/[A-Za-z0-9_$)\]]/.test(prev)) return true;   // ( , = : [ { ; ! & | ? + - * etc.
  if (/[A-Za-z0-9_$]/.test(prev)) {             // an identifier — keyword or value?
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
    return REGEX_KEYWORDS.has(src.slice(k + 1, j + 1));
  }
  return false;                                  // `)` or `]`: an expression, so division
}

export function stripComments(src) {
  const out = new Array(src.length);
  let i = 0;
  const blank = (n) => { for (let k = 0; k < n; k++) out[i + k] = src[i + k] === "\n" ? "\n" : " "; i += n; };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    // A REGEX LITERAL, copied through whole. It must be recognised BEFORE the
    // comment rules, because its body can contain `//` and `/*` (escaped, or
    // inside a character class) and either would open a comment that swallows
    // live code down to the next `*/` or newline.
    if (c === "/" && d !== "/" && d !== "*" && regexStartsAt(src, i)) {
      let j = i + 1, inClass = false, closed = false;
      for (; j < src.length && src[j] !== "\n"; j++) {
        if (src[j] === "\\") { j++; continue; }        // an escape covers the next char
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) { closed = true; break; }
      }
      if (closed) {
        while (j + 1 < src.length && /[dgimsuvy]/.test(src[j + 1])) j++;   // flags
        for (let k = i; k <= j; k++) out[k] = src[k];
        i = j + 1;
        continue;
      }
      // Unterminated on this line: it was a division after all (or broken
      // source). Fall through and treat the `/` as an ordinary character.
    }
    if (c === "/" && d === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      blank(j - i);
      continue;
    }
    if (c === "/" && d === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
      blank(Math.min(src.length, j + 2) - i);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // A `'` or `"` string cannot cross a newline in valid JS, and REGEX
      // LITERALS are full of unpaired quotes — ink.mjs:38's
      // `/^<pattern id="([^"]*)" …/` carries NINE of them. Without the newline
      // bound the scanner ran off the end of that line and read the next
      // twenty lines, JSDoc included, as string content. Backticks may span
      // lines and are allowed to.
      const multiline = c === "`";
      out[i] = c; i++;
      while (i < src.length && src[i] !== c && (multiline || src[i] !== "\n")) {
        if (src[i] === "\\") { out[i] = src[i]; i++; if (i < src.length) { out[i] = src[i]; i++; } continue; }
        out[i] = src[i]; i++;
      }
      if (i < src.length && src[i] === c) { out[i] = c; i++; }
      continue;
    }
    out[i] = c; i++;
  }
  return out.join("");
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
