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

/** @typedef {"surveyed"|"reported"} Survey */

/** @returns {Survey} */
export function surveyOf({ node }) {
  if (node?.survey === "reported" || node?.survey === "surveyed") return node.survey;
  return node?.lore?.reported === true ? "reported" : "surveyed";
}

/**
 * Index every fabric region by id, and count regions per fabric FILE PATH
 * (repo-relative), which is what a trunk node's provenance.generator.fabric
 * points at.
 */
export function loadFabricRegionIndex({ contentRoot }) {
  const byRegionId = new Map();
  const countByFabricPath = new Map();
  const problems = [];
  const dir = join(contentRoot, "world/fabric");
  if (!existsSync(dir)) return { byRegionId, countByFabricPath, problems }; // soft-skip
  // existsSync is true when the path exists as a FILE too, and stat cannot see
  // a permission-denied directory — either way readdirSync would throw out of
  // the gate and drop every FAIL recorded before it (world-gates.test.mjs's
  // two unlistable-fabric proofs). Listed-or-problem, never thrown.
  let entries;
  try { entries = readdirSync(dir); }
  catch (e) {
    problems.push(`fabric: content/world/fabric cannot be listed: ${e.message}`);
    return { byRegionId, countByFabricPath, problems };
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
      byRegionId.set(r.id, { continent: doc.continent, survey: r.survey, areaKm2: r.areaKm2 });
    }
  }
  return { byRegionId, countByFabricPath, problems };
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
