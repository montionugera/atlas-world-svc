// THE ONE PLACE A TEST LEARNS HOW BIG THE TRUNK IS.
//
// Plan E constraint E-C4 committed `content/spine/trunk-census.json` as the
// authority on the trunk's composition: 1 world + 13 continents + 3 oceans +
// 9 seas + 2 alias-anchor regions + 1 town + 7 runtime nodes = 36, with a
// written reason on every line, plus the post-redraw edge shape.
//
// Before the redraw, ~20 fixtures across scripts/tests/ and
// tools/mapforge/tests/ each carried their own copy of the number — `44`,
// `20 edges`, `58 features`, `133 sibling pairs`. Re-pinning those literals to
// fresher literals is the same defect with a newer number: the NEXT redraw has
// to hunt them all down again. So every count that is DERIVED from the trunk's
// size is read from here, and the census test (`trunk-census.test.mjs`) is
// what keeps this file honest against `content/spine/nodes/`.
//
// What does NOT belong here: gate-output shape (warning counts, report
// wording), byte goldens, and anything a redraw does not mechanically move.
// Those are re-pinned in place, with a note saying why the move is legitimate.
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const CENSUS = JSON.parse(
  readFileSync(join(ROOT, "content/spine/trunk-census.json"), "utf8"),
);

/** Total committed spine node files. */
export const TRUNK_NODES = CENSUS.expected;

/** Nodes per tier, e.g. CENSUS_BY_TIER.continent === 13. */
export const CENSUS_BY_TIER = CENSUS.byTier;

/** Trunk point features: total, per-kind split, and the attrs-key union size. */
export const TRUNK_FEATURES = CENSUS.features.expected;
export const FEATURES_BY_KIND = CENSUS.features.byKind;
export const FEATURE_ATTRS_KEYS = CENSUS.features.attrsKeys;

/** Total committed spine edges, and the per-kind split. */
export const TRUNK_EDGES = CENSUS.edges.expected;
export const EDGES_BY_KIND = CENSUS.edges.byKind;
