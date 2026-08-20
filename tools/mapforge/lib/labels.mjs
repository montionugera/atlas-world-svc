// tools/mapforge/lib/labels.mjs — deterministic label decluttering.
//
// Replaces the greedy vertical stack at atlas-sheet.mjs:469-476, which dodged
// LAND but never other labels and needed three hand-tuning passes to fix ONE
// collision. Four mechanisms, all deterministic:
//   1. priority ranks 0-9, placement order priority-then-id
//   2. zoom tiers — a label above the sheet's maxLabelRank is not drawn and
//      NOT COUNTED (the single largest lever on ink density)
//   3. a COMMITTED per-character advance-width table — never a browser
//      measurement, which is non-deterministic and absent in Node
//   4. a fixed 8-candidate search in the classic Imhof order, then a leader
//      line to the margin, then DROP-AND-REPORT. A dropped label is reported,
//      never silently absent.
//
// Pure — no fs, no clock, no randomness, no transcendentals. Integer and
// rational arithmetic plus `Math.round` (via `r2`) only; `Math.hypot` is
// banned repo-wide and appears nowhere here. Same input, same output, always.
import { buildBBoxIndex } from "../../../scripts/lib/geometry.mjs";
import { r2 } from "./draft.mjs";

export const RANKS = Object.freeze({
  worldTitle: 0, ocean: 1, continent: 2, sea: 3, region: 4,
  capital: 5, hub: 6, dungeon: 7, namedLandform: 8, village: 9,
});

// Advance widths in em, for the sheets' serif stack (Georgia / Iowan Old
// Style / Times New Roman). COMMITTED, never measured: a browser metric is
// unavailable in Node and differs between machines, and these strings land in
// a byte-compared SVG. Values are the common metric to two decimals; the
// declutter needs proportion, not typographic exactness.
export const DEFAULT_ADVANCE = 0.52;
export const ADVANCE_WIDTH = {
  " ": 0.25, "!": 0.28, '"': 0.4, "#": 0.52, "$": 0.52, "%": 0.78, "&": 0.79, "'": 0.21,
  "(": 0.33, ")": 0.33, "*": 0.42, "+": 0.55, ",": 0.27, "-": 0.34, ".": 0.27, "/": 0.34,
  "0": 0.52, "1": 0.52, "2": 0.52, "3": 0.52, "4": 0.52, "5": 0.52, "6": 0.52, "7": 0.52,
  "8": 0.52, "9": 0.52, ":": 0.27, ";": 0.27, "<": 0.55, "=": 0.55, ">": 0.55, "?": 0.44,
  "@": 0.86, A: 0.72, B: 0.7, C: 0.71, D: 0.77, E: 0.66, F: 0.62, G: 0.76, H: 0.81,
  I: 0.4, J: 0.43, K: 0.74, L: 0.63, M: 0.95, N: 0.78, O: 0.79, P: 0.6, Q: 0.79,
  R: 0.71, S: 0.63, T: 0.67, U: 0.78, V: 0.72, W: 1.02, X: 0.71, Y: 0.68, Z: 0.63,
  "[": 0.33, "\\": 0.34, "]": 0.33, "^": 0.55, _: 0.5, "`": 0.33,
  a: 0.48, b: 0.55, c: 0.43, d: 0.55, e: 0.46, f: 0.32, g: 0.49, h: 0.56, i: 0.27,
  j: 0.29, k: 0.52, l: 0.27, m: 0.84, n: 0.56, o: 0.52, p: 0.55, q: 0.54, r: 0.4,
  s: 0.4, t: 0.34, u: 0.56, v: 0.49, w: 0.72, x: 0.48, y: 0.49, z: 0.43,
  "{": 0.36, "|": 0.3, "}": 0.36, "~": 0.55,
  // The non-ASCII marks the committed corpus ACTUALLY uses. Audited, not
  // guessed: a sweep of every title/name/label/subtitle string in
  // content/spine/nodes/*.json + sheet.json + sheet-atlas.json yields exactly
  // "§ — – → ·" outside ASCII. The plan's draft table listed "’ · —" and so
  // was missing three live characters and carrying one the corpus does not
  // use; "’" is kept because it is the correct apostrophe for a place name and
  // costs nothing, and DEFAULT_ADVANCE remains the fallback for anything else.
  "§": 0.5, "—": 1.0, "–": 0.5, "→": 1.0, "·": 0.27, "’": 0.21,
};

export function measureText({ text, size, tracking = 0 }) {
  const chars = [...String(text)];
  let em = 0;
  for (const ch of chars) em += ADVANCE_WIDTH[ch] ?? DEFAULT_ADVANCE;
  // Tracking is INTER-character, so it applies len-1 times, never len. Counted
  // over code points, matching the advance loop — a surrogate pair is one
  // glyph, not two.
  return { w: em * size + tracking * Math.max(chars.length - 1, 0), h: size * 1.0 };
}

// The classic Imhof preference order. Offsets are in multiples of the label's
// own height, so the ladder scales with the type size.
const CANDIDATES = [
  ["NE", 0.6, -0.6], ["NW", -0.6, -0.6], ["SE", 0.6, 0.6], ["SW", -0.6, 0.6],
  ["N", 0, -0.9], ["S", 0, 0.9], ["E", 0.9, 0], ["W", -0.9, 0],
];
// The margin fallback's inset from the frame edge, in px.
const MARGIN_INSET = 6;

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inFrame = (box, f) =>
  box.x >= f.x && box.y >= f.y && box.x + box.w <= f.x + f.w && box.y + box.h <= f.y + f.h;

function boxFor({ at, anchor, dx, dy, m }) {
  const [px, py] = at;
  const x = anchor.includes("W") ? px + dx * m.h - m.w : anchor.includes("E") ? px + dx * m.h : px - m.w / 2;
  const y = anchor.includes("N") ? py + dy * m.h - m.h : anchor.includes("S") ? py + dy * m.h : py - m.h / 2;
  return { x: r2(x), y: r2(y), w: r2(m.w), h: r2(m.h) };
}

// ---------------------------------------------------------------------------
// The collision structure — a MEASURED choice, not an assumed one.
//
// `buildBBoxIndex` has no insert, so the plan's sketch rebuilt the whole index
// on every placement. Measured here, best of 7 runs, 44 candidate probes per
// label, glyph-sized obstacles spread over the frame:
//
//   obstacles   labels   rebuild-per-commit   batched (this)   no index at all
//           0      340              27.3 ms          5.9 ms            5.2 ms
//           0      600              59.0 ms         17.6 ms           12.7 ms
//        1740      340             178.1 ms         25.8 ms           37.9 ms
//        1740      600             335.3 ms         50.0 ms           67.2 ms
//
// Two conclusions, both against an assumption. (a) The index EARNS ITS KEEP
// only once there are real obstacles — with none it is dead weight, but the
// target sheet carries 1,740 glyphs, where it is ~1.4x faster than no index.
// (b) Risk B4 said the per-commit rebuild would be unaffordable past ~340. It
// is not — 178 ms is inside the 400 ms bar — but it burns 84% of the bar at
// 600 for no benefit, so batching is taken on the measurement, not the fear.
//
// The batch: the index covers everything up to the last rebuild, and anything
// committed since is held in a short `pending` list scanned linearly. BATCH
// caps that list, so the index is rebuilt ceil(n/BATCH) times and the linear
// tail is never longer than BATCH. 32 / 64 / 128 measured within noise of each
// other; 64 is the middle. Correctness does not depend on the value: `hits`
// consults both halves, so the answer is the same set of boxes whenever a
// rebuild happens. The gate re-derives every overlap from the RETURNED boxes,
// so a collider bug surfaces as a G-LABEL overlap rather than as silence.
//
// Handover note honoured: this index derives its extent from its items, so one
// out-of-frame item collapses it towards a linear scan. Label boxes are
// `inFrame`-checked before they are ever committed; caller-supplied obstacles
// are not, which is a graceful degradation to the "no index at all" column
// above, never a wrong answer.
// ---------------------------------------------------------------------------
const BATCH = 64;

function makeCollider({ obstacles }) {
  const indexed = obstacles.map((o) => ({ id: `obs:${o.id}`, bbox: o.bbox }));
  const boxOf = new Map(indexed.map((i) => [i.id, i.bbox]));
  let index = buildBBoxIndex({ items: indexed });
  let pending = [];
  return {
    hits(box) {
      for (const p of pending) if (overlaps(box, p.bbox)) return true;
      for (const id of index.query({ bbox: box })) if (overlaps(box, boxOf.get(id))) return true;
      return false;
    },
    add(id, bbox) {
      boxOf.set(id, bbox);
      pending.push({ id, bbox });
      if (pending.length >= BATCH) {
        for (const p of pending) indexed.push(p);
        pending = [];
        index = buildBBoxIndex({ items: indexed });
      }
    },
  };
}

/**
 * @param labels        LabelReq[] — { id, text, at:[x,y], rank, anchorPref? }
 * @param obstacles     [{ id, bbox }] — anything a label must not cover
 * @param maxLabelRank  the sheet's zoom tier; labels with a HIGHER rank are
 *                      out of scope entirely (not drawn, not dropped)
 * @param frame         { x, y, w, h } in sheet px
 */
export function placeLabels({ labels, obstacles = [], maxLabelRank = 10, frame }) {
  // Priority THEN id — never insertion order. This is what makes the output a
  // function of the data alone (spec 7.4).
  const queue = labels
    .filter((l) => l.rank <= maxLabelRank)
    .slice()
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const collider = makeCollider({ obstacles });
  const placed = [];
  const dropped = [];
  const clear = (box) => inFrame(box, frame) && !collider.hits(box);

  for (const l of queue) {
    // Font size falls out of the rank: a world title is not a village name.
    const size = l.rank <= 1 ? 15 : l.rank <= 3 ? 13 : l.rank <= 6 ? 11 : 9.5;
    const m = measureText({ text: l.text, size, tracking: l.rank <= 3 ? 2 : 0.6 });
    const order = l.anchorPref
      ? [...CANDIDATES.filter((c) => c[0] === l.anchorPref), ...CANDIDATES.filter((c) => c[0] !== l.anchorPref)]
      : CANDIDATES;

    let done = false;
    for (const [anchor, dx, dy] of order) {
      const box = boxFor({ at: l.at, anchor, dx, dy, m });
      if (!clear(box)) continue;
      placed.push({ id: l.id, x: box.x, y: r2(box.y + m.h * 0.78), anchor, box, size, text: l.text });
      collider.add(l.id, box);
      done = true;
      break;
    }
    if (done) continue;

    // Fallback ladder step 2: a leader line out to the nearest clear margin.
    // Four margins, tried N, S, E, W, at a fixed inset — deterministic.
    let leadered = false;
    for (const side of ["N", "S", "E", "W"]) {
      const box =
        side === "N" ? { x: r2(l.at[0] - m.w / 2), y: r2(frame.y + MARGIN_INSET), w: r2(m.w), h: r2(m.h) }
        : side === "S" ? { x: r2(l.at[0] - m.w / 2), y: r2(frame.y + frame.h - MARGIN_INSET - m.h), w: r2(m.w), h: r2(m.h) }
        : side === "E" ? { x: r2(frame.x + frame.w - MARGIN_INSET - m.w), y: r2(l.at[1] - m.h / 2), w: r2(m.w), h: r2(m.h) }
        : { x: r2(frame.x + MARGIN_INSET), y: r2(l.at[1] - m.h / 2), w: r2(m.w), h: r2(m.h) };
      if (!clear(box)) continue;
      placed.push({ id: l.id, x: box.x, y: r2(box.y + m.h * 0.78), anchor: side, box, size, text: l.text,
        leader: [[r2(l.at[0]), r2(l.at[1])], [r2(box.x + m.w / 2), r2(box.y + m.h / 2)]] });
      collider.add(l.id, box);
      leadered = true;
      break;
    }
    if (!leadered) dropped.push({ id: l.id, why: "no candidate position and no clear margin for a leader" });
  }
  return { placed, dropped };
}

/**
 * G-LABEL. `budget` is the hard label cap for this tier (40 at zoom tier 1);
 * null skips it. Overlaps are checked against the RETURNED boxes, not against
 * the placer's own bookkeeping — the gate must be able to disbelieve the
 * placer. Never throws; problems come back in-band.
 *
 * STATED LIMITATION, so a reviewer does not have to discover it: the gate
 * compares label BOXES. A leader LINE emitted by the margin fallback is not
 * tested for crossing another label's box or another leader. Segment-vs-segment
 * crossing is a different rule and belongs with the sheet builder that decides
 * how a leader is stroked (Tasks 10 and 12), not with the placer.
 */
export function checkLabels({ placed, dropped = [], tier, budget = null }) {
  const problems = [];
  const pairs = [];
  for (let i = 0; i < placed.length; i++)
    for (let k = i + 1; k < placed.length; k++)
      if (overlaps(placed[i].box, placed[k].box)) pairs.push(`${placed[i].id} x ${placed[k].id}`);
  if (pairs.length)
    problems.push(`G-LABEL: ${pairs.length} label boxes overlap at zoom tier ${tier} (${pairs.join(", ")})`);
  if (dropped.length)
    problems.push(`G-LABEL: ${dropped.length} labels dropped at tier ${tier}: ${dropped.map((d) => d.id).join(", ")}`);
  if (budget !== null && placed.length > budget)
    problems.push(`G-LABEL: ${placed.length} labels at zoom tier ${tier} > budget ${budget}`);
  return problems;
}
