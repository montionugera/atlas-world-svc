// F-051 / plan E Task 2 — the one place "surveyed" vs "reported" is decided.
//
// Before this file the distinction lived in free-form `lore.reported === true`
// on 15 nodes. Scaling a lore convention to 160 regions is exactly how a
// region ceases to exist with every gate green (spec R3). `survey` is now a
// schema-validated field; the lore fallback survives ONLY until the redraw
// replaces every node wholesale, which is why this commit changes zero
// committed bytes.
//
// Never throws — problems are returned, matching the gate contract.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @typedef {"surveyed"|"reported"|"unknown"} Survey */

/**
 * THE DEFAULT IS "unknown", NOT "surveyed" (review of bc393a4, 2026-08-28).
 *
 * It used to be "surveyed", and that is the root of the over-voiced survey
 * prose this review corrected: the two review surfaces published "the nine
 * SURVEYED landmasses" as vouched ground when **no trunk node carries a
 * `survey` field at all** — measured, 0 of 36. "Surveyed" was the answer this
 * function invented for the absence of an answer, and prose read it back as
 * data. A default that silently upgrades missing data to vouched ground is the
 * same class of defect as a chart drawing 12 landmasses as "reported" off 4
 * flags: absence of evidence published as evidence.
 *
 * WHAT IS AND IS NOT LOST. For a GENERATED continent, absence of
 * `lore.reported` is a real derivation, not an absence: generate-world writes
 * `reported: true` iff the landmass's fabric declares ZERO surveyed regions
 * (`manifest.landmasses[].surveyed`), and the fabric carries 40 surveyed
 * regions of 160 spread across the nine unflagged landmasses (1 on Ashen Spar
 * and Brightfall, up to 10 on Wealdmarch). That knowledge lives in the fabric
 * and the manifest, where it is measurable — it never lived here. What this
 * function sees is one boolean, and one boolean cannot distinguish "walked"
 * from "nobody has said". The other 23 committed nodes — every ocean, sea,
 * town, site and fixture — carry no survey evidence of any kind, and used to
 * be answered "surveyed" all the same.
 *
 * NO GATE FLIPS, and this was checked rather than assumed. Every production
 * reader compares against "reported" and only "reported":
 *   tools/mapforge/lib/atlas-sheet.mjs  patternFor      === "reported"
 *   tools/mapforge/lib/atlas-sheet.mjs  coast-reported  === "reported"
 *   scripts/lib/spine.mjs               G-SPINE-COMPLETE childless downgrade
 *                                                       === "reported"
 * so "unknown" travels the identical branch "surveyed" did — the chart is
 * byte-identical and no gate changes verdict. (The `surveyOf` names in
 * tools/mapforge/lib/passes/landforms.mjs and its tests are LOCAL Maps over
 * fabric `regions[].survey`, a different vocabulary that is never routed
 * through this function.) The change buys a future reader the ability to be
 * correct: `=== "surveyed"` now means walked, and no longer silently answers
 * true for every node nobody has surveyed.
 *
 * @returns {Survey}
 */
export function surveyOf({ node }) {
  if (node?.survey === "reported" || node?.survey === "surveyed") return node.survey;
  if (node?.lore?.reported === true) return "reported";
  return "unknown";
}

/**
 * Index every fabric region by id, and count regions per fabric FILE PATH
 * (repo-relative), which is what a trunk node's provenance.generator.fabric
 * points at.
 *
 * F-051 Task 8 Step 2 addition: each `byRegionId` entry now carries the WHOLE
 * region record (spread, not the old 3-field pick) plus `continent`, and a
 * new `roadsById` map is collected in the same pass. Both are additive —
 * every existing reader (`check_content.mjs`, `spine.mjs`,
 * `survey.test.mjs`) only ever read `.survey`/`.areaKm2`/`.continent`, so
 * this changes no existing verdict — and both exist so
 * `scripts/lib/fabric-measure.mjs`'s `measureOverWholeFabric()` can be built
 * on this ONE loader rather than re-walking `content/world/fabric/` a
 * second time.
 */
export function loadFabricRegionIndex({ contentRoot }) {
  const byRegionId = new Map();
  const countByFabricPath = new Map();
  const roadsById = new Map();
  const problems = [];
  const dir = join(contentRoot, "world/fabric");
  if (!existsSync(dir)) return { byRegionId, countByFabricPath, roadsById, problems }; // soft-skip
  // existsSync is true when the path exists as a FILE too, and stat cannot see
  // a permission-denied directory — either way readdirSync would throw out of
  // the gate and drop every FAIL recorded before it (world-gates.test.mjs's
  // two unlistable-fabric proofs). Listed-or-problem, never thrown.
  let entries;
  try { entries = readdirSync(dir); }
  catch (e) {
    problems.push(`fabric: content/world/fabric cannot be listed: ${e.message}`);
    return { byRegionId, countByFabricPath, roadsById, problems };
  }
  for (const file of entries.filter((f) => /^continent-\d+\.json$/.test(f)).sort()) {
    const rel = `content/world/fabric/${file}`;
    let doc;
    try { doc = JSON.parse(readFileSync(join(dir, file), "utf8")); }
    catch (e) { problems.push(`fabric: ${rel} is unreadable: ${e.message}`); continue; }
    if (!Array.isArray(doc?.regions)) {
      problems.push(`fabric: ${rel} is shape-invalid — expected { regions: [...] }`);
      continue;
    }
    countByFabricPath.set(rel, doc.regions.length);
    for (const r of doc.regions) {
      if (byRegionId.has(r.id)) problems.push(`fabric: region "${r.id}" is declared twice`);
      byRegionId.set(r.id, { ...r, continent: doc.continent });
    }
    for (const rd of doc.roads ?? []) {
      if (roadsById.has(rd.id)) problems.push(`fabric: road "${rd.id}" is declared twice`);
      roadsById.set(rd.id, { ...rd, continent: doc.continent });
    }
  }
  return { byRegionId, countByFabricPath, roadsById, problems };
}

/** node id -> number of fabric regions it owns, via provenance.generator.fabric. */
export function fabricRegionCountsFor({ nodes, index }) {
  const counts = new Map();
  // Dead pins ride the same in-band channel as loadFabricRegionIndex's
  // problems; check_content fails index.problems after this runs.
  const problems = index.problems ?? (index.problems = []);
  for (const n of nodes ?? []) {
    const rel = n?.provenance?.generator?.fabric;
    if (!rel) continue;
    // Water trunk nodes (tier "ocean"|"sea") pin content/world/fabric/world.json,
    // the whole-frame polygon file Plan C Task 10 writes and generate-world.test.mjs
    // pins. That file is not a region index, so loadFabricRegionIndex never counts
    // it — a water node has no fabric region to band-check against, which is why
    // its pin is legitimate. Exempting the TIER (not the path) keeps a water node
    // that pins some continent's regions just as silent: there is still no region
    // under it to check.
    if (n?.tier === "ocean" || n?.tier === "sea") {
      counts.set(n.id, 0);
      continue;
    }
    const count = index.countByFabricPath.get(rel);
    if (count === undefined) {
      // Collapsing a stale pin to 0 made it indistinguishable from never
      // having pinned at all ("has no children"). Name the dead path
      // instead; the count still reads 0, so G-SPINE-COMPLETE's own
      // verdict for the node is unchanged. Never throws — gate contract.
      problems.push(`fabric: spine node "${n.id}" pins "${rel}" but no such fabric file was counted — fix provenance.generator.fabric or restore the file`);
      counts.set(n.id, 0);
    } else {
      counts.set(n.id, count);
    }
  }
  return counts;
}
