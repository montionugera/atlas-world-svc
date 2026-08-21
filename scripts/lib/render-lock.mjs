// Plan A Task 10 — the checksum lock (G-RENDER-LOCK).
//
// Replaces G-MAP-DRIFT and absorbs four other byte-for-byte comparison
// points. One gate, one file, ONE CHANGED LINE per changed artifact — instead
// of a 47,020-byte fixture that is a byte-identical duplicate of a file
// already in the repo, read by three tests and rasterised by a fourth.
//
// The honest cost: a checksum says THAT something changed, not WHAT. The
// mitigation ships in the same module — unifiedDiff() — because the two must
// never be separable.
//
// checkLock and unifiedDiff are pure and never throw. computeLock is NOT:
// it reads extraPaths from disk (guarded — a missing path is simply absent
// from the lock) and it calls sheet.build(), which is arbitrary caller code
// and can throw. That throw is deliberately not swallowed — a renderer that
// dies is a loud non-zero exit, whereas catching it here would drop the sheet
// and hand back a quietly shrunken lock, the one outcome a drift gate must
// never produce. Callers that must not throw (a check_content.mjs gate) build
// the sheets themselves and pass `built`.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// The generator version has ONE home: tools/mapforge/lib/version.mjs. This is
// the only scripts/ -> tools/mapforge/ import in the repo (every other edge
// runs the other way, tools/mapforge -> scripts/lib/spine.mjs). It is
// deliberate: the version belongs to the generator, version.mjs imports
// nothing, so no cycle is possible. The re-export keeps every existing
// importer of render-lock.mjs — including scripts/tests/render-lock.test.mjs,
// which imports GENERATOR_VERSION from here — resolving unchanged.
//
// The named `import` alongside the `export … from` is required: computeLock
// reads the constant in its own body, and a re-export alone creates no local
// binding. Bump the constant THERE, not here.
export { GENERATOR_VERSION } from "../../tools/mapforge/lib/version.mjs";
import { GENERATOR_VERSION } from "../../tools/mapforge/lib/version.mjs";

// A sheet's bytes arrive as a JS string (hashed as UTF-8, which is what the
// renderer will write) and an extraPath's arrive as a Buffer (hashed as-is).
// The Buffer path is not cosmetic: reading a file with encoding "utf8" is a
// LOSSY decode — every byte sequence that is not valid UTF-8 collapses to
// U+FFFD, so two PNGs differing at one byte hash IDENTICALLY. Harmless while
// every locked artifact is SVG; a silent hole the moment Task 11 commits PNG
// thumbs. For valid UTF-8 the two paths agree byte for byte, which is why the
// committed lock is unchanged by this.
const sha256 = (data) =>
  "sha256:" + createHash("sha256").update(data).digest("hex");

// `built` is an OPTIONAL map of outSvg -> already-rendered svg text. Callers
// that had to build every sheet anyway — check_render_lock.mjs builds them all
// up front to collect problems — pass it so the renderer runs once per sheet
// per invocation instead of twice. Omitting it keeps the original behaviour.
export function computeLock({
  repoRoot,
  sheets,
  extraPaths = [],
  built = null,
}) {
  const artifacts = {};
  // Sorted so the committed file's key order is a function of the data alone.
  for (const id of Object.keys(sheets).sort()) {
    const sheet = sheets[id];
    if (built && Object.prototype.hasOwnProperty.call(built, sheet.outSvg)) {
      artifacts[sheet.outSvg] = sha256(built[sheet.outSvg]);
      continue;
    }
    const r = sheet.build({ repoRoot });
    // A sheet with build problems has no meaningful bytes to lock. Recording
    // a hash of "" here would make the lock GREEN on a broken renderer, which
    // is the one outcome a drift gate must never produce. The CLI refuses to
    // run at all when any sheet reports problems, so this `continue` can
    // never quietly shrink a committed lock — see check_render_lock.mjs, and
    // the "refuses to run" tests in scripts/tests/render-lock.test.mjs that
    // hold that guard in place.
    if (r.problems.length) continue;
    artifacts[sheet.outSvg] = sha256(r.svg);
  }
  for (const p of [...extraPaths].sort()) {
    let bytes = null;
    try {
      bytes = readFileSync(join(repoRoot, p)); // BYTES, never "utf8" — see sha256
    } catch {
      /* missing = absent from the lock */
    }
    if (bytes !== null) artifacts[p] = sha256(bytes);
  }
  return {
    version: 2,
    generator: { name: "mapforge", version: GENERATOR_VERSION },
    artifacts,
  };
}

// Three different mistakes, reported separately: drift (the artifact changed),
// missing (the lock names something that no longer builds — a deleted sheet
// whose lock row survived), extra (something builds that the lock does not
// name — a new sheet nobody baselined).
export function checkLock({ committed, computed }) {
  const drift = [],
    missing = [],
    extra = [];
  for (const k of Object.keys(committed).sort()) {
    if (!(k in computed)) missing.push(k);
    else if (committed[k] !== computed[k]) drift.push(k);
  }
  for (const k of Object.keys(computed).sort())
    if (!(k in committed)) extra.push(k);
  return { drift, missing, extra };
}

// A deliberately simple diff: trim the common prefix and suffix, then print
// the remaining old lines as `-` and the remaining new lines as `+`. This is
// NOT Myers — it will not find an interior match inside a changed region, and
// it is not supposed to. It exists so a lock mismatch tells a reviewer WHERE
// to look in ~40 lines, and a real investigation uses `git diff`.
export function unifiedDiff({ a, b, maxLines = 40 }) {
  if (a === b) return "";
  const A = a.split("\n"),
    B = b.split("\n");
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (
    tail < A.length - head &&
    tail < B.length - head &&
    A[A.length - 1 - tail] === B[B.length - 1 - tail]
  )
    tail++;
  const aMid = A.slice(head, A.length - tail);
  const bMid = B.slice(head, B.length - tail);
  const out = [`@@ -${head + 1},${aMid.length} +${head + 1},${bMid.length} @@`];
  let budget = maxLines;
  let truncated = false;
  for (const line of aMid) {
    if (budget-- <= 0) {
      truncated = true;
      break;
    }
    out.push(`-${line}`);
  }
  for (const line of bMid) {
    if (budget-- <= 0) {
      truncated = true;
      break;
    }
    out.push(`+${line}`);
  }
  if (truncated)
    out.push(
      `… truncated at ${maxLines} lines (${aMid.length} removed, ${bMid.length} added)`,
    );
  return out.join("\n");
}
