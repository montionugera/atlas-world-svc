// tools/mapforge/lib/world-gen.mjs — F-043 Task 1: pure, deterministic
// world-scale geography generator. Consumed by tools/mapforge/gen-world.mjs
// (Task 2) which writes candidate spine nodes to a gitignored staging dir;
// a worldbuilding panel promotes/renames them (Task 3).
//
// Conventions (pinned, same as scripts/lib/spine.mjs):
//   - one options object per function, no positional overloads;
//   - deterministic everywhere: no Math.random, no Date, no performance.now;
//   - abs() appears nowhere for winding — a negative signed shoelace area is
//     a G-POLY failure, not a magnitude.
import { createHash } from "node:crypto";
import { shoelaceArea, selfIntersects, pointInPolygon } from "../../../scripts/lib/spine.mjs";

// ── core primitives (brief-specified, transcribed verbatim) ────────────────

// mulberry32 — deterministic, seeded from the first 8 hex chars of a stream seed.
export function rng(seedHex) {
  let s = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

export function noiseRing({ center, meanRadius, vertices, roughness, rand }) {
  const pts = [];
  for (let i = 0; i < vertices; i++) {
    const a = (i / vertices) * 2 * Math.PI;
    const r = meanRadius * (1 + roughness * (rand() * 2 - 1));
    pts.push([r1(center[0] + r * Math.cos(a)), r1(center[1] + r * Math.sin(a))]);
  }
  if (shoelaceArea({ points: pts }) < 0) pts.reverse();
  return pts;
}

export function fitArea({ points, center, targetArea }) {
  const k = Math.sqrt(targetArea / shoelaceArea({ points }));
  return points.map(([x, y]) => [r1(center[0] + (x - center[0]) * k), r1(center[1] + (y - center[1]) * k)]);
}

export function splitAtVertices({ points, i, j }) {
  const a = [], b = [];
  for (let k = i; ; k = (k + 1) % points.length) { a.push(points[k]); if (k === j) break; }
  for (let k = j; ; k = (k + 1) % points.length) { b.push(points[k]); if (k === i) break; }
  return [a, b];
}

export function validRing({ points }) {
  const out = [];
  if (!points || points.length < 3) return ["fewer than 3 points"];
  const [fx, fy] = points[0], [lx, ly] = points[points.length - 1];
  if (fx === lx && fy === ly) out.push("closed ring (author OPEN rings)");
  for (let i = 1; i < points.length; i++)
    if (points[i][0] === points[i - 1][0] && points[i][1] === points[i - 1][1]) out.push(`repeated point at ${i}`);
  if (!(shoelaceArea({ points }) > 0)) out.push("non-positive shoelace (winding)");
  if (selfIntersects({ points })) out.push("self-intersects");
  return out;
}

export function mintSeed({ parentStream, name }) {
  return createHash("sha256").update(`${parentStream}:${name}`).digest("hex").slice(0, 16);
}

// ── naming pool (G7-clean Ashen Vigil register — terse noun+noun compounds,
// e.g. "Millcross"/"Gildmark") — panel may override every title in Task 3.
const NAME_A = ["Tarn", "Fell", "Drift", "Cold", "Rook", "Salt", "Stone", "Reed", "Gale", "Harrow", "Weld", "Bright"];
const NAME_B = ["mark", "hollow", "stead", "reach", "tide", "fall", "moor", "strand", "holt", "wick"];

function slugify({ name }) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// Draws a fresh, globally-unique compound name from `nameRand`, skipping any
// candidate already in `used`. Also returns two runner-up candidates (for
// the summary row's nameCandidates) drawn the same deterministic way.
function drawName({ nameRand, used }) {
  const candidates = [];
  while (candidates.length < 3) {
    const a = NAME_A[Math.floor(nameRand() * NAME_A.length)];
    const b = NAME_B[Math.floor(nameRand() * NAME_B.length)];
    const cand = `${a}${b}`;
    if (!used.has(cand) && !candidates.includes(cand)) candidates.push(cand);
  }
  used.add(candidates[0]);
  return candidates;
}

// ── generic axis-aligned "rect minus edge notches" ring builder ───────────
// Walks the rectangle N -> E -> S -> W, detouring inward through any notch
// registered on that side. `notches[side]` is a list of {lo, hi, to}: lo/hi
// are the tangential range (x for N/S, y for E/W); `to` is the new boundary
// coordinate on the perpendicular axis (must move INWARD from the rect
// edge). Winding is corrected after the fact via shoelaceArea, same trick
// noiseRing uses, so callers never have to reason about clockwise/CCW by hand.
function carveRect({ rect, notches = {} }) {
  const { x0, y0, x1, y1 } = rect;
  const pts = [];
  const push = (x, y) => {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y) pts.push([r1(x), r1(y)]);
  };

  // North: y = y0, x increases x0 -> x1.
  push(x0, y0);
  for (const { lo, hi, to } of [...(notches.N ?? [])].sort((a, b) => a.lo - b.lo)) {
    push(lo, y0);
    push(lo, to);
    push(hi, to);
    push(hi, y0);
  }
  push(x1, y0);

  // East: x = x1, y increases y0 -> y1.
  for (const { lo, hi, to } of [...(notches.E ?? [])].sort((a, b) => a.lo - b.lo)) {
    push(x1, lo);
    push(to, lo);
    push(to, hi);
    push(x1, hi);
  }
  push(x1, y1);

  // South: y = y1, x decreases x1 -> x0.
  for (const { lo, hi, to } of [...(notches.S ?? [])].sort((a, b) => b.hi - a.hi)) {
    push(hi, y1);
    push(hi, to);
    push(lo, to);
    push(lo, y1);
  }
  push(x0, y1);

  // West: x = x0, y decreases y1 -> y0.
  for (const { lo, hi, to } of [...(notches.W ?? [])].sort((a, b) => b.hi - a.hi)) {
    push(x0, hi);
    push(to, hi);
    push(to, lo);
    push(x0, lo);
  }
  // Close (open ring — do not repeat the start point).
  const last = pts[pts.length - 1];
  if (last[0] === x0 && last[1] === y0) pts.pop();

  if (shoelaceArea({ points: pts }) < 0) pts.reverse();
  return pts;
}

// ── frame constants (seam-and-bay template, plan.md "World layout decision") ─
// F-045 Task 3 (spec §2.3): every constant in this section is ÷5 from its
// F-043 original so the generator matches the 400x400 frame Tasks 1-2
// already rescaled the committed world tier onto — same seam/bay/cap
// TEMPLATE, five times smaller. Target areas (below, in buildWorld) are ÷25
// (area scales with the square of a linear ÷5). Seed logic is untouched —
// two runs stay byte-identical.
const FRAME = 400;
const MARGIN = 5;
const BASIN_EXCLUSION = { x0: 0, y0: 0, x1: 50, y1: 58 }; // basin + 20 km sea margin
const CAP_X0 = 30;
const CAP_W = 200; // ice cap spans x in [30, 230]
const CAP_X1 = CAP_X0 + CAP_W;

function bboxOf({ points }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function centroidOf({ points }) {
  let sx = 0, sy = 0;
  for (const [x, y] of points) { sx += x; sy += y; }
  return [r1(sx / points.length), r1(sy / points.length)];
}

// Builds the ice cap ring: flat north edge along the frame's top (the one
// exception to the 5 km margin), a noised southern edge, and an exact
// abutment segment [30,0] -> [30,2.8] against the basin's shelf corner
// (n-cluster1's own NE tip is [30,0]). Left un-scaled by fitArea so that
// abutment segment stays byte-exact; the raw depth already averages
// 3200/200 = 16 km, so area lands within the test's 5% tolerance without
// rescaling (F-045 Task 3: both figures ÷5 from F-043's 80000/1000 = 80 km —
// same relative fit, see task-1-report.md deviations for the original).
function buildIceCapRing({ rand }) {
  const southVerts = 16;
  const avgDepth = 3200 / CAP_W; // 16
  const jitterAmp = avgDepth * 0.18;
  const southPts = [];
  for (let i = 0; i <= southVerts; i++) {
    const t = i / southVerts; // 0 at the east corner, 1 back at x=30
    const x = CAP_X1 - t * CAP_W;
    const y = i === southVerts ? 2.8 : Math.max(4, avgDepth + jitterAmp * (rand() * 2 - 1));
    southPts.push([r1(x), r1(y)]);
  }
  return [[CAP_X0, 0], [CAP_X1, 0], ...southPts];
}

// Builds one bay landmass: a noised ring fitted to `targetArea`, retried
// (roughness -0.05, deterministic, max 5 attempts) until it validates.
function buildBayLandmass({ rand, bayCenter, targetArea, vertices, roughness }) {
  let rough = roughness;
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = noiseRing({ center: bayCenter, meanRadius: Math.sqrt(targetArea / Math.PI), vertices, roughness: rough, rand });
    const fitted = fitArea({ points: raw, center: bayCenter, targetArea });
    if (validRing({ points: fitted }).length === 0) return fitted;
    rough = Math.max(0.05, rough - 0.05);
  }
  throw new Error(`buildBayLandmass: failed to produce a valid ring after 5 attempts (center ${bayCenter})`);
}

// Chord-splits `points` at vertex 0 and the vertex nearest `target`, trying
// nearby vertex indices (target, target+1, target-1, target+2, ...) in a
// fixed deterministic order until BOTH resulting rings validate — a chord
// between two arbitrary vertices of a non-convex noised ring can clip
// through another edge (self-intersect) even though the source ring itself
// is valid, so a single fixed index isn't reliable.
function findValidSplit({ points, target }) {
  const n = points.length;
  for (let d = 0; d < n; d++) {
    const candidates = d === 0 ? [target] : [target + d, target - d];
    for (const j of candidates) {
      if (j < 1 || j > n - 1) continue;
      const [a, b] = splitAtVertices({ points, i: 0, j });
      if (validRing({ points: a }).length === 0 && validRing({ points: b }).length === 0) return [a, b];
    }
  }
  throw new Error(`findValidSplit: no valid chord split found near vertex ${target} of ${n}`);
}

// Chord-splits `points` into 2-3 region rings: an initial split near 1/3 of
// the way around by vertex count, then — per the layout decision — whichever
// side's ACTUAL area (via shoelaceArea, not assumed from vertex count)
// exceeds 55% of the whole is split again. If neither side does, the
// 2-part split stands.
function splitIntoRegions({ points }) {
  const totalArea = shoelaceArea({ points });
  const n = points.length;
  const j1 = Math.max(1, Math.round(n / 3));
  const [partA, rest] = findValidSplit({ points, target: j1 });
  const areaA = shoelaceArea({ points: partA }), areaRest = shoelaceArea({ points: rest });
  const big = areaRest >= areaA ? "rest" : "partA";
  const bigArea = big === "rest" ? areaRest : areaA;
  if (bigArea / totalArea <= 0.55) return [partA, rest];
  const target = big === "rest" ? rest : partA;
  const j2 = Math.max(1, Math.round(target.length / 2));
  const [half1, half2] = findValidSplit({ points: target, target: j2 });
  return big === "rest" ? [partA, half1, half2] : [half1, half2, rest];
}

// ── node document assembly ─────────────────────────────────────────────────

function makeNode({ id, tier, parentId, title, seedStream, points, composition, terrainKind, tags, features, loreSummary }) {
  const anchor = centroidOf({ points });
  const bbox = bboxOf({ points });
  const doc = {
    id,
    tier,
    parentId,
    title,
    provenance: { authored: "generated", generator: { name: "gen-world", version: "1" }, source: "tools/mapforge/gen-world.mjs" },
    frozen: false,
    seed: { value: mintSeed({ parentStream: seedStream, name: id }), epoch: 0, why: null },
    placement: { shape: "polygon", points, anchor },
    interior: { units: "km", perParentUnit: 1, size: [r1(bbox.w), r1(bbox.h)], originInParent: [r1(bbox.x), r1(bbox.y)] },
    composition: { ...composition }, // own copy — callers pass shared module-level constants
    interstitial: null,
    interstitialUnsurveyed: false,
    compositionTolerance: null,
    toleranceWhy: null,
    ...(terrainKind ? { terrainKind } : {}),
    features: features ?? [],
    bands: [],
    runtime: { mapIds: [], originU: null, spawnAreas: [], mobSettings: null, seedDemoNPCs: false, collision: "none" },
    representsNodeId: null,
    lore: { reported: true, summary: loreSummary },
    tags: tags ?? [],
    levelBand: null,
  };
  return doc;
}

const MAJOR_COMPOSITION = { rock: 55, upland: 20, forest: 15, meadow: 10 };
const CHAIN_COMPOSITION = { rock: 50, meadow: 30, forest: 20 };
const CAP_COMPOSITION = { ice: 92, rock: 8 };
const OCEAN_COMPOSITION = { ocean: 100 };

// Westernmost point of a ring (min x, ties broken by min y) — used to place
// the port feature on the western major continent.
function westernmostPoint({ points }) {
  return points.reduce((best, p) => (p[0] < best[0] || (p[0] === best[0] && p[1] < best[1]) ? p : best), points[0]);
}

// Places a point feature INSIDE `points` by stepping from `vertex` toward
// `centroid` in fixed, deterministic fractions, verifying containment with
// pointInPolygon at each step (a ring's own centroid isn't guaranteed
// interior for a non-convex shape, and neither is an arbitrary offset from
// a vertex, so this never emits an unverified point — the last fraction
// tried is 1.0, i.e. the centroid itself).
const CENTROID_STEP_FRACTIONS = [0.35, 0.5, 0.65, 0.8, 0.95, 1.0];
function pointTowardCentroid({ vertex, centroid, points }) {
  for (const frac of CENTROID_STEP_FRACTIONS) {
    const at = [r1(vertex[0] + frac * (centroid[0] - vertex[0])), r1(vertex[1] + frac * (centroid[1] - vertex[1]))];
    if (pointInPolygon({ point: at, points })) return at;
  }
  throw new Error(`pointTowardCentroid: no interior point found stepping from ${vertex} toward centroid ${centroid}`);
}

// Plan B Task 4: `derived` moved out of the node file into
// content/spine/derived.json, so the caller passes the streams in. Keeping
// the read inside this function would make a pure library do file I/O.
// `seedStreams` is content/spine/derived.json's ["n-atlas"].resolvedSeedStreams.
// `atlasNode` is retained in the signature (unread today) because it is the
// plan-pinned interface Plan C consumes and the frame this generator draws
// into — dropping it would churn four call sites for no behaviour change.
export function buildWorld({ atlasNode, seedStreams }) {
  const terrain = seedStreams.terrain;
  const rand = rng(terrain);
  const nameRand = rng(seedStreams.names);
  const usedNames = new Set();
  const summary = [];

  // Step 2: seeded seam positions. F-045 Task 3: base + jitter range both ÷5
  // (was 900 + [0,120), 1450 + [0,120)) — same seed logic, smaller frame.
  const seamA = 180 + Math.floor(rand() * 24);
  const seamB = 290 + Math.floor(rand() * 24);

  // Step 3: ice cap.
  const capRaw = buildIceCapRing({ rand });
  const capErrors = validRing({ points: capRaw });
  if (capErrors.length) throw new Error(`buildWorld: ice cap ring invalid: ${capErrors.join(", ")}`);
  const capCands = drawName({ nameRand, used: usedNames });
  const capId = `n-${slugify({ name: capCands[0] })}-cap`;
  const capNode = makeNode({
    id: capId, tier: "continent", parentId: "n-atlas", title: `${capCands[0]} Cap`,
    seedStream: terrain, points: capRaw, composition: CAP_COMPOSITION, terrainKind: "ice", tags: [],
    loreSummary: "A reported ice cap along the world frame's northern edge; unsurveyed in detail.",
  });
  const capBBox = bboxOf({ points: capRaw });
  const capSouthMaxY = capBBox.y + capBBox.h;
  const capClearY = r1(capSouthMaxY + 3); // F-045 Task 3: clearance ÷5 (was 15)
  summary.push({ id: capId, tier: "continent", nameCandidates: capCands, areaKm2: r1(shoelaceArea({ points: capRaw })), composition: CAP_COMPOSITION, regionCount: 0 });

  // Step 4: bays (reserved water rects on the seams) + landmasses inside them.
  // Each bay's y-window is jittered ±8 km (F-045 Task 3: was ±40), seeded
  // from `rand()` in a fixed draw order (majorA, majorB, chainA, chainB,
  // chainC) so bay positions vary with the seed instead of reusing the
  // layout decision's literal example numbers verbatim. The jitter shifts
  // the whole window (preserving its height), then clamps deterministically
  // so it never crosses the 5 km frame margin or comes within 8 km of the
  // ice cap's fitted south edge (`capClearY`, already known at this point).
  // F-045 Task 3: x0/x1/y0/y1 offsets ÷5, targetArea ÷25 (area scales with
  // the square of the linear ÷5) — same bay template, new frame.
  const bayDefs = {
    majorA: { x0: seamA - 34, x1: seamA + 34, y0: 112, y1: 180, targetArea: 880, vertices: 18, kind: "major" },
    majorB: { x0: seamB - 32, x1: seamB + 32, y0: 230, y1: 294, targetArea: 720, vertices: 16, kind: "major" },
    chainA: { x0: seamA - 18, x1: seamA + 18, y0: 260, y1: 304, targetArea: 160, vertices: 14, kind: "chain" },
    chainB: { x0: seamB - 16, x1: seamB + 16, y0: 84, y1: 120, targetArea: 140, vertices: 12, kind: "chain" },
    chainC: { x0: seamA - 16, x1: seamA + 16, y0: 48, y1: 84, targetArea: 120, vertices: 12, kind: "chain" },
  };
  const BAY_ORDER = ["majorA", "majorB", "chainA", "chainB", "chainC"];
  const minBayY = Math.max(MARGIN, capClearY + 8); // F-045 Task 3: clearance ÷5 (was 40)
  const maxBayY = FRAME - MARGIN;
  const bays = {};
  for (const key of BAY_ORDER) {
    const def = bayDefs[key];
    const jitter = Math.floor((rand() * 2 - 1) * 8); // F-045 Task 3: jitter amplitude ÷5 (was 40)
    let y0 = def.y0 + jitter, y1 = def.y1 + jitter;
    if (y0 < minBayY) { const shift = minBayY - y0; y0 += shift; y1 += shift; }
    if (y1 > maxBayY) { const shift = y1 - maxBayY; y0 -= shift; y1 -= shift; }
    bays[key] = { ...def, y0, y1 };
  }

  const majors = [];
  const chains = [];
  const regions = [];
  const edges = [];

  for (const bay of Object.values(bays)) {
    const center = [r1((bay.x0 + bay.x1) / 2), r1((bay.y0 + bay.y1) / 2)];
    const points = buildBayLandmass({ rand, bayCenter: center, targetArea: bay.targetArea, vertices: bay.vertices, roughness: 0.3 });
    const cands = drawName({ nameRand, used: usedNames });
    const isMajor = bay.kind === "major";
    const id = `n-${slugify({ name: cands[0] })}`;
    const node = makeNode({
      id, tier: "continent", parentId: "n-atlas", title: cands[0],
      seedStream: terrain, points, composition: isMajor ? MAJOR_COMPOSITION : CHAIN_COMPOSITION,
      tags: isMajor ? [] : ["archipelago"],
      loreSummary: isMajor
        ? "A reported continent charted from the trade lanes; interior unsurveyed."
        : "A reported archipelago chain; only the main isle is charted, the rest by mariners' report.",
    });
    node.__center = center; // internal, stripped below
    if (isMajor) majors.push(node); else chains.push(node);
    summary.push({ id, tier: "continent", nameCandidates: cands, areaKm2: r1(shoelaceArea({ points })), composition: node.composition, regionCount: 0 });
  }

  // Step 6+7: regions (majors only) + features.
  let portFeature = null;
  let secondPortFeature = null;
  for (let mi = 0; mi < majors.length; mi++) {
    const major = majors[mi];
    const points = major.placement.points;
    const parts = splitIntoRegions({ points });
    for (const part of parts) {
      const partErrors = validRing({ points: part });
      if (partErrors.length) throw new Error(`buildWorld: ${major.id} region split invalid: ${partErrors.join(", ")}`);
    }
    summary.find((s) => s.id === major.id).regionCount = parts.length;
    const coastMid = points[0];
    const centroids = parts.map((p) => centroidOf({ points: p }));
    let interiorIdx = 0, bestD = -1;
    for (let i = 0; i < centroids.length; i++) {
      const d = (centroids[i][0] - coastMid[0]) ** 2 + (centroids[i][1] - coastMid[1]) ** 2;
      if (d > bestD) { bestD = d; interiorIdx = i; }
    }
    const coastSuffixes = ["coast", "shore"];
    let coastalSeen = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      const isInterior = pi === interiorIdx;
      const suffix = isInterior ? "interior" : coastSuffixes[coastalSeen % coastSuffixes.length];
      const regionId = isInterior ? `${major.id}-interior` : `${major.id}-${suffix}-${coastalSeen}`;
      if (!isInterior) coastalSeen++;
      const region = makeNode({
        id: regionId, tier: "region", parentId: major.id, title: `${major.title} — ${suffix}`,
        seedStream: terrain, points: parts[pi], composition: major.composition,
        tags: isInterior ? ["unsurveyed-interior"] : [],
        loreSummary: isInterior
          ? "The unsurveyed interior of a reported continent — panel rewrites."
          : "A reported coastal region — panel rewrites.",
      });
      regions.push(region);
    }
    // Features: a ridge (interior chord) + a river mouth (interior -> coast).
    const n = points.length;
    const ridge = [points[0], points[Math.floor(n / 2)]];
    const riverMouth = [major.__center, points[Math.floor(n / 4)], points[Math.floor(n / 4) + 1] ?? points[Math.floor(n / 4)]];
    major.features = [
      { id: `f-${major.id.slice(2)}-ridge`, kind: "line", points: ridge, attrs: { note: "generated ridge — panel rewrites" } },
      { id: `f-${major.id.slice(2)}-river-mouth`, kind: "line", points: riverMouth, attrs: { note: "generated river mouth — panel rewrites" } },
    ];
    if (mi === 0) {
      const west = westernmostPoint({ points });
      const portId = `f-port-${major.id.slice(2)}`;
      portFeature = { id: portId, kind: "point", at: west, attrs: { role: "port", name: null } };
      major.features.push(portFeature);
    } else {
      const west = westernmostPoint({ points });
      const portId = `f-port-${major.id.slice(2)}`;
      secondPortFeature = { id: portId, kind: "point", at: west, attrs: { role: "port", name: null } };
      major.features.push(secondPortFeature);
    }
  }

  // Chains: 1 reef line (offset arc along the seaward side) + 1-3 outlying isles.
  for (const chain of chains) {
    const points = chain.placement.points;
    const bbox = bboxOf({ points });
    const seaward = points.filter((p) => p[0] <= bbox.x + bbox.w / 2);
    const reefPts = seaward.length >= 2 ? seaward : points.slice(0, 2);
    const isleCount = 1 + (Math.floor(rand() * 3) % 3); // 1-3, deterministic
    const chainCentroid = centroidOf({ points });
    const isles = [];
    for (let k = 0; k < isleCount; k++) {
      const p = points[(k * 3 + 1) % points.length];
      const at = pointTowardCentroid({ vertex: p, centroid: chainCentroid, points });
      isles.push({ id: `f-${chain.id.slice(2)}-isle-${k + 1}`, kind: "point", at, attrs: { role: "outlying-isle", name: null } });
    }
    chain.features = [
      { id: `f-${chain.id.slice(2)}-reef`, kind: "line", points: reefPts, attrs: { note: "generated reef — panel rewrites" } },
      ...isles,
    ];
  }

  // Step 5: ocean band polygons.
  // Band 1: x in [5, seamA].
  const band1Rect = { x0: MARGIN, y0: MARGIN, x1: seamA, y1: FRAME - MARGIN };
  const band1N = [];
  // Basin exclusion corner (deeper than cap clearance) for x in [5, 50].
  band1N.push({ lo: MARGIN, hi: BASIN_EXCLUSION.x1, to: BASIN_EXCLUSION.y1 });
  // Cap clearance for the rest of band1's width, up to seamA (< CAP_X1).
  band1N.push({ lo: BASIN_EXCLUSION.x1, hi: seamA, to: capClearY });
  const band1 = carveRect({
    rect: band1Rect,
    notches: {
      N: band1N,
      E: [
        { lo: bays.majorA.y0, hi: bays.majorA.y1, to: bays.majorA.x0 },
        { lo: bays.chainA.y0, hi: bays.chainA.y1, to: bays.chainA.x0 },
        { lo: bays.chainC.y0, hi: bays.chainC.y1, to: bays.chainC.x0 },
      ],
    },
  });
  const band1Errors = validRing({ points: band1 });
  if (band1Errors.length) throw new Error(`buildWorld: ocean band band-1 invalid: ${band1Errors.join(", ")}`);

  // Band 2: x in [seamA, seamB]. Cap clearance only where x < CAP_X1.
  const band2Rect = { x0: seamA, y0: MARGIN, x1: seamB, y1: FRAME - MARGIN };
  const band2 = carveRect({
    rect: band2Rect,
    notches: {
      N: [{ lo: seamA, hi: Math.min(CAP_X1, seamB), to: capClearY }],
      W: [
        { lo: bays.majorA.y0, hi: bays.majorA.y1, to: bays.majorA.x1 },
        { lo: bays.chainA.y0, hi: bays.chainA.y1, to: bays.chainA.x1 },
        { lo: bays.chainC.y0, hi: bays.chainC.y1, to: bays.chainC.x1 },
      ],
      E: [
        { lo: bays.majorB.y0, hi: bays.majorB.y1, to: bays.majorB.x0 },
        { lo: bays.chainB.y0, hi: bays.chainB.y1, to: bays.chainB.x0 },
      ],
    },
  });
  const band2Errors = validRing({ points: band2 });
  if (band2Errors.length) throw new Error(`buildWorld: ocean band band-2 invalid: ${band2Errors.join(", ")}`);

  // Band 3: x in [seamB, 395]. Fully east of the cap; no basin overlap.
  const band3Rect = { x0: seamB, y0: MARGIN, x1: FRAME - MARGIN, y1: FRAME - MARGIN };
  const band3 = carveRect({
    rect: band3Rect,
    notches: {
      W: [
        { lo: bays.majorB.y0, hi: bays.majorB.y1, to: bays.majorB.x1 },
        { lo: bays.chainB.y0, hi: bays.chainB.y1, to: bays.chainB.x1 },
      ],
    },
  });
  const band3Errors = validRing({ points: band3 });
  if (band3Errors.length) throw new Error(`buildWorld: ocean band band-3 invalid: ${band3Errors.join(", ")}`);

  const oceanRings = [band1, band2, band3];
  const oceans = [];
  for (const ringPts of oceanRings) {
    const cands = drawName({ nameRand, used: usedNames });
    const id = `n-${slugify({ name: cands[0] })}`;
    const node = makeNode({
      id, tier: "ocean", parentId: "n-atlas", title: `The ${cands[0]} Sea`,
      seedStream: terrain, points: ringPts, composition: OCEAN_COMPOSITION, tags: [],
      loreSummary: "A reported open-water expanse between the charted seams.",
    });
    oceans.push(node);
    summary.push({ id, tier: "ocean", nameCandidates: cands, areaKm2: r1(shoelaceArea({ points: ringPts })), composition: OCEAN_COMPOSITION, regionCount: 0 });
  }

  // Step 9: sea-lanes.
  if (portFeature) {
    const label = "the trade wind · reported passage";
    edges.push({
      id: `e-lane-${portFeature.id.slice("f-port-".length)}`,
      kind: "sealane",
      from: { node: "n-gildmark" },
      to: { feature: portFeature.id },
      attrs: { label, season: "the trade wind", passageDays: 6, note: "generated foreign sea-lane — panel rewrites." },
    });
  }
  if (portFeature && secondPortFeature) {
    edges.push({
      id: `e-lane-${secondPortFeature.id.slice("f-port-".length)}-foreign`,
      kind: "sealane",
      from: { feature: portFeature.id },
      to: { feature: secondPortFeature.id },
      attrs: { label: "a foreign coastal lane", season: "year-round", passageDays: 4, note: "generated foreign-to-foreign coastal lane — panel rewrites." },
    });
  }

  const allContinentsAndOceans = [capNode, ...majors, ...chains, ...oceans];
  for (const n of allContinentsAndOceans) delete n.__center;

  for (const region of regions) summary.push({ id: region.id, tier: "region", nameCandidates: [], areaKm2: r1(shoelaceArea({ points: region.placement.points })), composition: region.composition, regionCount: 0 });

  const nodes = [...allContinentsAndOceans, ...regions];
  return { nodes, edges, summary };
}
