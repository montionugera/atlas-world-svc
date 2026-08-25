#!/usr/bin/env node
// Canon-leg pre-flight (spec §9.4, R9).
//
// The seven `leg` edges pin canon walking distances at +/-8%. A free redraw
// breaks most of them AT ONCE, surfacing as seven simultaneous errors that
// look like a gate bug. This runs BEFORE the generator: it measures the seven
// distances against the ~40 HAND-PLACED pinned coordinates (spec D4:
// hand-place, solver-check) so the pins can be iterated to a solution while
// moving a pin is still free.
//
// Deliberately NOT a solver. The relation layer verifies; it does not
// optimise (D4). The remedy in every message is "move the pin", because the
// alternative — rewriting the seven distances in canon — touches
// docs/worldbuilding/A1-cosmology.md and content/story/canon.md and reopens
// the citation-rot surface for a sixth time.
//
// Usage: node scripts/check_canon_legs.mjs [--content-root <dir>]
// Exit 1 if any leg is outside the tolerance or any endpoint fails to resolve.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function readJson(path, problems) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { problems.push(`canon-legs: ${path} is unreadable: ${e.message}`); return null; }
}

/** Every pinned civil record keyed by id, with its [x, y]. */
function loadPins({ contentRoot, problems }) {
  const dir = join(contentRoot, "world/civil/pinned");
  const pins = new Map();
  if (!existsSync(dir)) return { pins, present: false };
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const doc = readJson(join(dir, f), problems);
    if (!doc) continue;
    if (!Array.isArray(doc.pin?.at) || doc.pin.at.length !== 2) {
      problems.push(`canon-legs: pinned record "${doc.id ?? f}" has no pin.at [x, y]`);
      continue;
    }
    pins.set(doc.id, { at: doc.pin.at, toleranceKm: doc.pin.toleranceKm });
  }
  return { pins, present: true };
}

// Math.hypot is BANNED on this path (Global Constraints, determinism):
// sqrt(dx*dx + dy*dy) is correctly-rounded IEEE-754 on every conforming engine.
const dist = (a, b) => {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
};
const round1 = (v) => Math.round(v * 10) / 10;

export function checkCanonLegs({ contentRoot }) {
  const problems = [];
  const rows = [];
  const legsDoc = readJson(join(contentRoot, "spine/canon-legs.json"), problems);
  const edges = readJson(join(contentRoot, "spine/edges.json"), problems);
  if (!legsDoc || !edges) return { rows, problems, skipped: false };

  const { pins, present } = loadPins({ contentRoot, problems });
  if (!present) return { rows, problems, skipped: true };

  const tol = legsDoc.toleranceFraction;
  const legEdges = edges.filter((e) => e.kind === "leg");
  for (const e of legEdges) {
    const entry = legsDoc.legs[e.id];
    if (!entry) {
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: no entry in content/spine/canon-legs.json — every leg endpoint must be named exactly once, and only there`);
      continue;
    }
    // Adversarial review (Plan E Task 3 Step 11c): a malformed entry must be
    // one diagnosable problem, never a TypeError that skips finish().
    if (!entry.from?.pinned || !entry.to?.pinned) {
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: malformed entry in content/spine/canon-legs.json — each side needs { pinned, feature }`);
      continue;
    }
    if (!entry) {
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: no entry in content/spine/canon-legs.json — every leg endpoint must be named exactly once, and only there`);
      continue;
    }
    const a = pins.get(entry.from.pinned), b = pins.get(entry.to.pinned);
    for (const [side, id, got] of [["from", entry.from.pinned, a], ["to", entry.to.pinned, b]])
      if (!got)
        problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: pinned record "${id}" does not resolve in content/world/civil/pinned/ (${side} endpoint)`);
    if (!a || !b) continue;

    // Erratum E3-T3-01: the plan's Step 4 snippet computed deltaPct and the
    // verdict from the ROUNDED kilometre value, while its own Step 2 test
    // asserts +16.6% for a leg that is really 16.62% off — impossible from
    // 5.8. Both now read the RAW distance; only the DISPLAYED km is rounded.
    const rawKm = dist(a.at, b.at);
    const resolvedKm = round1(rawKm);
    const declared = e.attrs.straightKm;
    const deltaPct = Math.round(((rawKm - declared) / declared) * 1000) / 10;
    const ok = Math.abs(rawKm - declared) / declared <= tol;
    rows.push({ id: e.id, from: entry.from.pinned, to: entry.to.pinned,
                declaredKm: declared, resolvedKm, deltaPct, verdict: ok ? "OK" : "BREAK" });
    if (!ok)
      problems.push(`G-CANON-LEG-PREFLIGHT: ${e.id}: pinned ${entry.from.pinned} → ${entry.to.pinned} is ${resolvedKm} km vs straightKm ${declared} (${deltaPct > 0 ? "+" : ""}${deltaPct}%) — breaks ±${Math.round(tol * 100)}%; move the pin, do not rewrite canon`);
  }
  // Coverage the other way: an entry naming an edge that no longer exists.
  const byId = new Set(legEdges.map((e) => e.id));
  for (const id of Object.keys(legsDoc.legs))
    if (!byId.has(id))
      problems.push(`G-CANON-LEG-PREFLIGHT: canon-legs.json names "${id}", which is not a leg edge in content/spine/edges.json`);
  return { rows, problems, skipped: false };
}

function main() {
  const argv = process.argv.slice(2);
  let contentRoot = join(REPO_ROOT, "content");
  for (let i = 0; i < argv.length; i++)
    if (argv[i] === "--content-root") contentRoot = resolve(argv[++i]);
  const { rows, problems, skipped } = checkCanonLegs({ contentRoot });
  console.log("canon-legs · pre-flight");
  if (skipped) {
    console.log("  canon-legs: no pinned layer yet — skipped (content/world/civil/pinned/ absent)");
    process.exit(0);
  }
  // ALWAYS print the table, pass or fail — the always-exit-0-report discipline
  // scripts/report_season1.mjs established: drift must be visible before it is
  // a failure.
  console.log("  edge                          from            to              declared  resolved   delta  verdict");
  for (const r of rows)
    console.log(`  ${r.id.padEnd(28)}  ${r.from.padEnd(14)}  ${r.to.padEnd(14)}  ${String(r.declaredKm).padStart(8)}  ${String(r.resolvedKm).padStart(8)}  ${String(r.deltaPct).padStart(6)}  ${r.verdict}`);
  if (problems.length) {
    console.error("\n  PROBLEMS:");
    for (const p of problems) console.error(`    ${p}`);
    process.exit(1);
  }
  console.log(`\n  ${rows.length} legs, all inside ±8%`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
