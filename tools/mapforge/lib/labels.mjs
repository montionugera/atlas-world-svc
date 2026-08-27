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
//   4. the 8 candidates of the classic Imhof order, tried at FIVE increasing
//      displacements, then a leader line to the margin, then DROP-AND-REPORT.
//      A dropped label is reported, never silently absent.
//
// Pure — no fs, no clock, no randomness, no transcendentals. Integer and
// rational arithmetic plus `Math.round` (via `r2`) only; `Math.hypot` is
// banned repo-wide and appears nowhere here. Same input, same output, always.
//
// NOTHING HERE THROWS. `placeLabels` is called from a sheet builder and
// `checkLabels` is a gate; the repo rule is that both report in-band, because
// an uncaught throw skips the caller's `finish()` and silently drops every
// failure recorded before it. Malformed input becomes a reported drop or a
// reported problem, never a crash.
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
  // guessed: a sweep of every string in content/spine/nodes/*.json +
  // sheet.json + sheet-atlas.json. The plan's draft table listed "’ · —" and
  // so was missing three live characters and carrying one the corpus does not
  // use; "’" is kept because it is the correct apostrophe for a place name and
  // costs nothing, and DEFAULT_ADVANCE remains the fallback for anything else.
  //
  // PLAN E REDRAW — "é" and "²" joined the corpus, and the audit above was
  // stale the moment it did. Neither is a place name: generate-world.mjs:520
  // copies each premise's `structuralIdea` VERBATIM into its continent node's
  // `lore.summary`, so authored prose in content/world/premises/*.json now
  // reaches this table. "é" arrives from continent-12's "roche moutonnée" and
  // "²" from continent-05's "9,000 km²". The pre-redraw 46-node basin trunk
  // had no continent nodes carrying premise prose, which is why the sweep
  // above never saw them. The generator is not at fault and neither is the
  // premise text — this table simply had not been re-audited against the
  // wider corpus, which is exactly the gap labels.test.mjs's corpus scan
  // exists to catch. Fixing it in the generated node would have been a hand
  // edit of a generated artifact (Task 6 rule 1); fixing it in the premise
  // would edit world content to suit a font metric.
  //
  // Both widths are DERIVED from the serif stack this header names, not
  // measured and not guessed:
  //   "é" — an accented Latin letter carries its base letter's advance in
  //         Georgia, Iowan Old Style and Times New Roman alike (the accent is
  //         drawn inside the same advance box), so it is exactly ADVANCE_WIDTH.e.
  //   "²" — twosuperior against a lining digit is 300/500 in Times New Roman
  //         and 0.3564/0.5566 in Georgia (ratios 0.60 and 0.64); the mid ratio
  //         0.62 against this table's digit width 0.52 gives 0.32.
  "§": 0.5, "—": 1.0, "–": 0.5, "→": 1.0, "·": 0.27, "’": 0.21,
  "é": 0.46, "²": 0.32,
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
// ---------------------------------------------------------------------------
// The displacement ladder — the 8 candidates re-tried at 5 growing radii, so
// the search is 40 probes plus 4 margins. MEASURED, not assumed. 340 labels on
// a 1400x1400 frame, the plan's own Step 5 corpus:
//
//                            placed  dropped  leaders  leader-x-box  time
//   1 ring  (8 probes)          340        0       12            12   24 ms
//   5 rings (40 probes)         340        0        0             0   11 ms
//   1 ring, 1740 obstacles      246       94       62            38   26 ms
//   5 rings, 1740 obstacles     316       24       34            29   69 ms
//   1 ring, 600 labels          580       20       68            61   16 ms
//   5 rings, 600 labels         600        0        7             7   19 ms
//
// A single ring meets acceptance criterion 7 on the count (340 placed, 0
// dropped) but only by yanking 12 names out to the frame margin on leader
// lines, and all 12 of those lines cross another name. The ladder places every
// one of the 340 near its own anchor, which is what a reader needs and what
// removes the leader-crossing problem at the contract load ENTIRELY. Worst
// measured cost is 69 ms against the 400 ms G-LABEL budget.
//
// Cross-check that this is the intended shape: the collider table below was
// measured at "44 candidate probes per label" — 8 x 5 rings + 4 margins — so
// the timings the module already commits to assume the ladder.
// ---------------------------------------------------------------------------
const RINGS = Object.freeze([1, 2, 3, 4, 5]);
// The margin fallback's inset from the frame edge, in px.
const MARGIN_INSET = 6;

const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inFrame = (box, f) =>
  box.x >= f.x && box.y >= f.y && box.x + box.w <= f.x + f.w && box.y + box.h <= f.y + f.h;

// --- leader-line geometry -------------------------------------------------
// Both predicates are rational: multiply, subtract, divide, compare. No
// transcendentals, no `Math.hypot`, nothing that needs a length.

/** Liang-Barsky slab clip: does the segment p->q touch the axis-aligned box? */
export function segHitsBox(p, q, b) {
  const d = [q[0] - p[0], q[1] - p[1]];
  const lo = [b.x, b.y];
  const hi = [b.x + b.w, b.y + b.h];
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 2; k++) {
    if (d[k] === 0) {
      if (p[k] < lo[k] || p[k] > hi[k]) return false;
      continue;
    }
    let a = (lo[k] - p[k]) / d[k];
    let c = (hi[k] - p[k]) / d[k];
    if (a > c) { const t = a; a = c; c = t; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return false;
  }
  return true;
}

const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * PROPER crossing of segment a->b with segment c->d: each segment must have
 * the other's endpoints strictly on opposite sides. A shared or touching
 * endpoint is not a crossing — two leaders that meet at a point are legible,
 * and treating a measure-zero touch as a failure makes the gate flap.
 */
export function segHitsSeg(a, b, c, d) {
  const d1 = sgn(cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]));
  const d2 = sgn(cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]));
  const d3 = sgn(cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]));
  const d4 = sgn(cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// A problem line lists at most this many offending pairs. A dense failure can
// produce hundreds; a gate line nobody can read is a gate line nobody acts on,
// and the COUNT is the number that matters.
const MAX_LISTED = 10;
const listPairs = (pairs) =>
  pairs.length <= MAX_LISTED
    ? pairs.join(", ")
    : `${pairs.slice(0, MAX_LISTED).join(", ")}, +${pairs.length - MAX_LISTED} more`;

const isBox = (b) =>
  !!b && typeof b.x === "number" && typeof b.y === "number" &&
  typeof b.w === "number" && typeof b.h === "number";
const isPoint = (p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number";
const isLeader = (l) => Array.isArray(l) && l.length === 2 && isPoint(l[0]) && isPoint(l[1]);

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
 *
 * Returns `{ placed, dropped, aboveTier }`. `aboveTier` exists because of the
 * seam-4 review's silent-deletion finding (A6, and B's open class): a label
 * whose rank is over the sheet's tier used to `continue` with NO RECORD AT
 * ALL, and checkLabels was never told how many labels were ASKED for, so
 * G-LABEL structurally could not see a tier deletion. Task 12 worked around
 * that on ONE sheet by raising the tier; every other sheet still lost names in
 * silence. Above-tier is not a fault — it is what a zoom tier is FOR — so it
 * is a third bucket rather than a drop, and the rule is ACCOUNTING: every
 * label asked for lands in exactly one of the three, and checkLabels says so.
 */
export function placeLabels({ labels, obstacles = [], maxLabelRank = 10, frame } = {}) {
  const placed = [];
  const dropped = [];
  const aboveTier = [];
  // Never throw: a caller whose own load failed hands us null, and a crash
  // here would take its `finish()` with it. Report and return instead.
  if (!Array.isArray(labels)) return { placed, dropped, aboveTier, asked: 0 };
  const obs = (Array.isArray(obstacles) ? obstacles : []).filter((o) => o && isBox(o.bbox));
  if (!isBox(frame)) {
    for (const l of labels)
      dropped.push({ id: l && l.id, why: "no usable frame was supplied" });
    return { placed, dropped, aboveTier, asked: labels.length };
  }

  // Priority THEN id — never insertion order. This is what makes the output a
  // function of the data alone (spec 7.4).
  const tier = typeof maxLabelRank === "number" ? maxLabelRank : 10;
  const MALFORMED = "malformed label request: needs id, text, at:[x,y] and a numeric rank";
  const usable = [];
  for (const l of labels) {
    if (!l || typeof l.rank !== "number") { dropped.push({ id: l && l.id, why: MALFORMED }); continue; }
    // Above the zoom tier: not drawn, but COUNTED. This line used to be a bare
    // `continue` with the comment "not drawn AND not counted" — the silent
    // deletion the seam-4 review found.
    if (l.rank > tier) { aboveTier.push({ id: l.id, rank: l.rank }); continue; }
    if (!isPoint(l.at) || l.text === undefined || l.text === null) { dropped.push({ id: l.id, why: MALFORMED }); continue; }
    usable.push(l);
  }
  const queue = usable
    .slice()
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const collider = makeCollider({ obstacles: obs });
  const clear = (box) => inFrame(box, frame) && !collider.hits(box);

  for (const l of queue) {
    // Font size falls out of the rank: a world title is not a village name.
    const size = l.rank <= 1 ? 15 : l.rank <= 3 ? 13 : l.rank <= 6 ? 11 : 9.5;
    const m = measureText({ text: l.text, size, tracking: l.rank <= 3 ? 2 : 0.6 });
    const order = l.anchorPref
      ? [...CANDIDATES.filter((c) => c[0] === l.anchorPref), ...CANDIDATES.filter((c) => c[0] !== l.anchorPref)]
      : CANDIDATES;

    // Ring 1 IS the plain 8-candidate Imhof search, so a label that places on
    // the first pass places exactly where it always did; only the labels that
    // would otherwise have been yanked to the margin see rings 2-5.
    let done = false;
    for (const ring of RINGS) {
      for (const [anchor, dx, dy] of order) {
        const box = boxFor({ at: l.at, anchor, dx: dx * ring, dy: dy * ring, m });
        if (!clear(box)) continue;
        placed.push({ id: l.id, x: box.x, y: r2(box.y + m.h * 0.78), anchor, box, size, text: l.text });
        collider.add(l.id, box);
        done = true;
        break;
      }
      if (done) break;
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
  return { placed, dropped, aboveTier, asked: labels.length };
}

/**
 * G-LABEL. `budget` is the hard label cap for this tier (40 at zoom tier 1);
 * null skips it. Everything is checked against the RETURNED records, not
 * against the placer's own bookkeeping — the gate must be able to disbelieve
 * the placer. NEVER THROWS: malformed input is itself a reported problem.
 *
 * Leader lines ARE checked here, and the earlier "belongs to the sheet builder"
 * scoping was wrong. What a sheet builder decides is how a leader is STROKED —
 * width, colour, dash, curvature. What it cannot change is whether the straight
 * run between the two endpoints THIS MODULE emitted passes through a name, and
 * both endpoints are in `placed[].leader`. The gate therefore has everything it
 * needs, and a rule the gate can evaluate is a rule the gate should own.
 *
 * The other half of that adjudication is measured, not argued: the reviewer's
 * proposed remedy — have the placer prefer a margin side whose segment is clear
 * — was implemented and measured, and it does not work. There are only four
 * margins, every one of them is a long run across a dense sheet, and at 340
 * labels the crossing count went 12 -> 11 while leader-vs-leader crossings got
 * WORSE (3 -> 14 on a 400-label corpus). The displacement ladder above is what
 * actually fixes it, by not sending the label to the margin at all.
 */
export function checkLabels({ placed, dropped = [], aboveTier = [], asked = null, tier, budget = null } = {}) {
  const problems = [];
  if (!Array.isArray(placed)) return [`G-LABEL: placed is not an array — the gate could not run at tier ${tier}`];
  const drops = Array.isArray(dropped) ? dropped : [];
  if (!Array.isArray(dropped))
    problems.push(`G-LABEL: dropped is not an array — drops could not be checked at tier ${tier}`);

  // THE ACCOUNTING RULE (seam-4 review, the silent-deletion class: A6 and B's
  // open finding). Until this existed, checkLabels was never told how many
  // labels were ASKED for, so a sheet could lose a name — to a zoom tier, or
  // to any future filter — with the gate green and nothing on the record.
  // G-LABEL structurally could not see a tier deletion. Task 12 worked around
  // that on ONE sheet by raising its tier; every other sheet still lost names
  // in silence, which is a mechanism problem, not a per-sheet one.
  //
  // Above-tier is NOT a fault: dropping names is exactly what a zoom tier is
  // for, and reporting it as a failure would make every sheet red. What IS a
  // fault is a label in none of the three buckets — which is what "vanished"
  // looks like from in here.
  const above = Array.isArray(aboveTier) ? aboveTier : [];
  if (!Array.isArray(aboveTier))
    problems.push(`G-LABEL: aboveTier is not an array — above-tier names could not be accounted for at tier ${tier}`);
  if (asked !== null) {
    if (typeof asked !== "number" || !Number.isFinite(asked))
      problems.push(`G-LABEL: asked is ${asked === null ? "null" : typeof asked}, not a number — the label census could not be reconciled at tier ${tier}`);
    else {
      const accounted = placed.length + drops.length + above.length;
      if (accounted !== asked)
        problems.push(
          `G-LABEL: ${asked} labels asked for at tier ${tier} but ${accounted} accounted for ` +
            `(${placed.length} placed, ${drops.length} dropped, ${above.length} above tier) — ` +
            `${asked - accounted} vanished with no record`,
        );
    }
  }

  const bad = [];
  for (let i = 0; i < placed.length; i++)
    if (!placed[i] || !isBox(placed[i].box)) bad.push((placed[i] && placed[i].id) ?? `#${i}`);
  if (bad.length)
    problems.push(`G-LABEL: ${bad.length} placed labels have no usable box at tier ${tier}: ${listPairs(bad)}`);
  const good = placed.filter((p) => p && isBox(p.box));

  const pairs = [];
  for (let i = 0; i < good.length; i++)
    for (let k = i + 1; k < good.length; k++)
      if (overlaps(good[i].box, good[k].box)) pairs.push(`${good[i].id} x ${good[k].id}`);
  if (pairs.length)
    problems.push(`G-LABEL: ${pairs.length} label boxes overlap at zoom tier ${tier} (${listPairs(pairs)})`);

  // A leader that runs through another name is as unreadable as an overlap.
  const leaders = good.filter((p) => isLeader(p.leader));
  const overName = [];
  for (const p of leaders)
    for (const q of good)
      if (q.id !== p.id && segHitsBox(p.leader[0], p.leader[1], q.box)) overName.push(`${p.id} -> ${q.id}`);
  if (overName.length)
    problems.push(`G-LABEL: ${overName.length} leader lines cross a label box at zoom tier ${tier} (${listPairs(overName)})`);
  const tangled = [];
  for (let i = 0; i < leaders.length; i++)
    for (let k = i + 1; k < leaders.length; k++)
      if (segHitsSeg(leaders[i].leader[0], leaders[i].leader[1], leaders[k].leader[0], leaders[k].leader[1]))
        tangled.push(`${leaders[i].id} x ${leaders[k].id}`);
  if (tangled.length)
    problems.push(`G-LABEL: ${tangled.length} leader lines cross each other at zoom tier ${tier} (${listPairs(tangled)})`);

  if (drops.length)
    problems.push(`G-LABEL: ${drops.length} labels dropped at tier ${tier}: ${drops.map((d) => (d && d.id) ?? "?").join(", ")}`);
  if (budget !== null && placed.length > budget)
    problems.push(`G-LABEL: ${placed.length} labels at zoom tier ${tier} > budget ${budget}`);
  return problems;
}
