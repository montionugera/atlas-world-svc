// tools/mapforge/lib/passes/biome.mjs — P8: table-lookup biome classification.
//
// The table is evaluated normally, then CLAMPED to the premise palette. That
// clamp is what makes continents CONTRAST instead of gradient (spec §7.3, P1):
// without it, moisture and temperature alone produce one smooth field and
// Stonemoor reads like Coldreach with a different name.
//
// TWO OF THE PLAN'S EIGHTEEN RULES COULD NEVER BE CHOSEN, and both were found
// the way seam 2 found the dead substrate gate — by counting how often each
// rule actually fires on the real 800 x 800 field rather than by reading it.
// Each is corrected below with its measurement at the rule.
import { FLAG } from "../grid.mjs";

// Ordered rules. First match wins; every rule is a pure predicate over the
// four normalised cell fields plus the flag bits.
//
// EVERY ONE OF THESE EIGHTEEN IS THE CHOSEN RULE ON AT LEAST ONE CELL OF THE
// REAL WORLD, and tests/partition.test.mjs asserts exactly that. A rule that
// can never win is not a conservative extra — it is a biome the world can
// never carry, and `ash` was one until this pass was measured.
const RULES = Object.freeze([
  // `FLAG.ARC`, NOT the plan's `FLAG.CLIFF`. Measured on the real field:
  // CLIFF is set by NO pass in the pipeline — grep the whole of
  // tools/mapforge/lib/ and the only occurrence is its own declaration in
  // grid.mjs — so `flags & CLIFF` is 0 on all 640,000 cells and this rule
  // fired zero times. `lava` then reached the map only through the palette[0]
  // fallback at the bottom of this file, which is how 2,265 c10 cells came out
  // lava without any rule ever saying so. ARC is minted by `assignSubstrate`
  // and only there, always together with VOLCANIC, and its own header says it
  // means "volcanic ground" — so it is the live flag this rule was reaching
  // for. The 0.85 threshold is the plan's and is unchanged: it selects the 560
  // highest cells of c10 (14.0% of the arc), which is the strung line of cones
  // c10's premise describes.
  { biome: "lava", when: (c) => (c.flags & FLAG.ARC) !== 0 && c.elev > 0.85 },
  { biome: "ice", when: (c) => (c.flags & FLAG.GLACIER) !== 0 },
  { biome: "lake", when: (c) => (c.flags & FLAG.LAKE) !== 0 },
  { biome: "river", when: (c) => (c.flags & FLAG.RIVER) !== 0 },
  { biome: "marsh", when: (c) => (c.flags & FLAG.DELTA) !== 0 || (c.moist > 0.8 && c.elev < 0.12) },
  // NO TEMPERATURE TERM, and the removal is the c11 ruling rather than a
  // loosening. The plan's rule is `elev < 0.06 && temp > 0.7`. Measured:
  // `temp` is `latitude - lapse` on a 400 km frame, c11 Quillreef's footprint
  // centre is committed at y = 66 km, and its warmest land cell reads 0.183 —
  // so the rule could not fire on the one continent whose title, `coastClass:
  // "atoll-ring"` and `structuralIdea` ("an atoll ring - every settlement a
  // port, no interior") are all about reef, and Quillreef came out 100.0%
  // MEADOW. A coral atoll that can carry no reef is the committed premise
  // losing silently to a generated climate.
  //
  // The remedy is seam 3's ICE remedy in mirror image. Ice was a global
  // temperature threshold that painted three landmasses whose own palettes
  // forbid it; it became premise-gated (FLAG.GLACIER, minted only where a
  // premise asks for it) and the palette clamp finished the job. Reef is the
  // same shape: `reef` appears in exactly four palettes (c06, c08, c11, c13),
  // so THE PALETTE HAS ALREADY DECIDED which continents may carry it, and a
  // second global climate gate inside the rule only lets the two disagree.
  // What is left is the geometry a reef actually is: ground within 0.06 of sea
  // level. Measured effect, whole world: c08 11.0% -> 11.0% and c13 11.1% ->
  // 11.7% (both are southern and already warm, so nothing moves), c06
  // Reedstrand 1.0% -> 13.7%, c11 Quillreef 0.0% -> 11.8%. No continent
  // outside those four can take it at all.
  { biome: "reef", when: (c) => c.elev < 0.06 },
  { biome: "tundra", when: (c) => c.temp < 0.22 },
  { biome: "scree", when: (c) => c.elev > 0.78 },
  { biome: "rock", when: (c) => c.elev > 0.62 },
  { biome: "upland", when: (c) => c.elev > 0.44 },
  { biome: "karst", when: (c) => (c.flags & FLAG.CARBONATE) !== 0 },
  { biome: "desert", when: (c) => c.moist < 0.16 },
  { biome: "badland", when: (c) => c.moist < 0.26 && c.elev > 0.3 },
  { biome: "alkali", when: (c) => c.moist < 0.26 },
  // `FLAG.VOLCANIC`, NOT the plan's `FLAG.SAND`, and the two are opposites
  // here. `SAND` is the CLASTIC default `assignSubstrate` writes on every land
  // cell whose kit is neither karst nor volcanic — 213,210 of the 262,400 land
  // cells carry it. `ash` is in exactly ONE premise palette, c10 Ashen Spar's,
  // and c10 is the one continent whose kit IS volcanic and therefore the one
  // continent that never carries SAND. Measured: the rule as written fired on
  // 26,439 cells and was legal on none of them, so `ash` — a biome Plan B
  // split from `lava` on purpose ("a walkable depositional plain, the
  // Cindervast reading") and the only biome `TERRAIN_IMPLIES.volcanic-arc`
  // names — could not occur anywhere in the world. With VOLCANIC it is c10's
  // ground: 49.8% of the arc, under the cones.
  { biome: "ash", when: (c) => (c.flags & FLAG.VOLCANIC) !== 0 && c.moist < 0.4 },
  { biome: "bramble", when: (c) => c.moist > 0.72 && c.temp > 0.55 },
  { biome: "forest", when: (c) => c.moist > 0.48 },
  { biome: "meadow", when: () => true },
]);

export const BIOME_RULE_NAMES = Object.freeze(RULES.map((r) => r.biome));

/**
 * P8. Writes grid.biome and grid.biomeNames.
 *
 * Returns the histogram the plan declares, plus two censuses the plan does not
 * and the suite cannot do without:
 *
 *  - `ruleWins[r]` — how often RULES[r] was the CHOSEN rule. A rule that never
 *    wins is dead code that looks exactly like a rare biome, which is how both
 *    corrections above stayed invisible. The golden asserts all eighteen win.
 *  - `fallbacks` / `fallbacksByPlate` — how many cells no legal rule matched,
 *    so the palette[0] tail is a MEASURED share and not a silent path. It is
 *    8.80% of land today and 44.4% of c05 alone; a change that pushes it up is
 *    a change in what the world is made of and must be visible.
 *  - `paletteRealisation[k]` — for premise k, which of its palette entries
 *    actually occur on its own plate. THE SAME DEFECT ONE SCOPE UP: `ruleWins`
 *    is a WORLD census, so a rule that fires somewhere passes the dead-rule
 *    assertion while promising a biome a continent never gets. Twenty-one of
 *    the sixty-seven palette entries are in that position today (c02 bramble,
 *    c03 upland/rock/scree, c04 rock/forest/meadow, …) and nothing measured it
 *    — the two the seam happened to notice were written in prose. A premise
 *    palette is committed content; a promise it does not keep must be a
 *    committed NUMBER, not a note.
 *
 *    THE DENOMINATOR IS THE PLATE, NOT THE OWNED LAND. `ocean` and `lake` are
 *    palette entries on six premises and regions tile NET land, so a census
 *    over owned cells alone reports six water promises broken that are in fact
 *    kept — the first count of this taken read 25 dead entries and six of them
 *    were that artefact.
 */
export function classifyBiomes({ grid, premises, BIOMES }) {
  const histogram = new Int32Array(BIOMES.length);
  const ruleWins = new Int32Array(RULES.length);
  const fallbacksByPlate = new Int32Array(premises.length);
  let fallbacks = 0;
  // The index -> name lookup the grid exposes as grid.biomeName(i). Set here,
  // by the pass that owns the vocabulary, so nothing downstream has to keep a
  // parallel copy of BIOMES in sync with the Uint8Array's meaning.
  grid.biomeNames = [...BIOMES];
  const oceanIdx = BIOMES.indexOf("ocean");
  if (oceanIdx < 0) throw new Error("biome: BIOMES has no 'ocean' entry");
  // A rule naming a biome BIOMES does not carry can never be written into the
  // Uint8Array, so it is a vocabulary bug and not a rare terrain. Caught once,
  // here, rather than once per cell.
  for (const r of RULES)
    if (!BIOMES.includes(r.biome))
      throw new Error(`biome: rule "${r.biome}" names a biome BIOMES does not carry`);
  // The clamp, resolved once per premise into a rule-indexed table: entry r is
  // the BIOMES index RULES[r] writes on this plate, or -1 if the palette
  // forbids it. Per cell that turns the clamp into one typed-array read and
  // removes a BIOMES.indexOf from the hot loop — 262,400 cells x up to 18
  // rules is not the place for a linear scan of a 20-row vocabulary.
  const allowed = premises.map((p) => {
    const legal = new Set(p.palette);
    return Int8Array.from(RULES, (r) => (legal.has(r.biome) ? BIOMES.indexOf(r.biome) : -1));
  });
  const paletteIdx = premises.map((p) => {
    const first = BIOMES.indexOf(p.palette[0]);
    if (first < 0)
      throw new Error(`biome: ${p.id} palette[0] "${p.palette[0]}" is not a biome`);
    return first;
  });
  // Per-plate biome sets, for the palette-realisation census below. Filled on
  // the same single pass — a second 640,000-cell walk to count what this one
  // already knows is exactly the waste the clamp table above avoids.
  const seenByPlate = premises.map(() => new Set());
  for (let i = 0; i < grid.n; i++) {
    if ((grid.flags[i] & FLAG.SEA) !== 0) {
      grid.biome[i] = oceanIdx; histogram[oceanIdx]++;
      if (grid.plate[i] >= 0 && grid.plate[i] < premises.length) seenByPlate[grid.plate[i]].add(oceanIdx);
      continue;
    }
    const k = grid.plate[i];
    // A plate index with no premise is a wiring bug — say so here rather than
    // reading `undefined[r]` eight rules later.
    if (k >= premises.length)
      throw new Error(`biome: cell ${i} is on plate ${k} but only ${premises.length} premises were given`);
    const cell = { elev: grid.elev[i], moist: grid.moist[i], temp: grid.temp[i], flags: grid.flags[i] };
    const clamp = k >= 0 ? allowed[k] : null;
    let bi = -1;
    for (let r = 0; r < RULES.length; r++) {
      if (!RULES[r].when(cell)) continue;
      if (clamp !== null) {                                     // THE CLAMP
        if (clamp[r] < 0) continue;
        bi = clamp[r];
      } else {
        bi = BIOMES.indexOf(RULES[r].biome);
      }
      ruleWins[r]++;
      break;
    }
    // A premise whose palette matches no rule falls back to its FIRST palette
    // entry — deterministic, and it can never leave a cell unset.
    if (bi < 0) {
      bi = k >= 0 ? paletteIdx[k] : oceanIdx;
      fallbacks++;
      if (k >= 0) fallbacksByPlate[k]++;
    }
    grid.biome[i] = bi;
    histogram[bi]++;
    if (k >= 0) seenByPlate[k].add(bi);
  }
  const paletteRealisation = premises.map((p, k) => {
    const names = new Set([...seenByPlate[k]].map((b) => BIOMES[b]));
    return {
      continent: p.id,
      promised: p.palette.length,
      realised: p.palette.filter((b) => names.has(b)).length,
      absent: p.palette.filter((b) => !names.has(b)),
    };
  });
  return { histogram, ruleWins, fallbacks, fallbacksByPlate, paletteRealisation };
}

// Region terrainKind: the single kind implied by the region's dominant biome.
// Reported regions get null (spec §6.4 rule 3, already true in the committed
// corpus and codified here).
//
// TOTAL over BIOMES, deliberately — the plan's version was partial with a
// `?? "headland"` tail, which turns a biome added to BIOMES into a silent
// headland instead of a red test. `assignTerrainKinds` throws on a miss and
// partition.test.mjs asserts the map covers all 20 members, so the tail cannot
// come back. `built` and `ocean` are here for totality and are unreachable by
// construction: a region owns land cells only, and `built` is a composition
// biome no rule above produces (landform-type.schema.json says so too).
//
// `fjordland` is the one TERRAIN_KINDS member no biome maps to. It implies
// rock + ice together, which no single dominant biome can express; it is
// reachable only by an authored region, which is Plan D's business.
export const TERRAIN_FOR_BIOMES = Object.freeze({
  ice: "ice", tundra: "tundra-steppe", scree: "rim", rock: "rim", upland: "upland",
  karst: "karst-plateau", desert: "sand-sea", badland: "badlands", alkali: "alkali-flat",
  lava: "lava-field", ash: "volcanic-arc", marsh: "tidal-mire", lake: "lake-country",
  river: "river-country", reef: "reef-shelf", bramble: "bramble", forest: "cloud-forest",
  meadow: "headland", built: "headland", ocean: "headland",
});
