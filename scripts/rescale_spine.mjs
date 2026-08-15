#!/usr/bin/env node
// F-045 Task 1: one-shot world rescale transform (I-095 / "World Rescale to
// 400x400"). Committed for provenance — it is NOT meant to be re-run once
// the frame is at 400x400 (see the idempotence guard below).
//
// Scale contract — spec docs/superpowers/specs/2026-08-15-world-rescale-design.md
// §1 "the scale contract (locked)" is the LAW this file implements:
//
//   S = 0.2 (÷5) on every GEOGRAPHY-tier (world/continent/ocean/region/sea —
//   NOT "playspace", see the playroot-subtree note below) coordinate pair,
//   rounded to 1 decimal (r1):
//     placement (rect x/y/w/h, or polygon points) + placement.anchor,
//     absoluteAnchor, features[].points/at and the coordinate fields inside
//     features[].attrs (labelAt, tidalLimit.at, ford.at), interior.size,
//     interior.originInParent, lore.labelAt.
//
//   TOWN tier keeps its absolute footprint (spec: "towns keep physical
//   size"): placement.anchor (+ absoluteAnchor, when present) scales ×0.2
//   the same way, then the WHOLE placement (rect or polygon) is TRANSLATED
//   by (newAnchor − oldAnchor) so every vertex's offset from the OLD anchor
//   is preserved exactly — width/height never change. A town's features
//   (e.g. a spawn point) would translate by the same shift so they stay
//   glued to it (towns' features arrays are empty today, so this is a
//   defensive no-op in practice). `interior` and `runtime` are left
//   completely untouched for town nodes — the spec calls interior
//   "plan-derived" for towns, and `check_spine_emit.mjs --write` (run AFTER
//   this script, never hand-duplicated here) re-derives interior for every
//   node from its (possibly-plan-backed) placement bbox; `derived` blocks
//   are ALWAYS regenerated there too, never written by this script.
//   (F-045 Task 2: tier "site" no longer goes through this path at all —
//   see the playroot-subtree note below. transformFootprintNode still
//   contains the general site-translation logic, dead code for now, kept
//   because FOOTPRINT_TIERS is what gates it, not a hardcoded tier check —
//   if a future non-playroot site tier is introduced, re-adding "site" to
//   FOOTPRINT_TIERS is a one-line change, not a rewrite.)
//
//   edges.json: `points` arrays ×0.2 (r1); `attrs.roadKm` / `attrs.straightKm`
//   ×0.2 (r1); `attrs.days`/`attrs.daysLabel` (road edges) and
//   `attrs.canonDays` (leg edges) are REPLACED by `hours`/`hoursLabel` /
//   `canonHours`, computed as the new roadKm ÷ 11 km/h rounded to the
//   nearest half hour — never present, never null-derived when roadKm is
//   null (the value + label both stay null, except a purely-qualitative
//   label like "not maintained" is preserved verbatim). `canonHours` keeps
//   a "~" prose flavor plus any parenthetical annotation, per the spec's
//   own worked example ("~1.5 h"). `attrs.throughRoute` (the one nested
//   {roadKm, days} on e-east-rim-track) gets the identical roadKm/hours
//   treatment, or it would silently go stale next to the top-level fields.
//   Sealane `attrs.passageDays` -> `attrs.sailDays` = passageDays ÷ 4,
//   rounded to the nearest half — this reproduces the spec-locked 1.5 h
//   Tallowquay figure exactly (6 ÷ 4 = 1.5) and lands the other reported
//   coastal lane at 1.0 h, both inside the spec §2's "1–2" sail-days range.
//
//   n-atlas needs no special case: it is tier "world", so the generic
//   geography-tier rule alone takes its placement.rect from {0,0,2000,2000}
//   to {0,0,400,400} and interior.size to [400,400] — exactly the outcome
//   the plan calls out by name.
//
// THE ENTIRE PLAYROOT SUBTREE IS EXCLUDED — documented, not silent (F-045
// Task 2, controller ruling; corrects a Task 1 mistake). n-playroot is a
// second, independent tree root (parentId: null) — it IS the runtime
// u-world mirror, not a geography node, and the spec's own "out of scope"
// list says "runtime map/unit changes (u-world untouched)". Task 1 read the
// spec's geography-tier list ("world/continent/ocean/region/sea/playspace")
// literally and scaled tier:"playspace" (n-frontier-shelf) and, via
// FOOTPRINT_TIERS, tier:"site" (its 3 children) — but "playspace" in that
// list means the geography-tree feature, not this runtime subtree, and
// scaling it broke G-CONTAIN/G-OVERLAP/G-RUNTIME/G-SPAWN-FIT for the whole
// playroot subtree (see .superpowers/sdd/plan/task-1-report.md). Task 2
// reverted n-playroot, n-frontier-shelf, and its 3 site children to their
// pre-rescale content (git show 22b7960) and moved "playspace" out of
// GEOGRAPHY_TIERS and "site" out of FOOTPRINT_TIERS below — every tier in
// this subtree (playroot, playspace, site, fixture) is now excluded, so the
// script and the committed content agree. Fixture nodes
// (n-fixture-deflect, n-fixture-projectile) were already untouched by Task 1
// (they round-tripped to a byte-for-byte no-op) because their
// runtime.originU is checked by G-RUNTIME against interior.originInParent
// summed to the (unscaled) root — same reasoning now applies to the whole
// subtree, not just fixtures.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSpine } from "./lib/spine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SCALE = 0.2;
export const KM_PER_HOUR = 11;
// "playspace" deliberately excluded: it is the runtime u-world root's child,
// not a geography-tree feature — see the playroot-subtree note above.
export const GEOGRAPHY_TIERS = new Set(["world", "continent", "ocean", "region", "sea"]);
// "site" deliberately excluded: every tier:"site" node in the committed
// content is a child of the (excluded) playspace subtree — see above.
export const FOOTPRINT_TIERS = new Set(["town"]);

// ── numeric helpers ─────────────────────────────────────────────────────
export function r1(x) {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v; // never emit -0
}
export function roundHalf(x) {
  const v = Math.round(x * 2) / 2;
  return v === 0 ? 0 : v;
}
export function scalePoint([x, y]) {
  return [r1(x * SCALE), r1(y * SCALE)];
}
function scalePoints(points) {
  return points.map(scalePoint);
}
function translatePoint([x, y], [sx, sy]) {
  return [r1(x + sx), r1(y + sy)];
}

// ── feature coordinate walkers ─────────────────────────────────────────
function scaleFeatureCoords(f) {
  if (Array.isArray(f.at)) f.at = scalePoint(f.at);
  if (Array.isArray(f.points)) f.points = scalePoints(f.points);
  const a = f.attrs;
  if (a) {
    if (Array.isArray(a.labelAt)) a.labelAt = scalePoint(a.labelAt);
    if (a.tidalLimit && Array.isArray(a.tidalLimit.at)) a.tidalLimit.at = scalePoint(a.tidalLimit.at);
    if (a.ford && Array.isArray(a.ford.at)) a.ford.at = scalePoint(a.ford.at);
  }
}
function translateFeatureCoords(f, shift) {
  if (Array.isArray(f.at)) f.at = translatePoint(f.at, shift);
  if (Array.isArray(f.points)) f.points = f.points.map((p) => translatePoint(p, shift));
  const a = f.attrs;
  if (a) {
    if (Array.isArray(a.labelAt)) a.labelAt = translatePoint(a.labelAt, shift);
    if (a.tidalLimit && Array.isArray(a.tidalLimit.at)) a.tidalLimit.at = translatePoint(a.tidalLimit.at, shift);
    if (a.ford && Array.isArray(a.ford.at)) a.ford.at = translatePoint(a.ford.at, shift);
  }
}

// ── node transforms ─────────────────────────────────────────────────────
export function transformGeographyNode(node) {
  if (Array.isArray(node.absoluteAnchor)) node.absoluteAnchor = scalePoint(node.absoluteAnchor);
  const p = node.placement;
  if (p) {
    if (Array.isArray(p.anchor)) p.anchor = scalePoint(p.anchor);
    if (p.shape === "rect" && p.rect) {
      p.rect = { x: r1(p.rect.x * SCALE), y: r1(p.rect.y * SCALE), w: r1(p.rect.w * SCALE), h: r1(p.rect.h * SCALE) };
    } else if (p.shape === "polygon" && Array.isArray(p.points)) {
      p.points = scalePoints(p.points);
    }
  }
  if (node.interior) {
    if (Array.isArray(node.interior.size)) node.interior.size = scalePoint(node.interior.size);
    if (Array.isArray(node.interior.originInParent)) node.interior.originInParent = scalePoint(node.interior.originInParent);
  }
  for (const f of node.features ?? []) scaleFeatureCoords(f);
  if (node.lore && Array.isArray(node.lore.labelAt)) node.lore.labelAt = scalePoint(node.lore.labelAt);
  return node;
}

export function transformFootprintNode(node) {
  const p = node.placement;
  if (!p || !Array.isArray(p.anchor)) return node; // defensive; every committed town/site has one
  const oldAnchor = p.anchor;
  const newAnchor = scalePoint(oldAnchor);
  const shift = [newAnchor[0] - oldAnchor[0], newAnchor[1] - oldAnchor[1]];
  p.anchor = newAnchor;
  if (p.shape === "rect" && p.rect) {
    p.rect = { x: r1(p.rect.x + shift[0]), y: r1(p.rect.y + shift[1]), w: p.rect.w, h: p.rect.h };
  } else if (p.shape === "polygon" && Array.isArray(p.points)) {
    p.points = p.points.map((pt) => translatePoint(pt, shift));
  }
  if (Array.isArray(node.absoluteAnchor)) node.absoluteAnchor = scalePoint(node.absoluteAnchor);
  for (const f of node.features ?? []) translateFeatureCoords(f, shift);
  // interior + runtime: deliberately untouched (spec: "town plans byte-
  // identical"; check_spine_emit --write re-derives interior for everyone).
  return node;
}

// ── edge transform ──────────────────────────────────────────────────────
function formatCanonHours(canonDaysText, hours) {
  const paren = typeof canonDaysText === "string" ? canonDaysText.match(/\(([^)]+)\)/) : null;
  return `~${hours} h${paren ? ` (${paren[1]})` : ""}`;
}

export function transformEdge(e) {
  if (Array.isArray(e.points)) e.points = scalePoints(e.points);
  const a = e.attrs;
  if (!a) return e;

  const hasRoadKm = "roadKm" in a;
  const newRoadKm = hasRoadKm ? (typeof a.roadKm === "number" ? r1(a.roadKm * SCALE) : null) : undefined;
  if (hasRoadKm) a.roadKm = newRoadKm;
  if (typeof a.straightKm === "number") a.straightKm = r1(a.straightKm * SCALE);

  if ("days" in a || "daysLabel" in a) {
    const hours = newRoadKm == null ? null : roundHalf(newRoadKm / KM_PER_HOUR);
    const hoursLabel = hours == null ? (a.daysLabel ?? null) : `${hours} h`;
    delete a.days;
    delete a.daysLabel;
    a.hours = hours;
    a.hoursLabel = hoursLabel;
  }

  if ("canonDays" in a) {
    const hours = newRoadKm == null ? null : roundHalf(newRoadKm / KM_PER_HOUR);
    a.canonHours = hours == null ? a.canonDays : formatCanonHours(a.canonDays, hours);
    delete a.canonDays;
  }

  if ("passageDays" in a) {
    const sailDays = typeof a.passageDays === "number" ? roundHalf(a.passageDays / 4) : null;
    delete a.passageDays;
    a.sailDays = sailDays;
  }

  if (a.throughRoute) {
    const tr = a.throughRoute;
    if (typeof tr.roadKm === "number") tr.roadKm = r1(tr.roadKm * SCALE);
    if ("days" in tr) {
      const h = typeof tr.roadKm === "number" ? roundHalf(tr.roadKm / KM_PER_HOUR) : null;
      delete tr.days;
      tr.hours = h;
    }
  }
  return e;
}

function transformNode(node) {
  if (GEOGRAPHY_TIERS.has(node.tier)) return transformGeographyNode(node);
  if (FOOTPRINT_TIERS.has(node.tier)) return transformFootprintNode(node);
  return node; // playroot, playspace, site, fixture (see header note), or an unknown tier — untouched
}

// ── driver ───────────────────────────────────────────────────────────────
// Returns a summary; throws only on a missing content root. The idempotence
// guard is reported (`idempotent: true`), not thrown, so callers (main()
// below, or a test) decide how to surface it.
export function runRescale({ contentRoot }) {
  const spine = loadSpine({ contentRoot });
  if (!spine.present) throw new Error(`rescale_spine: no spine/ directory under ${contentRoot}`);

  const atlas = spine.nodes.find((n) => n.id === "n-atlas");
  if (atlas && atlas.placement?.shape === "rect" && atlas.placement.rect?.w === 400) {
    return { idempotent: true, written: [] };
  }

  const written = [];
  for (const node of spine.nodes) {
    const { file, ...doc } = node;
    transformNode(doc);
    const path = join(contentRoot, "spine/nodes", file);
    writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
    written.push(path);
  }

  const edges = spine.edges.map(transformEdge);
  const edgesPath = join(contentRoot, "spine/edges.json");
  writeFileSync(edgesPath, JSON.stringify(edges, null, 2) + "\n");
  written.push(edgesPath);

  return { idempotent: false, written };
}

function main() {
  const argv = process.argv.slice(2);
  let contentRoot = join(ROOT, "content");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--content-root") contentRoot = resolve(argv[++i]);
    else { console.error(`rescale_spine: unknown arg ${argv[i]}`); process.exit(2); }
  }
  const result = runRescale({ contentRoot });
  if (result.idempotent) {
    console.error("rescale_spine: n-atlas is already 400x400 — refusing to re-run (idempotence guard). " +
      "This script is a one-shot F-045 transform; if you meant to redo the rescale, restore the pre-400 content first.");
    process.exit(2);
  }
  console.log(`rescale_spine: wrote ${result.written.length} files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
