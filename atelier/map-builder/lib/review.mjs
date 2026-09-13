// atelier/map-builder/lib/review.mjs — Task 13: review payload (draft vs
// current, deltas, dry-run flag, publish-time gates).
//
// Step 1 shape verification (2026-09-13, against this checkout's committed
// world — content/world/fabric/continent-01.json, content/world/manifest.json,
// content/world/budgets.json):
//   - a per-continent fabric file's shape is { continent: "c01", ...,
//     cellKm: 0.5, cellCensus: { land, lake, unowned }, regions: [...12 items],
//     settlements: [...0 items], ... }. There is no committed landKm2 field at
//     this level (content/world/manifest.json's landmasses[].netKm2 is a
//     WORLD-level, budget-derived number and does not agree with the fabric
//     file's own cell census — 6000 vs cellCensus.land*cellKm^2 = 5997.25 on
//     c01 — so landKm2 here is DERIVED from the fabric file itself:
//     Math.round(cellCensus.land * cellKm * cellKm), the same "cells * cellKm^2"
//     shape promote-world/generate-world use for land area everywhere else).
//     `regions`/`settlements` are the counts of those two arrays.
//   - content/world/fabric/world.json carries the CURRENT root's measured
//     seaToLandRatio (currentSeed() already reads this same file for `seed`).
//   - content/world/manifest.json `ratio` is { min, max, target } — repo.ratioBand().
//   - content/world/budgets.json `promotion.gateRulesThatMustBeGreen` keys —
//     repo.promotionGates() already returns Object.keys(...) of exactly this.
//   - a draft out dir's manifest.json carries a top-level `problems: string[]`
//     (generate-world.mjs's `run.problems`, written verbatim) — this is
//     `knownTodos`, the draft's own carried debt; it says nothing about
//     G-NET/G-CANON-LEG, which need a gate run this module does not perform.
//   - the draft sheets dir: generate-world.mjs writes exactly two SVGs,
//     `sheets/fabric.svg` and `sheets/overlay.svg` (generate-world.mjs:1545
//     picks `["fabric", "overlay"].filter((id) => SHEETS[id])`, :1117 writes
//     `sheets/${sheet.id}.svg`). Every other SHEETS id (15 of the 17 in
//     render-sheet.mjs's registry) has no draft artifact — `draftSvg: null` —
//     which is the deviation from spec §11.5 the brief already flags; this
//     comment is the audit trail for it, the spec text is unchanged.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// Only the two ids the generator actually draws for a draft — see the header.
const DRAFT_SHEET_IDS = new Set(["fabric", "overlay"]);

/** `[{ id, landKm2, regions, settlements }]`, one row per committed continent. */
export function continentMetrics({ fabricDir }) {
  const files = readdirSync(fabricDir).filter((f) => /^continent-\d+\.json$/.test(f)).sort();
  return files.map((f) => {
    const doc = readJson(join(fabricDir, f));
    return {
      id: doc.continent,
      landKm2: Math.round(doc.cellCensus.land * doc.cellKm * doc.cellKm),
      regions: doc.regions.length,
      settlements: doc.settlements.length,
    };
  });
}

const zeroRow = { landKm2: 0, regions: 0, settlements: 0 };

export function buildReview({ repo, job, sheets }) {
  // resolve(), not join(): job.outDir is normally repo-relative
  // (build/mapforge/<runId>, per commands.mjs), but resolve() also accepts an
  // ABSOLUTE outDir unchanged — the same convention app.mjs's removeOutDir
  // already relies on — which is what lets a test point outDir at a
  // temp/test-owned directory outside the repo.
  const outDirAbs = resolve(repo.repoRoot, job.outDir);

  const draftContinents = continentMetrics({ fabricDir: join(outDirAbs, "content/world/fabric") });
  const currentContinents = continentMetrics({ fabricDir: join(repo.repoRoot, "content/world/fabric") });
  const currentWorld = readJson(join(repo.repoRoot, "content/world/fabric/world.json"));

  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const draftById = byId(draftContinents);
  const currentById = byId(currentContinents);
  const ids = [...new Set([...draftById.keys(), ...currentById.keys()])].sort();
  const field = (d, c, key) => ({ draft: d[key], current: c[key], delta: d[key] - c[key] });
  const deltas = ids
    .map((id) => {
      const d = draftById.get(id) ?? zeroRow, c = currentById.get(id) ?? zeroRow;
      return { id, landKm2: field(d, c, "landKm2"), regions: field(d, c, "regions"), settlements: field(d, c, "settlements") };
    })
    .sort((a, b) => Math.abs(b.landKm2.delta) - Math.abs(a.landKm2.delta));

  const manifestPath = join(outDirAbs, "manifest.json");
  const knownTodos = existsSync(manifestPath) ? (readJson(manifestPath).problems ?? []) : [];

  const sheetRows = Object.keys(sheets).sort().map((id) => {
    const sheet = sheets[id];
    const draftRel = DRAFT_SHEET_IDS.has(id) ? `sheets/${id}.svg` : null;
    const draftSvg = draftRel && existsSync(join(outDirAbs, draftRel)) ? `/${job.outDir}/${draftRel}` : null;
    return { id, title: sheet.title, draftSvg, currentSvg: `/${sheet.outSvg}` };
  });

  return {
    draft: { seed: job.seed, metrics: job.metrics, continents: draftContinents },
    current: { seed: repo.currentSeed(), ratio: currentWorld.seaToLandRatio, continents: currentContinents },
    deltas,
    band: repo.ratioBand(),
    dryRun: job.dryRun,
    gatesAtPublish: repo.promotionGates(),
    knownTodos,
    sheets: sheetRows,
  };
}
