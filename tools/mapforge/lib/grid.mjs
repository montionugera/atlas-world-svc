// tools/mapforge/lib/grid.mjs — Plan C: the throwaway cell grid.
//
// Structure-of-arrays, one typed array per field, NEVER an array of objects:
// 640,000 cells x 13 fields is 23,680,000 bytes = 22.58 MB resident this way,
// and ~250 MB as objects. Built, consumed and dropped inside one process;
// never committed.
//
// THE NUMBER WAS WRONG UNTIL 2026-08-22. The plan preamble, this header and
// content/world/budgets.json's cellKmWhy all said "9 fields, ~14.7 MB"; the
// four pinned-constraint fields below (landform, fetchKm, depthM, freshKm) were
// added in the same commit and counted in none of them, and grid.test.mjs's
// footprint assertion summed the same nine. 14.7 MB was an ESTIMATE, never a
// budget — the fix is the measurement, not a smaller grid. grid.test.mjs now
// sums every ArrayBuffer view on the object, so a fourteenth field cannot be
// added outside the count.
//
// Index convention: i = cy * w + cx. Cell (cx, cy) covers the km rectangle
// [cx*cellKm, (cx+1)*cellKm) x [cy*cellKm, (cy+1)*cellKm); its CENTRE is
// ((cx + 0.5) * cellKm, (cy + 0.5) * cellKm) and its four CORNERS are exact
// multiples of cellKm — which is why a shared arc vertex is bit-identical in
// both neighbours' rings (spec 7.4).
//
// No transcendentals and no ** operator here either: this file is in
// tests/noise-determinism.test.mjs's source scan alongside noise and seed.

// THE flag set. Three of these — CARBONATE, SAND, VOLCANIC — are SUBSTRATE
// bits, mutually exclusive on any one cell, written once by P2 and read back
// by the cell reader Task 10 writes (P10's `cellView` — NOT YET WRITTEN; the
// SAND -> "clastic" mapping is a convention until it exists). They are here
// because Plan B closes `requires.rock` to exactly "carbonate" | "clastic" |
// "volcanic": without a bit to set, every constrained row degrades into
// `substitutions` with every gate green.
//
// COUNTED against the committed lexicon, 2026-08-22, because this comment and
// the plan's Global Constraints both said "35 of the 170 rows" and both were
// wrong: 45 rows carry a `requires.rock` — carbonate 10, clastic 19,
// volcanic 16. The direction of the claim was right; the number was not.
//
// The `nearFlag` predicate domain is deliberately SMALLER than this set:
// CARBONATE, SAND and VOLCANIC are reachable through `rock`, not through
// `nearFlag`, so a lexicon row can never ask to be "near sandstone".
//
// Every bit must fit `flags`' Uint16Array cell — 0x8000 is the last one
// available, and grid.test.mjs pins that so a tenth-and-then-some flag cannot
// be added silently and truncated away.
export const FLAG = Object.freeze({
  SEA: 1, LAKE: 2, RIVER: 4, DELTA: 8, GLACIER: 16,
  ARC: 32, CARBONATE: 64, SAND: 128, CLIFF: 256, VOLCANIC: 512,
});

// The substrate bits, in the order cellView tests them. Exactly one is set per
// land cell; a cell with none is "clastic" by default.
export const SUBSTRATE_FLAGS = Object.freeze([FLAG.CARBONATE, FLAG.VOLCANIC, FLAG.SAND]);
export const SUBSTRATE_MASK = FLAG.CARBONATE | FLAG.VOLCANIC | FLAG.SAND;

export function makeGrid({ w = 800, h = 800, cellKm = 0.5 } = {}) {
  const n = w * h;
  const owner = new Int16Array(n).fill(-1);   // region index, -1 = unowned
  const flowDir = new Int8Array(n).fill(-1);  // 0..7 neighbour index, -1 = none
  return {
    w, h, cellKm, n,
    elev: new Float32Array(n),
    moist: new Float32Array(n),
    temp: new Float32Array(n),
    flowAcc: new Float32Array(n),
    flowDir,
    owner,
    plate: new Int8Array(n).fill(-1),         // premise/continent index, -1 = ocean
    biome: new Uint8Array(n),                 // index into BIOMES
    flags: new Uint16Array(n),

    // -- the four PINNED-CONSTRAINT fields ---------------------------------
    // These exist because Plan D's G-PIN-SAT measures the fabric under each of
    // the ~40 pinned seed points and compares it against that record's
    // `requires` block — landform, shelter fetch, water depth, fresh water,
    // slope. If they are absent, measureCell reads undefined on every one, all
    // 40 receipts come out zeroed, and G-PIN-SAT either fails all 40 or (worse)
    // passes vacuously. They are ARRAYS ON THE GRID rather than a separate
    // structure so a pass that forgets to fill one leaves a detectable
    // sentinel rather than a silently-absent key — which is also why each is
    // -1 and not 0: on all four, 0 is a MEANINGFUL reading.
    landform: new Int16Array(n).fill(-1),     // dominant lexicon type index, -1 = none  (P10)
    fetchKm: new Float32Array(n).fill(-1),    // open-water fetch of the adjacent sea, -1 = not coastal (P4)
    depthM: new Float32Array(n).fill(-1),     // water depth in metres, -1 = land        (P4)
    freshKm: new Float32Array(n).fill(-1),    // km to the nearest fresh water, -1 = unset (P6)

    // Index -> string lookups, filled by the passes that own the vocabulary.
    // Plan D's measureCell reads grid.biomeName(i) and grid.regionId(i) rather
    // than re-deriving either from an index it would have to keep in sync.
    biomeNames: [],                           // BIOMES, set by P8
    regionIds: [],                            // region record ids by owner index, set by P9
    biomeName(i) { return this.biomeNames[this.biome[i]] ?? null; },
    // RECORDED MUTATION SURVIVOR, measured 2026-08-22, so the next reviewer
    // does not re-derive it: deleting the `< 0` guard leaves the suite green.
    // `regionIds` is a plain array, so `regionIds[-1]` is undefined and the
    // `?? null` tail already answers null for an unowned cell — no fixture can
    // separate the two. The guard stays because it states the sentinel's
    // meaning at the one place it is read, and because it is the branch a
    // future Map-backed regionIds would need. The rule that IS live here is
    // the `?? null` tail: an owner with no row (grid.test.mjs sets owner 4
    // against a one-row table) reds without it.
    regionId(i) { return this.owner[i] < 0 ? null : (this.regionIds[this.owner[i]] ?? null); },
    elevM(i) { return this.elev[i] * 1000; }, // the model's 0..1 elevation in metres
  };
}

// idx is DELIBERATELY UNGUARDED, and the alternative was measured before that
// was decided. `idx({ cx: 800, cy: 10 })` on the 800-wide grid returns 8800,
// which decodes to (0, 11): the east edge wraps onto the west edge one row up,
// silently. Tasks 3-9 walk D8 neighbours, flood-fill, route D8 flow and site
// Poisson discs over all 640,000 cells, and a wrap there is a plausible world,
// not a crash — exactly the class this programme keeps getting bitten by.
//
// It is still not guarded HERE, for a reason that is about shape and not about
// cost (measured: a bounds test inside idx costs ~0.7 ns/call, 13.5 ms over
// 20 M calls, 0.34% of the 4 s generate budget — affordable). A guard that
// returns -1 turns a wrap into an out-of-range typed-array read of `undefined`,
// which is just as silent; a guard that throws turns the arithmetic primitive
// into something that can abort a whole pass at cell 639,999. And callers
// legitimately compute an index for a candidate coordinate before deciding.
// So the guard is a NAMED accessor instead: use `inBounds` before an index you
// are unsure of, and `neighbourIdx` for the D8 walk, which is the operation
// that would actually wrap.
export function idx({ grid, cx, cy }) { return cy * grid.w + cx; }
export function inBounds({ grid, cx, cy }) {
  return cx >= 0 && cx < grid.w && cy >= 0 && cy < grid.h;
}
// The D8 step, with the edge answered rather than wrapped: -1 means "off the
// grid", the same sentinel `flowDir` already uses for "no outlet".
export function neighbourIdx({ grid, i, d }) {
  const [dx, dy] = D8[d];
  const nx = (i % grid.w) + dx, ny = ((i / grid.w) | 0) + dy;
  return inBounds({ grid, cx: nx, cy: ny }) ? ny * grid.w + nx : -1;
}
export function cx({ grid, i }) { return i % grid.w; }
export function cy({ grid, i }) { return (i / grid.w) | 0; }
export function cellCentreKm({ grid, cx: x, cy: y }) {
  return [(x + 0.5) * grid.cellKm, (y + 0.5) * grid.cellKm];
}
export function cellAreaKm2({ grid }) { return grid.cellKm * grid.cellKm; }

// The eight D8 neighbours in a FIXED order. Every tie-break in the pipeline
// resolves to the lowest index in THIS order, which is what makes flow
// direction, Poisson siting and Dijkstra insertion-order independent. Frozen
// two levels deep, for the same reason UNIT_VECTORS is.
export const D8 = Object.freeze([
  Object.freeze([1, 0]), Object.freeze([1, 1]), Object.freeze([0, 1]), Object.freeze([-1, 1]),
  Object.freeze([-1, 0]), Object.freeze([-1, -1]), Object.freeze([0, -1]), Object.freeze([1, -1]),
]);

export const setFlag = ({ grid, i, flag }) => { grid.flags[i] |= flag; };
export const hasFlag = ({ grid, i, flag }) => (grid.flags[i] & flag) !== 0;
export const clearFlag = ({ grid, i, flag }) => { grid.flags[i] &= ~flag; };
