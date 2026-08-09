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

// ── constants — single source of truth ─────────────────────────────────────
// tier is a DEPTH, not a label. Two labels may share a depth (ocean beside
// continent); a child's depth must be its parent's + 1 (G-DEPTH).
export const TIER_DEPTH = Object.freeze({
  world: 0, playroot: 0,
  continent: 1, ocean: 1, playspace: 1, fixture: 1,
  region: 2, sea: 2,
  town: 3, site: 3,
});
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
