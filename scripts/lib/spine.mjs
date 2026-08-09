// F-041 tier spine — the ONE pure library for the spine node table.
// spec: .claude/refined_backlog/F-041-seeded-map-data-model-seed-derived-file/spec.md
//
// Lives in lib/ (NOT inside check_content.mjs) because check_content.mjs ends
// in a bare main() + process.exit() and is not importable — same pattern as
// lib/spawn-pairing.mjs. This file IS also executable (`node scripts/lib/
// spine.mjs reroll …`) via an entry guard at the bottom; importing it runs
// nothing.
//
// Conventions (pinned):
//   - one options object per function, no positional overloads;
//   - all geometry is deterministic; abs() appears NOWHERE — a negative
//     signed shoelace area is a G-POLY failure, not a magnitude;
//   - functions never throw on bad content — errors return in-band.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { roadPolygon, pointInPoly } from "./town-geometry.mjs";

// ── constants — single source of truth ─────────────────────────────────────
// tier is a DEPTH, not a label. Two labels may share a depth (ocean beside
// continent); a child's depth must be its parent's + 1 (G-DEPTH).
export const TIER_DEPTH = Object.freeze({
  world: 0, playroot: 0,
  continent: 1, ocean: 1, playspace: 1, fixture: 1,
  region: 2, sea: 2,
  town: 3, site: 3,
});
// F-041 Phase 4 — contract-conflict resolution #1. TIER_DEPTH[site] is 3
// (fiction: region -> site), but the runtime tree has no depth-2 tier, and
// the design's own worked example hangs sites directly off the playspace
// (n-frontier-shelf -> n-site-*). This is the ONE legal exception pair;
// every other edge obeys TIER_DEPTH[child] === TIER_DEPTH[parent] + 1.
export const DEPTH_EXCEPTIONS = new Set(["playspace>site"]);

export function depthLegal({ parentTier, childTier }) {
  if (DEPTH_EXCEPTIONS.has(`${parentTier}>${childTier}`)) return true;
  return TIER_DEPTH[childTier] === TIER_DEPTH[parentTier] + 1;
}

export const LEAF_TIERS = new Set(["town", "site", "fixture"]);
export const BIOMES = Object.freeze([
  "ocean", "ice", "marsh", "river", "meadow", "forest",
  "bramble", "rock", "upland", "alkali", "ash", "built",
]);
export const TERRAIN_KINDS = Object.freeze([
  "ice", "upland", "alkali-flat", "rim", "bramble", "headland", "river-country",
]);
// forward-only: terrainKind is AUTHORED; each implied biome must appear in
// composition at >= 15% (G-TERRAINKIND, Phase 3). Never derived backwards.
export const TERRAIN_IMPLIES = Object.freeze({
  ice: ["ice"], upland: ["upland"], "alkali-flat": ["alkali"], rim: ["rock"],
  bramble: ["bramble"], headland: ["rock", "meadow"], "river-country": ["river", "meadow"],
});
export const SPINE_CELL_KM = 0.25; // grid-sample cell, fiction tree (km)
export const SPINE_CELL_U = 1.0;   // grid-sample cell, runtime tree (u)
export const KM_TO_U = 100;        // the one pinned unit constant (region→town)
export const ID_RE = /^n-[a-z0-9]+(-[a-z0-9]+)*$/;
export const SEED_RE = /^[0-9a-f]{16}$/;

// ── geometry (deterministic; abs() nowhere) ────────────────────────────────
// Pinned shoelace: sum(x_i*y_{i+1} - x_{i+1}*y_i)/2 over the OPEN ring.
// Sign is the winding check G-POLY gates on — do not "fix" it with abs().
export function shoelaceArea({ points }) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonBBox({ points }) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Ray cast, half-open on edges — consistent for grid sampling.
export function pointInPolygon({ point, points }) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
function properCross(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

// O(n^2) pairwise proper-crossing test — n <= 8 in the corpus, fine.
export function selfIntersects({ points }) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      if (properCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

// Area of a placement in PARENT units²: polygon → signed shoelace; rect →
// w*h; point → 0 (points are excluded from every rollup — research §5.3).
export function placementArea({ placement }) {
  if (!placement) return 0;
  if (placement.shape === "polygon") return shoelaceArea({ points: placement.points });
  if (placement.shape === "rect") return placement.rect.w * placement.rect.h;
  return 0;
}

function placementContains(placement, x, y) {
  if (placement.shape === "polygon") return pointInPolygon({ point: [x, y], points: placement.points });
  if (placement.shape === "rect") {
    const r = placement.rect;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }
  return false;
}

function placementBBoxOf(placement) {
  if (placement.shape === "polygon") return polygonBBox({ points: placement.points });
  if (placement.shape === "rect") return { ...placement.rect };
  return { x: placement.at[0], y: placement.at[1], w: 0, h: 0 };
}

// Deterministic grid sampling: sample points sit on the GLOBAL lattice
// ((k + 0.5) * cell), so the result never depends on which bbox we scanned.
// Same technique town-geometry.mjs uses at CELL_SIZE 1.0 — no clipper dep.
function lattice(lo, hi, cell) {
  const k0 = Math.ceil(lo / cell - 0.5);
  const k1 = Math.ceil(hi / cell - 0.5) - 1;
  const out = [];
  for (let k = k0; k <= k1; k++) out.push((k + 0.5) * cell);
  return out;
}

export function gridIntersectionArea({ a, b, cell }) {
  const ba = placementBBoxOf(a), bb = placementBBoxOf(b);
  const x0 = Math.max(ba.x, bb.x), y0 = Math.max(ba.y, bb.y);
  const x1 = Math.min(ba.x + ba.w, bb.x + bb.w), y1 = Math.min(ba.y + ba.h, bb.y + bb.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  let count = 0;
  for (const y of lattice(y0, y1, cell))
    for (const x of lattice(x0, x1, cell))
      if (placementContains(a, x, y) && placementContains(b, x, y)) count++;
  return count * cell * cell;
}

export function gridUnionArea({ placements, cell }) {
  if (placements.length === 0) return 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of placements) {
    const b = placementBBoxOf(p);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (x1 <= x0 || y1 <= y0) return 0;
  let count = 0;
  for (const y of lattice(y0, y1, cell))
    for (const x of lattice(x0, x1, cell))
      if (placements.some((p) => placementContains(p, x, y))) count++;
  return count * cell * cell;
}

// ── load / join / traverse ─────────────────────────────────────────────────
// The ONLY function in this library that touches the filesystem. Soft-skip:
// a content root with no spine/ dir returns present:false and NO errors —
// checkSpine() must bail before compiling any schema (every pre-existing
// gate fixture depends on that pattern).
export function loadSpine({ contentRoot }) {
  const errors = [];
  const dir = join(contentRoot, "spine");
  const empty = { present: false, nodes: [], edges: [], sheet: null, roots: [], budgets: { load: null, coverage: null }, errors };
  if (!existsSync(dir)) return empty;

  const readJsonInBand = (path, label) => {
    try { return JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { errors.push(`${label}: ${e.message}`); return null; }
  };

  let roots = [];
  if (existsSync(join(dir, "roots.json"))) {
    const doc = readJsonInBand(join(dir, "roots.json"), "spine/roots.json");
    if (Array.isArray(doc) && doc.every((r) => typeof r === "string")) roots = doc;
    else if (doc !== null) errors.push("spine/roots.json: expected a JSON array of node ids");
  } else errors.push("spine/roots.json is missing");

  const nodes = [];
  const nodesDir = join(dir, "nodes");
  if (existsSync(nodesDir)) {
    // readdir explicitly sorted — never rely on platform order (G-ID discipline).
    const files = readdirSync(nodesDir).filter((f) => f.endsWith(".json")).sort();
    for (const f of files) {
      const doc = readJsonInBand(join(nodesDir, f), `spine/nodes/${f}`);
      if (doc === null) continue;
      if (typeof doc !== "object" || Array.isArray(doc)) { errors.push(`spine/nodes/${f}: not a JSON object`); continue; }
      nodes.push({ ...doc, file: f }); // `file` retained for the G-ID stem check
    }
  } else errors.push("spine/nodes/ is missing");

  // Optional siblings: edges/sheet arrive in Phase 1, budgets are committed in
  // Phase 0 but a MISSING budget file is null-not-error here — G-LOAD-BUDGET
  // (Phase 1) owns failing on it.
  const edges = existsSync(join(dir, "edges.json")) ? (readJsonInBand(join(dir, "edges.json"), "spine/edges.json") ?? []) : [];
  const sheet = existsSync(join(dir, "sheet.json")) ? readJsonInBand(join(dir, "sheet.json"), "spine/sheet.json") : null;
  const budgets = {
    load: existsSync(join(dir, "load-budget.json")) ? readJsonInBand(join(dir, "load-budget.json"), "spine/load-budget.json") : null,
    coverage: existsSync(join(dir, "coverage-budget.json")) ? readJsonInBand(join(dir, "coverage-budget.json"), "spine/coverage-budget.json") : null,
  };
  return { present: true, nodes, edges, sheet, roots, budgets, errors };
}

// Join the flat table on parentId. Duplicate ids are G-ID's business — the
// FIRST occurrence wins here so one defect yields one failure, not a cascade.
export function buildTree({ nodes, rootIds }) {
  const errors = [];
  const byId = new Map();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);

  const childrenOf = new Map();
  for (const id of byId.keys()) childrenOf.set(id, []);
  const roots = [];
  for (const n of byId.values()) {
    if (n.parentId === null) {
      roots.push(n.id);
      if (!rootIds.includes(n.id)) errors.push(`root ${n.id} is not listed in roots.json`);
    } else if (!byId.has(n.parentId)) {
      errors.push(`dangling parentId: ${n.id} → ${n.parentId}`);
    } else {
      childrenOf.get(n.parentId).push(n.id);
    }
  }
  for (const kids of childrenOf.values()) kids.sort();

  const depthOf = new Map();
  const queue = [...roots].sort();
  for (const r of queue) depthOf.set(r, 0);
  while (queue.length) {
    const id = queue.shift();
    for (const c of childrenOf.get(id)) { depthOf.set(c, depthOf.get(id) + 1); queue.push(c); }
  }

  if (depthOf.size !== byId.size) {
    const unreached = [...byId.keys()].filter((id) => !depthOf.has(id)).sort();
    errors.push(`${unreached.length} node(s) unreachable from any root: ${unreached.join(", ")}`);
    // Name cycles explicitly: walk parents from each unreached node.
    const inCycle = new Set();
    for (const id of unreached) {
      if (inCycle.has(id)) continue;
      const seen = new Set();
      let cur = id;
      while (cur !== null && byId.has(cur) && !seen.has(cur)) { seen.add(cur); cur = byId.get(cur).parentId; }
      if (cur !== null && seen.has(cur)) {
        errors.push(`cycle detected through ${cur}`);
        for (const s of seen) inCycle.add(s);
      }
    }
  }
  return { byId, childrenOf, depthOf, errors };
}

// Self first, root last. Assumes a tree that buildTree reported clean.
export function ancestorChain({ tree, id }) {
  const out = [];
  let cur = id;
  while (cur !== null && tree.byId.has(cur)) {
    out.push(cur);
    cur = tree.byId.get(cur).parentId;
  }
  return out;
}

// DFS preorder, children in sorted-id order (childrenOf is pre-sorted).
export function subtreeIds({ tree, id }) {
  const out = [];
  (function dfs(cur) {
    out.push(cur);
    for (const c of tree.childrenOf.get(cur) ?? []) dfs(c);
  })(id);
  return out;
}

// ── transforms ─────────────────────────────────────────────────────────────
// Frame rule, verified against the shipped corpus (HANDOFF.md): a frame with
// perParentUnit === 1 CONTINUES its parent's grid unchanged — the region
// polygon [72,106]… and the frozen absoluteAnchor [86,118] live on the same
// km grid. Only a unit-changing frame (town, perParentUnit 100) rebases:
//   p_parent = originInParent + p_local / perParentUnit.
export function composeToRoot({ tree, id }) {
  let origin = [0, 0];
  let scale = 1; // root units per 1 local unit
  let cur = tree.byId.get(id);
  if (!cur) return { origin: null, scale: null };
  while (cur.parentId !== null) {
    const per = cur.interior?.perParentUnit ?? 1;
    if (per !== 1) {
      const o = cur.interior?.originInParent ?? [0, 0];
      origin = [o[0] + origin[0] / per, o[1] + origin[1] / per];
      scale = scale / per;
    }
    cur = tree.byId.get(cur.parentId);
    if (!cur) return { origin: null, scale: null };
  }
  return { origin, scale };
}

// point is in `id`'s INTERIOR units → root units. All distance gates resolve
// through this — never cross-subtract two frames (research §8.4).
export function resolveToRoot({ tree, id, point }) {
  const { origin, scale } = composeToRoot({ tree, id });
  if (origin === null) return null;
  return [origin[0] + point[0] * scale, origin[1] + point[1] * scale];
}

// ── the ONE `plans` shape ───────────────────────────────────────────────────
// Every spine function that takes town plans takes the SAME shape:
//
//   plans: [{ file: string, doc: object }]
//
// `file` is the content-root-relative label used in error text
// ("towns/town-millcross.json"); `doc` is the parsed plan. The list is
// positional-free and ORDER-IRRELEVANT — a plan is joined to a node by
// `doc.spineId`, never by index. An empty array means "no plans known", which
// is the default: a content root with no towns/ is legal everywhere.
// Callers: readTownPlans() below (emitters), check_content.mjs's
// loadTownPlans() (the gate — same shape, schema-validated).
export function planForNode({ plans = [], id }) {
  for (const p of plans) if (p?.doc?.spineId === id) return p.doc;
  return null;
}

// Read content/towns/*.json into the `plans` shape. PURE — no schema, no
// reporting: check_content.mjs layers Ajv validation + FAIL lines on top
// (a schema-invalid plan must never reach the town gates), while the
// emitters (check_spine_emit.mjs, spine-tree.mjs) consume the raw list.
// Unparsable files come back separately so the gate can report them and the
// emitters can fail loudly rather than silently deriving from a short list.
export function readTownPlans({ contentRoot }) {
  const dir = join(contentRoot, "towns");
  const plans = [];
  const unreadable = [];
  if (!existsSync(dir)) return { plans, unreadable };
  for (const name of readdirSync(dir).filter((n) => /^town-.+\.json$/.test(n)).sort()) {
    const path = join(dir, name);
    const file = `towns/${name}`;
    try { plans.push({ file, doc: JSON.parse(readFileSync(path, "utf8")) }); }
    catch (e) { unreadable.push({ file, path, message: e.message }); }
  }
  return { plans, unreadable };
}

// interior.size / originInParent are DERIVED, never hand-trusted (G-FRAME):
//   normal:  originInParent = min-corner(bbox(placement)); size = bbox dims × perParentUnit
//   town:    the PLAN is the authority (research §3.2) — arrow reversed:
//            size = plan.extent; rect = anchor − anchorInInterior/per, extent/per.
// HC-4: plan.anchor.geographyAt names the CENTRE-of-interest interior point
// (anchorInInterior), NOT the origin corner.
//
// `from` names which arrow produced the result — "plan" (the reversed town
// arrow) or "placement" (bbox). G-FRAME needs it: the plan arrow divides and
// subtracts authored decimals, so 220 comes back as 220.00000000000003 and
// EXACT equality would red on correct content. `from: "plan"` tells the gate
// to compare within FRAME_EPS instead of by JSON.stringify identity.
//
// The town branch is taken only when the join is actually usable (a linked
// plan carrying a numeric extent + anchor, over a node carrying
// anchorInInterior). A malformed join falls back to the bbox arrow and is
// reported by G-TOWN-FRAME — never crashed on here.
export function deriveInterior({ node, plan }) {
  const per = node.interior?.perParentUnit ?? 1;
  const anchorIn = node.interior?.anchorInInterior;
  const at = plan?.anchor?.geographyAt;
  const w = plan?.extent?.width, h = plan?.extent?.height;
  if (
    node.tier === "town" && plan && per > 0 &&
    Array.isArray(anchorIn) && Number.isFinite(anchorIn[0]) && Number.isFinite(anchorIn[1]) &&
    Array.isArray(at) && Number.isFinite(at[0]) && Number.isFinite(at[1]) &&
    Number.isFinite(w) && Number.isFinite(h)
  ) {
    const size = [w, h];
    const rect = {
      x: at[0] - anchorIn[0] / per,
      y: at[1] - anchorIn[1] / per,
      w: size[0] / per,
      h: size[1] / per,
    };
    return { from: "plan", size, originInParent: [rect.x, rect.y], placement: { shape: "rect", rect, anchor: [...at] } };
  }
  const bb = placementBBoxOf(node.placement);
  return { from: "placement", size: [bb.w * per, bb.h * per], originInParent: [bb.x, bb.y] };
}

// ── composition ────────────────────────────────────────────────────────────
// research §5.2: share_c = area(c.placement)/A (placement is in PARENT units,
// so child areas are already in the parent's units²); point children share 0;
// bands/features non-areal; U-weighted interstitial; verdict per §5.5.
export function rollupComposition({ tree, id, plans = [] }) {
  const node = tree.byId.get(id);
  const A = placementArea({ placement: node.placement });
  const derived = {};
  let shareSum = 0;
  for (const cid of tree.childrenOf.get(id) ?? []) {
    const c = tree.byId.get(cid);
    const share = A > 0 ? placementArea({ placement: c.placement }) / A : 0;
    shareSum += share;
    for (const [b, v] of Object.entries(c.composition ?? {})) derived[b] = (derived[b] ?? 0) + share * v;
  }
  const U = 1 - shareSum;
  const interstitial = node.interstitialUnsurveyed ? node.composition : node.interstitial;
  if (U > 0.005 && interstitial)
    for (const [b, v] of Object.entries(interstitial)) derived[b] = (derived[b] ?? 0) + U * v;
  const perKeyDelta = {};
  let l1 = 0;
  for (const b of new Set([...Object.keys(node.composition ?? {}), ...Object.keys(derived)])) {
    const d = (node.composition?.[b] ?? 0) - (derived[b] ?? 0);
    perKeyDelta[b] = d;
    l1 += Math.abs(d);
  }
  const coveragePct = shareSum * 100;
  // §5.5 — a town whose spineId-linked plan exists is CHECKED even at 0%
  // child coverage: the plan IS the survey. Its built/river shares are held
  // against the declared composition by G-TOWN-COMP, so "checked" is a
  // statement about evidence, not about how much area its children claim
  // (a town has no children). `plans` reaching here is already the
  // schema-VALID list — check_content.mjs filters before calling.
  const planned = node.tier === "town" && planForNode({ plans, id }) !== null;
  const verdict = node.interstitialUnsurveyed ? "UNCHECKED"
    : planned || coveragePct >= 60 ? "CHECKED" : "ASSERTED";
  return { derived, coveragePct, unclaimedPct: U * 100, l1, verdict, perKeyDelta };
}

// The full committed `derived` block (byte-checked by G-DERIVED-DRIFT, Phase 1).
// `plans` is the ONE shape documented at planForNode(): [{ file, doc }],
// defaulting to []. It feeds rollupVerdict (town-with-plan ⇒ CHECKED), so
// every producer of a committed derived block MUST pass the same list the
// gate will pass, or G-DERIVED-DRIFT reds.
export function deriveNode({ tree, id, plans = [] }) {
  const node = tree.byId.get(id);
  const roll = rollupComposition({ tree, id, plans });
  let childArea = 0;
  for (const cid of tree.childrenOf.get(id) ?? [])
    childArea += placementArea({ placement: tree.byId.get(cid).placement });
  const anchor = node.placement?.anchor ?? null;
  // anchor is in PARENT units — resolve through the PARENT's frame.
  const absoluteAnchorRoot =
    anchor === null ? null
    : node.parentId === null ? [...anchor]
    : resolveToRoot({ tree, id: node.parentId, point: anchor });
  const resolvedSeedStreams = {};
  for (const name of ["terrain", "settlements", "vegetation", "names"])
    resolvedSeedStreams[name] = streamSeed({ node, name });
  const body = {
    areaParentUnits2: placementArea({ placement: node.placement }),
    childAreaParentUnits2: childArea,
    coveragePct: roll.coveragePct,
    unclaimedPct: roll.unclaimedPct,
    computedComposition: roll.derived,
    rollupVerdict: roll.verdict,
    absoluteAnchorRoot,
    resolvedSeedStreams,
  };
  const digest = "sha256:" + createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, digest };
}

// ── seeds ──────────────────────────────────────────────────────────────────
// I-089's construction, retained verbatim: first 8 bytes (16 hex chars) of
// sha256(seed.value + ":" + name). Namespaced so adding a rivers pass never
// reshuffles the settlements pass (research §6.2).
export function streamSeed({ node, name }) {
  return createHash("sha256").update(`${node.seed.value}:${name}`).digest("hex").slice(0, 16);
}

// research §6.3 — reroll is a REVIEWABLE operation, never a silent one-token
// diff: epoch bumps, why is required, frozen nodes are skipped. Pure: mintHex
// is injected; the CLI below owns file I/O.
export function reroll({ nodes, targetId, subtree = false, why, mintHex }) {
  const changed = [];
  const skippedFrozen = [];
  const errors = [];
  if (typeof why !== "string" || why.trim() === "") errors.push("reroll: --why is required and must be non-empty");
  // FIRST occurrence wins on duplicate ids — align with buildTree's "one
  // defect yields one failure, not a cascade" rule.
  const byId = new Map();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  if (!byId.has(targetId)) errors.push(`reroll: unknown node "${targetId}"`);
  if (errors.length) return { changed, skippedFrozen, errors };

  // --subtree walks via buildTree + subtreeIds — NOT a hand-rolled dfs — so a
  // cyclic or dangling parentId in real content surfaces as an in-band error
  // here instead of sending an inline recursion into a stack overflow.
  let targets = [targetId];
  if (subtree) {
    const rootIds = nodes.filter((n) => n.parentId === null).map((n) => n.id);
    const tree = buildTree({ nodes, rootIds });
    if (tree.errors.length) {
      errors.push(...tree.errors.map((e) => `reroll: ${e}`));
      return { changed, skippedFrozen, errors };
    }
    targets = subtreeIds({ tree, id: targetId });
  }

  const used = new Set(nodes.map((n) => n.seed?.value));
  for (const id of targets) {
    const n = byId.get(id);
    if (n.frozen === true) { skippedFrozen.push(id); continue; }
    const fresh = mintHex();
    if (!SEED_RE.test(fresh)) { errors.push(`reroll: mintHex returned "${fresh}" — not 16 lowercase hex chars`); continue; }
    if (used.has(fresh)) { errors.push(`reroll: mintHex returned an already-used seed "${fresh}"`); continue; }
    used.add(fresh);
    changed.push({ id, oldSeed: n.seed.value, newSeed: fresh, epoch: n.seed.epoch + 1 });
  }
  return { changed, skippedFrozen, errors };
}

// ── F-041 Phase 3: town-frame gates (G-TOWN-FRAME, G-TOWN-COMP, G-TERRAINKIND) ──
// Pure. `plans` is [{ file, doc }] of parsed town-plan documents; only plans
// carrying a string `spineId` are examined — a missing link is G-ALIAS's
// business (Phase 5), never silently double-owned here.
// Exported: G-FRAME needs the SAME tolerance for the reversed town arrow
// (deriveInterior `from: "plan"`), where 220 comes back as 220.00000000000003.
export const FRAME_EPS = 1e-6; // authored decimals (84.9 + 110/100) are not IEEE-exact; 1e-6 km = 1 mm
const normRect = ([ax, ay, bx, by]) => [
  Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by),
];

export function townFrameErrors({ tree, plans }) {
  const errors = [];
  for (const { file, doc } of plans) {
    if (typeof doc?.spineId !== "string") continue;
    const node = tree.byId.get(doc.spineId);
    if (!node) { errors.push(`${file}: spineId "${doc.spineId}" resolves to no spine node`); continue; }
    if (node.tier !== "town") { errors.push(`${file}: spineId "${doc.spineId}" is tier "${node.tier}", must be "town"`); continue; }
    const i = node.interior ?? {};
    if (!Array.isArray(i.anchorInInterior)) {
      errors.push(`${file} -> ${node.id}: interior.anchorInInterior is missing — the plan anchor names a point in the interior frame (HC-4)`);
      continue;
    }
    if (!(i.perParentUnit > 0) || !Array.isArray(i.originInParent)) {
      errors.push(`${file} -> ${node.id}: interior.perParentUnit/originInParent missing or non-positive`);
      continue;
    }
    const at = doc.anchor?.geographyAt;
    if (!Array.isArray(at)) { errors.push(`${file}: anchor.geographyAt is not a point`); continue; }
    const got = [
      i.originInParent[0] + i.anchorInInterior[0] / i.perParentUnit,
      i.originInParent[1] + i.anchorInInterior[1] / i.perParentUnit,
    ];
    if (Math.abs(got[0] - at[0]) > FRAME_EPS || Math.abs(got[1] - at[1]) > FRAME_EPS) {
      errors.push(
        `${file} -> ${node.id}: originInParent + anchorInInterior/perParentUnit = [${got[0]}, ${got[1]}] ` +
        `but plan anchor.geographyAt = [${at[0]}, ${at[1]}] — the anchor is the centre-of-interest, not the origin corner (HC-4)`);
    }
  }
  return errors;
}

export function townCompDerived({ plan, cell = SPINE_CELL_U }) {
  const w = plan.extent?.width ?? 0;
  const h = plan.extent?.height ?? 0;
  if (!(w > 0) || !(h > 0)) return { builtPct: 0, riverPct: 0 };
  const rects = [];
  for (const fp of plan.footprints ?? []) rects.push(normRect(fp.rect));
  for (const pz of plan.plazas ?? []) rects.push(normRect(pz.rect));
  const quads = [];
  for (const road of plan.roads ?? []) {
    try { quads.push(...roadPolygon(road.points, road.width)); }
    catch { /* degenerate width/centreline — T3 owns the report */ }
  }
  const waters = (plan.water ?? []).map((b) => b.poly);
  let builtCells = 0, riverCells = 0, total = 0;
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = cell / 2; x < w; x += cell) {
      total += 1;
      const p = [x, y];
      const built =
        rects.some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]) ||
        quads.some((q) => pointInPoly(p, q));
      if (built) { builtCells += 1; continue; }   // union partition: built wins, water \ built is river
      if (waters.some((q) => pointInPoly(p, q))) riverCells += 1;
    }
  }
  return { builtPct: (100 * builtCells) / total, riverPct: (100 * riverCells) / total };
}

export function townCompErrors({ tree, plans, tolerancePp = 3, cell = SPINE_CELL_U }) {
  const errors = [];
  for (const { file, doc } of plans) {
    if (typeof doc?.spineId !== "string") continue;
    const node = tree.byId.get(doc.spineId);
    if (!node || node.tier !== "town") continue; // join defects are G-TOWN-FRAME's report
    const w = doc.extent?.width ?? 0;
    const h = doc.extent?.height ?? 0;
    const { builtPct, riverPct } = townCompDerived({ plan: doc, cell });
    // A extent smaller than one sampling cell (or otherwise degenerate) samples
    // zero grid cells: townCompDerived divides 0/0 and returns NaN. NaN fails
    // every `> tolerancePp` comparison below, so a malformed extent — exactly
    // the authoring-typo class these gates exist to catch — would silently
    // report ZERO errors. Name the defect instead of comparing against NaN.
    if (w < cell || h < cell || !Number.isFinite(builtPct) || !Number.isFinite(riverPct)) {
      errors.push(`${file} -> ${node.id}: extent ${w}x${h} is smaller than the sampling cell (${cell}u) — composition cannot be derived to check (degenerate extent)`);
      continue;
    }
    const declaredBuilt = node.composition?.built ?? 0;
    const declaredRiver = node.composition?.river ?? 0;
    if (Math.abs(declaredBuilt - builtPct) > tolerancePp)
      errors.push(`${file} -> ${node.id}: declared built ${declaredBuilt} vs derived ${builtPct.toFixed(2)} (area(footprints U roads U plazas)/extent) — tolerance ±${tolerancePp} pp`);
    if (Math.abs(declaredRiver - riverPct) > tolerancePp)
      errors.push(`${file} -> ${node.id}: declared river ${declaredRiver} vs derived ${riverPct.toFixed(2)} (area(water minus built)/extent) — tolerance ±${tolerancePp} pp`);
  }
  return errors;
}

export function terrainKindErrors({ nodes }) {
  const errors = [];
  for (const node of nodes) {
    const kind = node.terrainKind;
    if (kind === null || kind === undefined) continue; // authored, optional — forward-only check
    if (!TERRAIN_KINDS.includes(kind)) {
      errors.push(`${node.id}: terrainKind "${kind}" is not one of ${TERRAIN_KINDS.join(", ")}`);
      continue;
    }
    for (const biome of TERRAIN_IMPLIES[kind]) {
      const share = node.composition?.[biome] ?? 0;
      if (share < 15)
        errors.push(`${node.id}: terrainKind "${kind}" implies biome "${biome}" at >= 15% of composition, found ${share}`);
    }
  }
  return errors;
}

// ── F-041 Phase 4: runtime-root gates ──────────────────────────────────
// The four mapIds the server actually joins (GameRoom default + client
// picker + the two test-map branches of getMobSpawnAreasForMap /
// MAP_DIMENSIONS). Mirrors colyseus-server/src — verified 2026-08-09.
export const LIVE_MAP_IDS = ["map-01-sector-a", "map-for-play", "map-for-test-deflect", "map-for-test-projectile"];

export function flattenSpawnAreas({ tree }) {
  const errors = [];
  const areas = [];
  for (const node of tree.byId.values()) {
    const list = node.runtime?.spawnAreas;
    if (!Array.isArray(list) || list.length === 0) continue;
    // Owning map node = nearest self-or-ancestor with mapIds non-empty;
    // accumulate this node's offset in that map's interior frame (the
    // runtime tree is all units "u", perParentUnit 1).
    let cur = node, ox = 0, oy = 0, mapNode = null;
    while (cur) {
      if (Array.isArray(cur.runtime?.mapIds) && cur.runtime.mapIds.length > 0) { mapNode = cur; break; }
      const o = cur.interior?.originInParent;
      if (!Array.isArray(o)) { errors.push(`G-RUNTIME: "${cur.id}" cannot flatten spawn areas — interior.originInParent missing`); break; }
      ox += o[0]; oy += o[1];
      cur = cur.parentId ? tree.byId.get(cur.parentId) : null;
    }
    if (!mapNode) {
      errors.push(`G-RUNTIME: spawn areas on "${node.id}" have no self-or-ancestor map node (runtime.mapIds non-empty)`);
      continue;
    }
    for (const a of list)
      areas.push({ ...a, nodeId: node.id, mapNodeId: mapNode.id, mapSize: mapNode.interior.size,
                   abs: { x: a.x + ox, y: a.y + oy, width: a.width, height: a.height } });
  }
  areas.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  return { errors, areas };
}

// Mirrors of live server config, verified 2026-08-09 (conflict note #3: the
// gate is plain .mjs and cannot import TS; mob-types.json carries no radii).
// physicsConfig.ts:29 boundaryThickness; radii from src/config/mobs/definitions/*.
export const BOUNDARY_THICKNESS_U = 5;
export const MOB_RADIUS_U = {
  aggressive: 3.5, balanced: 4, bramble_drake: 5, bramble_stalker: 3, defensive: 5,
  double_attacker: 8, hybrid: 4, spear_thrower: 3, thorncrown_drake: 9, veil_spearling: 3,
};

export function checkSpawnFit({ tree, radii = MOB_RADIUS_U, boundary = BOUNDARY_THICKNESS_U }) {
  const flat = flattenSpawnAreas({ tree });
  const errors = [...flat.errors];
  for (const a of flat.areas) {
    const r = radii[a.mobType];
    if (r === undefined) {
      errors.push(`G-SPAWN-FIT: spawn area "${a.id}" mobType "${a.mobType}" has no radius entry in MOB_RADIUS_U (scripts/lib/spine.mjs)`);
      continue;
    }
    const need = boundary + r;
    const margins = {
      west: a.abs.x,
      north: a.abs.y,
      east: a.mapSize[0] - (a.abs.x + a.abs.width),
      south: a.mapSize[1] - (a.abs.y + a.abs.height),
    };
    for (const [side, got] of Object.entries(margins))
      if (got < need)
        errors.push(`G-SPAWN-FIT: spawn area "${a.id}" ${side} margin ${got} < required ${need} (boundaryThickness ${boundary} + radius(${a.mobType}) ${r})`);
  }
  return { errors, areas: flat.areas };
}

export function checkRuntime({ tree, mobTypes, liveMapIds = LIVE_MAP_IDS }) {
  const errors = [];
  const seen = new Map(); // mapId -> nodeId
  for (const node of tree.byId.values()) {
    const rt = node.runtime;
    if (rt == null) continue;
    if (!Array.isArray(rt.mapIds)) {
      errors.push(`G-RUNTIME: "${node.id}" runtime.mapIds must be a string[] (HC-5), got ${JSON.stringify(rt.mapIds)}`);
      continue;
    }
    for (const m of rt.mapIds) {
      if (seen.has(m)) errors.push(`G-RUNTIME: mapId "${m}" claimed by both "${seen.get(m)}" and "${node.id}"`);
      else seen.set(m, node.id);
    }
    if (rt.mapIds.length > 0 && node.interior?.units !== "u")
      errors.push(`G-RUNTIME: map node "${node.id}" interior.units must be "u", got "${node.interior?.units}"`);
    for (const a of rt.spawnAreas ?? [])
      if (mobTypes && !mobTypes.has(a.mobType))
        errors.push(`G-RUNTIME: spawn area "${a.id}" on "${node.id}" mobType "${a.mobType}" not in mob-types.json`);
    if (rt.originU != null) {
      // Contract §3: originU = originInParent x perParentUnit ACCUMULATED
      // to the root — the same walk flattenSpawnAreas does. Deliberately
      // NOT composeToRoot: that is the fiction-tree transform, and its
      // per!==1-only accumulation returns [0,0] for every node of the
      // all-per-1 runtime tree, which would red every authored originU.
      let ex = 0, ey = 0, cur = node, walkable = true;
      while (cur && cur.parentId) {
        const o = cur.interior?.originInParent;
        const per = cur.interior?.perParentUnit ?? 1;
        if (!Array.isArray(o)) {
          errors.push(`G-RUNTIME: "${node.id}" originU cannot be verified — "${cur.id}" interior.originInParent missing`);
          walkable = false; break;
        }
        ex = ex * per + o[0]; ey = ey * per + o[1];
        cur = tree.byId.get(cur.parentId);
      }
      if (walkable && (!Array.isArray(rt.originU) || rt.originU[0] !== ex || rt.originU[1] !== ey))
        errors.push(`G-RUNTIME: "${node.id}" runtime.originU [${rt.originU}] !== accumulated origin [${ex},${ey}] (originInParent x perParentUnit to root)`);
    }
  }
  for (const live of liveMapIds)
    if (!seen.has(live)) errors.push(`G-RUNTIME: live mapId "${live}" resolves to no spine node`);
  for (const [m, nid] of seen)
    if (!liveMapIds.includes(m)) errors.push(`G-RUNTIME: "${nid}" declares mapId "${m}" which is not a live server map id (LIVE_MAP_IDS)`);
  errors.push(...flattenSpawnAreas({ tree }).errors);
  return { errors };
}

// F-041 P4 — G-SPAWN-ID-STABLE: the pinned union of spine-authored spawn-area
// ids and the runtime artifact's ids must equal content/spine/frozen-
// spawn-ids.json EXACTLY (set equality, not superset — a clean checkout has
// no "previous emit" to be a superset of; the frozen file IS the pin).
export function checkSpawnIdStable({ tree, frozenIds, runtimeIds }) {
  const errors = [];
  if (!Array.isArray(frozenIds)) return { errors: ["G-SPAWN-ID-STABLE: frozen-spawn-ids.json is not an array"] };
  const emitted = new Set(runtimeIds ?? []);
  for (const node of tree.byId.values())
    for (const a of node.runtime?.spawnAreas ?? []) emitted.add(a.id);
  const want = [...frozenIds].sort();
  const got = [...emitted].sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    const frozenSet = new Set(frozenIds);
    const missing = want.filter((i) => !emitted.has(i));
    const extra = got.filter((i) => !frozenSet.has(i));
    errors.push(
      `G-SPAWN-ID-STABLE: spawn-id set != content/spine/frozen-spawn-ids.json (equality, not superset) — ` +
      `missing: [${missing.join(", ")}] extra: [${extra.join(", ")}]`,
    );
  }
  return { errors };
}

// F-041 P4 — G-ALIAS (playspace half): map region ids and representsNodeId
// resolve, tiers printed. Deterministic, no lookup table: region-<slug> ⇔
// n-site-<slug>. Every resolution is printed with its tier so the cross-tree
// duplication (fiction region <-> runtime site) is named data, not implicit.
export function checkPlayspaceAliases({ tree, regionIds }) {
  const errors = [];
  const lines = [];
  for (const rid of [...new Set(regionIds ?? [])].sort()) {
    const nodeId = "n-site-" + rid.replace(/^region-/, "");
    const node = tree.byId.get(nodeId);
    if (!node) errors.push(`G-ALIAS: map region "${rid}" resolves to no spine node (expected "${nodeId}")`);
    else lines.push(`G-ALIAS: ${rid} → ${nodeId} (${node.tier})`);
  }
  for (const node of [...tree.byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (node.representsNodeId == null) continue;
    const target = tree.byId.get(node.representsNodeId);
    if (!target) errors.push(`G-ALIAS: "${node.id}" representsNodeId "${node.representsNodeId}" resolves to no spine node`);
    else lines.push(`G-ALIAS: ${node.id} represents ${target.id} (${target.tier})`);
  }
  return { errors, lines };
}

// F-041 P4 — G-SPINE-COMPLETE: every non-leaf-tier node should have >= 1
// child. Contract-conflict resolution #2: the literal "every non-leaf-tier
// node has >= 1 child" reds Gate 2 (integration.sh runs --require-complete)
// on real 1.8 content — n-westsea has no sea children and >=5 regions have
// no town/site, and authoring those children is explicitly out of scope
// (spec §6). So: trunk tiers FAIL (an empty world stays red — the failure
// this gate exists for), everything else non-leaf is WARN-counted.
export const TRUNK_TIERS = new Set(["world", "playroot", "continent", "playspace"]);

export function checkSpineComplete({ tree }) {
  const errors = [];
  const warns = [];
  for (const [id, node] of tree.byId) {
    if (LEAF_TIERS.has(node.tier)) continue;
    if ((tree.childrenOf.get(id) ?? []).length > 0) continue;
    if (TRUNK_TIERS.has(node.tier))
      errors.push(`G-SPINE-COMPLETE: "${id}" (tier ${node.tier}) has no children — a ${node.tier} may not be empty under --require-complete`);
    else
      warns.push(`G-SPINE-COMPLETE: "${id}" (tier ${node.tier}) has no children yet (region/sea tiling is out of scope in 1.8 — reported, not failed)`);
  }
  return { errors, warns };
}

// F-041 P4 Task 4.9 — informational authored-vs-runtime spawn geometry
// report (never-FAIL, mitigation b). G-SPAWN-PAIR compares ids only — the
// two tables have described different worlds since F-031, deliberately.
// This report makes the divergence VISIBLE in gate output instead of
// folklore. It can never FAIL (a failing version would pressure someone
// into HC-1's tautology). Runtime rects are read from mapConfig.ts AS TEXT
// (the gate cannot import TS, spawn-areas.json deliberately excludes
// geometry, and mapConfig.ts is never modified); a unit test pins that the
// parser tracks the live format.
export function parseRuntimeSpawnRects({ source }) {
  const rects = new Map();
  const errors = [];
  const block = source.match(/mobSpawnAreas:\s*\[([\s\S]*?)\]\s*as MobSpawnArea\[\]/);
  if (!block) {
    errors.push("parseRuntimeSpawnRects: mobSpawnAreas block not found in mapConfig.ts");
    return { rects, errors };
  }
  for (const m of block[1].matchAll(/\{[^{}]*\}/g)) {
    const entry = m[0];
    const idm = entry.match(/id:\s*'([a-z0-9_]+)'/);
    if (!idm) continue;
    const num = (key) => {
      const mm = entry.match(new RegExp(`${key}:\\s*(-?\\d+)`));
      return mm ? Number(mm[1]) : null;
    };
    rects.set(idm[1], { x: num("x"), y: num("y"), width: num("width"), height: num("height") });
  }
  return { rects, errors };
}

export function spawnGeometryReportLines({ areas, runtimeRects }) {
  const fmt = (r) => (r ? `(${r.x},${r.y} ${r.width}x${r.height})` : "—");
  const byId = new Map(areas.map((a) => [a.id, a.abs]));
  const ids = [...new Set([...byId.keys(), ...runtimeRects.keys()])].sort();
  return ids.map((id) => `spawn-geometry: ${id} authored=${fmt(byId.get(id))} runtime=${fmt(runtimeRects.get(id))}`);
}

// ── atlas-frontier.md emitter (G-EMIT-DRIFT mirror #2) ─────────────────────
export const FRONTIER_DOC = {
  file: "maps/atlas-frontier.md",
  nodeId: "n-frontier-shelf",
  docId: "atlas-frontier",
  // Emit order is a committed, reviewable constant (the flat table has no
  // intrinsic order and the mirror's row order is meaningful history).
  siteOrder: ["n-site-spawn-meadow", "n-site-icefield", "n-site-thornveil"],
};

export function renderFrontierFrontmatter({ tree, doc = FRONTIER_DOC }) {
  const errors = [];
  const map = tree.byId.get(doc.nodeId);
  if (!map) return { text: null, errors: [`emit-frontier: node "${doc.nodeId}" not found`] };
  const regionIdOf = (siteId) => "region-" + siteId.replace(/^n-site-/, "");
  const sites = [];
  for (const id of doc.siteOrder) {
    const s = tree.byId.get(id);
    if (s) sites.push(s);
    else errors.push(`emit-frontier: site "${id}" not found`);
  }
  const L = ["---", `id: ${doc.docId}`, `title: "${map.title}"`,
             "world:", `  width: ${map.interior.size[0]}`, `  height: ${map.interior.size[1]}`];
  const ps = (map.features ?? []).find((f) => f.attrs?.role === "playerSpawn");
  if (!ps) errors.push(`emit-frontier: "${doc.nodeId}" has no playerSpawn feature`);
  else L.push("playerSpawn:", `  x: ${ps.at[0]}`, `  y: ${ps.at[1]}`);
  L.push("regions:");
  for (const s of sites) {
    const r = s.placement.rect;
    const sp = (s.features ?? []).find((f) => f.attrs?.role === "spawnPoint");
    L.push(`  - id: ${regionIdOf(s.id)}`, `    title: "${s.title}"`,
           `    bounds: { x: ${r.x}, y: ${r.y}, width: ${r.w}, height: ${r.h} }`);
    // Feature `at` coordinates are already root-frame (FRAME RULE: a
    // perParentUnit === 1 interior continues its parent's grid unchanged),
    // unlike runtime.spawnAreas below which are genuinely site-local — do
    // NOT add the site rect origin here, it would double-count it.
    if (sp) L.push(`    spawnPoint: { x: ${sp.at[0]}, y: ${sp.at[1]} }`);
    else errors.push(`emit-frontier: site "${s.id}" has no spawnPoint feature`);
  }
  L.push("zoneHazards:");
  for (const s of sites) {
    for (const f of s.features ?? []) {
      const h = f.attrs?.hazard;
      if (!h) continue;
      const cast = h.castTime !== undefined ? `, castTime: ${h.castTime}` : "";
      L.push(`  - { type: ${h.type}, x: ${f.at[0]}, y: ${f.at[1]}, radius: ${h.radius}, value: ${h.value}, interval: ${h.interval}, duration: ${h.duration}${cast}, regionId: ${regionIdOf(s.id)} }`);
    }
  }
  L.push("mobSpawnAreas:");
  for (const s of sites) {
    const r = s.placement.rect;
    for (const a of s.runtime?.spawnAreas ?? []) {
      const iv = a.spawnIntervalMs !== undefined ? `, spawnIntervalMs: ${a.spawnIntervalMs}` : "";
      L.push(`  - { id: ${a.id}, x: ${a.x + r.x}, y: ${a.y + r.y}, width: ${a.width}, height: ${a.height}, mobType: ${a.mobType}, count: ${a.count}${iv}, regionId: ${regionIdOf(s.id)} }`);
    }
  }
  L.push("links:");
  for (const s of sites) L.push(`  - ${regionIdOf(s.id)}`);
  L.push("---");
  return { text: L.join("\n") + "\n", errors };
}

export function renderFrontierFile({ tree, currentText, doc = FRONTIER_DOC }) {
  const fm = renderFrontierFrontmatter({ tree, doc });
  if (fm.text == null || fm.errors.length) return fm;
  const close = currentText.indexOf("\n---\n", 4);
  if (close === -1) return { text: null, errors: ["emit-frontier: current file has no closing frontmatter fence — body cannot be preserved"] };
  return { text: fm.text + currentText.slice(close + 5), errors: [] };
}

// ── CLI: node scripts/lib/spine.mjs reroll <id> [--subtree] --why "<reason>"
//        [--content-root <dir>] ───────────────────────────────────────────
// Entry-guarded — importing this module runs NOTHING (spawn-pairing pattern:
// lib, never bare-main).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const USAGE = 'usage: spine.mjs reroll <id> [--subtree] --why "<reason>" [--content-root <dir>]';
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "reroll") { console.error(USAGE); process.exit(2); }
  let targetId = null, subtree = false, why = null;
  let contentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../content");
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--subtree") subtree = true;
    else if (a === "--why") why = rest[++i];
    else if (a === "--content-root") contentRoot = resolve(rest[++i]);
    else if (targetId === null && !a.startsWith("--")) targetId = a;
    else { console.error(`unknown arg: ${a}\n${USAGE}`); process.exit(2); }
  }
  if (!targetId || !why) { console.error(USAGE); process.exit(2); }
  const spine = loadSpine({ contentRoot });
  if (!spine.present) { console.error(`no spine/ under ${contentRoot}`); process.exit(1); }
  if (spine.errors.length) { for (const e of spine.errors) console.error(e); process.exit(1); }
  const res = reroll({ nodes: spine.nodes, targetId, subtree, why, mintHex: () => randomBytes(8).toString("hex") });
  if (res.errors.length) { for (const e of res.errors) console.error(e); process.exit(1); }
  for (const ch of res.changed) {
    const path = join(contentRoot, "spine/nodes", `${ch.id}.json`);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    doc.seed = { value: ch.newSeed, epoch: ch.epoch, why };
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    console.log(`rerolled ${ch.id}: ${ch.oldSeed} → ${ch.newSeed} (epoch ${ch.epoch})`);
  }
  for (const id of res.skippedFrozen) console.log(`skipped frozen ${id}`);
}
