// tools/mapforge/tests/fixtures/coast-world.mjs
// The synthetic continent 9a and 9b share: a 120x120 km square of gentle land
// with a river down the middle and a sheltered bay on the west side. It is a
// FIXTURE MODULE, not a test file — tests/*.test.mjs is the glob node --test
// expands, and this file deliberately does not match it.
//
// TWO CORRECTIONS TO THE PLAN'S FIXTURE (:4819-4871), each with its evidence:
//
//  1. THE PLAN'S SEA IS A CLIFF, and it vetoes every port. `localSlope` is the
//     largest elevation step to any D8 neighbour, sea included. The plan sets
//     land to ~0.25 and sea to -0.6, so every coastal land cell reads slope
//     0.85 against `VETO.slopeMax` 0.08 — no cell on the coast survives, no
//     cell is port-eligible, and the plan's own first test (1 capital) cannot
//     pass. On the real world the field is continuous across sea level and the
//     slope veto fires on 360 of 25,600 surveyed cells, so this is a fixture
//     artefact, not a rule to weaken. The sea here is a shallow shelf at 0.24.
//  2. THE PLAN'S FIXTURE HAS NO BIOME VOCABULARY, so the {ice, lava} veto
//     could not fire and `grid.biomeName(i)` returns null everywhere.
//     `biomeNames` is set, and `paint()` lets a test put ice or lava on the
//     ground and watch the veto bite.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeGrid, FLAG, idx } from "../../lib/grid.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
export const MANIFEST = JSON.parse(readFileSync(join(ROOT, "content/world/manifest.json"), "utf8"));
export const DERIVED = JSON.parse(readFileSync(join(ROOT, "content/spine/derived.json"), "utf8"));

// The committed `settlements` stream, joined to the record rather than spelled.
export const SETTLEMENT_STREAM = DERIVED["n-atlas"].resolvedSeedStreams.settlements;

export const BIOME_NAMES = ["meadow", "ice", "lava"];
export const SEA_ELEV = 0.24;

export function coastWorld() {
  const grid = makeGrid({ w: 120, h: 120, cellKm: 1 });
  grid.biomeNames = [...BIOME_NAMES];
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
    const i = idx({ grid, cx: x, cy: y });
    const land = x >= 20 && x < 100 && y >= 10 && y < 110;
    const bay = x >= 20 && x < 26 && y >= 50 && y < 60;   // a notch cut into the coast
    if (land && !bay) {
      grid.plate[i] = 0; grid.elev[i] = 0.25 + 0.001 * (x - 20);
      grid.moist[i] = 0.6; grid.temp[i] = 0.5;
      // The river column drains SOUTH into the sea at y = 110, accumulating as
      // it goes, so 9b's trunk-river trace has a real mouth to start from.
      // D8[2] is [0, 1].
      if (x === 60) { grid.flags[i] |= FLAG.RIVER; grid.flowAcc[i] = 100 + y; grid.flowDir[i] = 2; }
    } else {
      grid.plate[i] = -1; grid.elev[i] = SEA_ELEV; grid.flags[i] |= FLAG.SEA;
    }
  }
  return grid;
}

/** Paint a biome index over a rectangle — the {ice, lava} veto's fixture. */
export function paint({ grid, x0, x1, y0, y1, biome }) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
    grid.biome[idx({ grid, cx: x, cy: y })] = biome;
}

export const REGIONS = Array.from({ length: 8 }, (_, n) => ({
  id: `c01/r0${n + 1}`, continent: "c01", survey: n < 5 ? "surveyed" : "reported",
  cells: 800, areaKm2: 800, adjacent: [], levelBand: null, siteCell: 0,
}));

/** A fresh, independent copy — placeSettlements MUTATES regions[].settlements. */
export const regions = () => REGIONS.map((r) => ({ ...r, adjacent: [...r.adjacent] }));

export function ownRegions(grid) {
  let n = 0;
  for (let i = 0; i < grid.n; i++) { if (grid.plate[i] < 0) continue; grid.owner[i] = (n / 800 | 0) % 8; n++; }
  grid.regionIds = REGIONS.map((r) => r.id);
}

export const PREMISES = [{ id: "c01", title: "T", class: "major", palette: ["meadow", "river"],
                    landformKit: ["coastal", "fluvial"], footprint: { centreKm: [60, 60], radiiKm: [60, 60], warpKm: 0 },
                    structures: [], register: "basin-anglic", levelBand: [1, 40] }];

export const M = { ...MANIFEST, landmasses: [{ id: "c01", title: "T", class: "major", netKm2: 8000,
                                        interiorWaterKm2: 0, surveyed: 5, reported: 3 }],
            quotas: { ...MANIFEST.quotas, settlements: { capital: 1, hub: 2, village: 3, total: 6 } } };
