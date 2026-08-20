// tools/mapforge/lib/glyphs.mjs — the shape vocabulary.
//
// 40 families cover the 170 catalogued landform types: all dune types share
// the dune family, all cave mouths share the cave family. Within a GROUP,
// sharing is intended — 21 glacial forms do not need 21 icons. ACROSS groups
// it is a failure, because two groups drawn with one mark are two things a
// reader cannot tell apart. G-GLYPH is that rule.
//
// Every family is a pure ({x, y, size, seed}) -> svg path `d`. Jitter comes
// from an integer hash, never Math.random and never a transcendental: the SVG
// these strings land in is COMMITTED and byte-compared.
//
// Pure — no fs, no deps. The lexicon is passed in, never read here.
import { r2 } from "./draft.mjs";

// xor-shift + Math.imul: exact integer arithmetic, identical on every engine.
//
// The mixing is a murmur3 fmix32 finalizer, NOT the plain
// `seed ^ imul(salt); h ^= h<<13; h ^= h>>>17; h ^= h<<5` xorshift the plan
// drafted. Measured: that variant avalanches so weakly for the small seeds a
// sheet actually uses (0..2000, differing only in the low bits) that adjacent
// seeds move the jitter by ~1e-4 of a unit — which r2()'s two-decimal quantiser
// erases entirely, leaving every family byte-identical for every seed. The
// jitter was dead, and the "at least one family responds to the seed" test is
// what caught it. fmix32 carries a low-bit change into the high bits, so it
// survives quantisation.
function hash(seed, salt) {
  let h = Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296; // [0, 1)
}
/** Deterministic jitter in [-1, 1), scaled by the caller. */
const j = (seed, salt) => hash(seed, salt) * 2 - 1;

// Path builders. `u` is one glyph unit = size / 10, so every family is drawn
// against the same 10-unit box and `size` is a real diameter in px.
const P = (...parts) => parts.join(" ");
const M = (x, y) => `M${r2(x)},${r2(y)}`;
const L = (x, y) => `L${r2(x)},${r2(y)}`;
const Q = (cx, cy, x, y) => `Q${r2(cx)},${r2(cy)} ${r2(x)},${r2(y)}`;
/** A closed circle as two arcs — no transcendentals, exact in the output. */
const CIRC = (x, y, r) =>
  `M${r2(x - r)},${r2(y)} A${r2(r)},${r2(r)} 0 1 0 ${r2(x + r)},${r2(y)} ` +
  `A${r2(r)},${r2(r)} 0 1 0 ${r2(x - r)},${r2(y)} Z`;

export const GLYPHS = {
  // ── coastal (4) ────────────────────────────────────────────────────────
  "g-cliff": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 1) * 0.6 * u;
    return P(
      M(x - 4 * u, y + 3 * u),
      L(x - 4 * u, y - 2 * u),
      L(x + 4 * u + d, y - 2 * u),
      M(x - 2 * u, y - 2 * u),
      L(x - 2.6 * u, y + 2 * u),
      M(x + u, y - 2 * u),
      L(x + 0.4 * u, y + 2 * u),
    );
  },
  // The water under the span is what makes it a SEA arch, and what separates
  // it from g-arch-rock (erosional) and g-cave (karst).
  "g-arch": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 2) * 0.4 * u;
    return P(
      M(x - 4 * u, y + 4 * u),
      L(x - 4 * u, y),
      Q(x + d, y - 5 * u, x + 4 * u, y),
      L(x + 4 * u, y + 4 * u),
      M(x - 2.6 * u, y + 2.6 * u),
      Q(x - 1.3 * u, y + 1.6 * u, x, y + 2.6 * u),
      Q(x + 1.3 * u, y + 3.6 * u, x + 2.6 * u, y + 2.6 * u),
    );
  },
  "g-spit": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 3) * 0.8 * u;
    return P(
      M(x - 4.5 * u, y + 2 * u),
      Q(x, y - 2 * u + d, x + 3.5 * u, y - u),
      Q(x + 4.5 * u, y - 0.5 * u, x + 3 * u, y + 1.5 * u),
    );
  },
  // A lagoon is water CUT OFF by a barrier, so the mark is a closed water
  // body with a detached bar outside it. It was an ellipse with an interior
  // stroke, which read as g-playa (desert) at 26 px — a cross-group collision.
  "g-lagoon": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 4) * 0.5 * u;
    return P(
      M(x - 3 * u, y - 0.4 * u),
      Q(x - 2.8 * u, y - 3.4 * u, x, y - 3.2 * u),
      Q(x + 2.8 * u, y - 3 * u, x + 3 * u, y - 0.4 * u),
      Q(x, y + 1.6 * u, x - 3 * u, y - 0.4 * u),
      "Z",
      M(x - 4.4 * u, y + 2.6 * u),
      Q(x + d, y + 5 * u, x + 4.4 * u, y + 2.6 * u),
    );
  },

  // ── fluvial (4) ────────────────────────────────────────────────────────
  "g-delta": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 5) * 0.7 * u;
    return P(
      M(x, y - 4 * u),
      L(x - 3.5 * u + d, y + 3.5 * u),
      M(x, y - 4 * u),
      L(x, y + 3.5 * u),
      M(x, y - 4 * u),
      L(x + 3.5 * u + d, y + 3.5 * u),
    );
  },
  "g-meander": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 6) * 0.6 * u;
    return P(
      M(x - 4.5 * u, y + 2 * u),
      Q(x - 1.5 * u, y - 3.5 * u + d, x, y),
      Q(x + 1.5 * u, y + 3.5 * u - d, x + 4.5 * u, y - 2 * u),
    );
  },
  "g-fan": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 7) * 0.5 * u;
    return P(
      M(x, y - 3.5 * u),
      L(x - 4 * u, y + 3.5 * u),
      M(x, y - 3.5 * u),
      L(x - 1.3 * u + d, y + 3.5 * u),
      M(x, y - 3.5 * u),
      L(x + 1.3 * u + d, y + 3.5 * u),
      M(x, y - 3.5 * u),
      L(x + 4 * u, y + 3.5 * u),
    );
  },
  "g-falls": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 8) * 0.4 * u;
    return P(
      M(x - 2 * u, y - 4 * u),
      L(x - 2 * u, y + 1.5 * u),
      M(x, y - 4 * u),
      L(x, y + 1.5 * u),
      M(x + 2 * u, y - 4 * u),
      L(x + 2 * u, y + 1.5 * u),
      M(x - 3 * u, y + 2.5 * u),
      Q(x + d, y + 4.5 * u, x + 3 * u, y + 2.5 * u),
    );
  },

  // ── mountain (4) ───────────────────────────────────────────────────────
  "g-peak": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 9) * 0.6 * u;
    return P(
      M(x - 4 * u, y + 3.5 * u),
      L(x + d, y - 4 * u),
      L(x + 4 * u, y + 3.5 * u),
      "Z",
      M(x - 1.4 * u, y - 0.6 * u),
      L(x + d, y - 2 * u),
      L(x + 1.4 * u, y - 0.6 * u),
    );
  },
  "g-ridge": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 10) * 0.7 * u;
    return P(
      M(x - 4.5 * u, y + 2.5 * u),
      L(x - 2.2 * u, y - 2 * u),
      L(x + d, y + u),
      L(x + 2.2 * u, y - 3 * u),
      L(x + 4.5 * u, y + 2.5 * u),
    );
  },
  "g-mesa": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 11) * 0.6 * u;
    return P(
      M(x - 4.5 * u, y + 3 * u),
      L(x - 2.6 * u, y - 2.5 * u),
      L(x + 2.6 * u + d, y - 2.5 * u),
      L(x + 4.5 * u, y + 3 * u),
      "Z",
    );
  },
  "g-scree": ({ x, y, size, seed }) => {
    const u = size / 10;
    return P(
      M(x - 3.5 * u + j(seed, 12) * u, y - 2 * u),
      L(x - 2.3 * u, y - 0.6 * u),
      M(x + 0.4 * u + j(seed, 13) * u, y - 3 * u),
      L(x + 1.6 * u, y - 1.6 * u),
      M(x - 2 * u + j(seed, 14) * u, y + 1.6 * u),
      L(x - 0.8 * u, y + 3 * u),
      M(x + 2 * u + j(seed, 15) * u, y + 1.2 * u),
      L(x + 3.2 * u, y + 2.6 * u),
    );
  },

  // ── glacial (4) ────────────────────────────────────────────────────────
  "g-cirque": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 16) * 0.5 * u;
    return P(
      M(x - 4 * u, y - 2.5 * u),
      Q(x + d, y + 4.5 * u, x + 4 * u, y - 2.5 * u),
      M(x - 4 * u, y - 2.5 * u),
      L(x - 2.5 * u, y - 4 * u),
      M(x + 4 * u, y - 2.5 * u),
      L(x + 2.5 * u, y - 4 * u),
    );
  },
  "g-moraine": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 17) * 0.5 * u;
    return P(
      M(x - 4.5 * u, y + 2.5 * u),
      Q(x + d, y - 3.5 * u, x + 4.5 * u, y + 2.5 * u),
      M(x - 2 * u, y + 3.4 * u),
      L(x - 1.4 * u, y + 3.4 * u),
      M(x + 1.4 * u, y + 3.4 * u),
      L(x + 2 * u, y + 3.4 * u),
    );
  },
  // Three staggered slanted gashes. It was three open vertical bars, which
  // read as g-falls (fluvial) at 26 px — a cross-group collision. A crevasse
  // is a CLOSED gash, so the lens form is also the truer picture.
  "g-crevasse": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 18) * 0.5 * u;
    const gash = (cx, cy) =>
      P(
        M(cx - 0.7 * u, cy + 1.9 * u),
        Q(cx - 1.1 * u, cy, cx + 0.6 * u, cy - 1.9 * u),
        Q(cx + 1.1 * u, cy, cx - 0.7 * u, cy + 1.9 * u),
        "Z",
      );
    return P(
      gash(x - 2.7 * u, y - 0.8 * u),
      gash(x + d, y + 0.6 * u),
      gash(x + 2.7 * u, y - 0.2 * u),
    );
  },
  "g-erratic": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 19) * 0.7 * u;
    return P(
      M(x - 2.6 * u, y + 2.4 * u),
      L(x - 3 * u, y - 0.6 * u),
      L(x - 0.6 * u, y - 2.6 * u + d),
      L(x + 2.6 * u, y - 1.4 * u),
      L(x + 3 * u, y + 2.4 * u),
      "Z",
    );
  },

  // ── karst (4) ──────────────────────────────────────────────────────────
  "g-cave": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 20) * 0.4 * u;
    return P(
      M(x - 3.5 * u, y + 3 * u),
      L(x - 3.5 * u, y),
      Q(x + d, y - 5 * u, x + 3.5 * u, y),
      L(x + 3.5 * u, y + 3 * u),
      "Z",
    );
  },
  "g-cenote": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 21) * 0.3 * u;
    return P(CIRC(x, y, 3.4 * u + d), CIRC(x, y, 1.5 * u));
  },
  "g-pavement": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 22) * 0.6 * u;
    return P(
      M(x - 4 * u, y - 3 * u),
      L(x + 4 * u, y - 3 * u),
      M(x - 4 * u, y + d),
      L(x + 4 * u, y + d),
      M(x - 4 * u, y + 3 * u),
      L(x + 4 * u, y + 3 * u),
      M(x - 1.5 * u, y - 3 * u),
      L(x - 1.5 * u, y + d),
      M(x + 1.8 * u, y + d),
      L(x + 1.8 * u, y + 3 * u),
    );
  },
  "g-tower": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 23) * 0.4 * u;
    return P(
      M(x - 2.2 * u, y + 3.5 * u),
      L(x - 1.8 * u, y - 2 * u),
      Q(x + d, y - 5 * u, x + 1.8 * u, y - 2 * u),
      L(x + 2.2 * u, y + 3.5 * u),
      "Z",
    );
  },

  // ── erosional (3) ──────────────────────────────────────────────────────
  "g-hoodoo": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 24) * 0.4 * u;
    return P(
      M(x - 1.1 * u, y + 4 * u),
      L(x - 0.7 * u, y - 1.5 * u),
      L(x + 0.7 * u, y - 1.5 * u),
      L(x + 1.1 * u, y + 4 * u),
      "Z",
      M(x - 2.4 * u + d, y - 1.5 * u),
      L(x + 2.4 * u, y - 1.5 * u),
      L(x + 1.9 * u, y - 3.2 * u),
      L(x - 1.9 * u, y - 3.2 * u),
      "Z",
    );
  },
  "g-gully": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 25) * 0.6 * u;
    return P(
      M(x, y + 4 * u),
      L(x + d, y - 0.5 * u),
      L(x - 2.6 * u, y - 3.6 * u),
      M(x + d, y - 0.5 * u),
      L(x + 2.6 * u, y - 3.6 * u),
      M(x + d, y - 0.5 * u),
      L(x + 0.4 * u, y - 3.6 * u),
    );
  },
  "g-arch-rock": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 26) * 0.4 * u;
    return P(
      M(x - 4.2 * u, y + 3.4 * u),
      L(x - 4.2 * u, y - u),
      L(x - 2.4 * u, y - 2.6 * u + d),
      L(x + 2.4 * u, y - 2.6 * u),
      L(x + 4.2 * u, y - u),
      L(x + 4.2 * u, y + 3.4 * u),
      M(x - 2.2 * u, y + 3.4 * u),
      Q(x, y - 1.6 * u, x + 2.2 * u, y + 3.4 * u),
    );
  },

  // ── desert (4) ─────────────────────────────────────────────────────────
  // A barchan, drawn CLOSED: one crescent outline with two horns. A bare arc
  // read as g-atoll (island); an arc plus an inner arc read as g-arch-rock
  // (erosional). A closed crescent reads as neither.
  "g-dune": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 27) * 0.8 * u;
    return P(
      M(x - 4.2 * u, y + 2.4 * u),
      Q(x + d, y - 4.4 * u, x + 4.2 * u, y + 2.4 * u),
      Q(x + d, y - 1 * u, x - 4.2 * u, y + 2.4 * u),
      "Z",
    );
  },
  // A shallow flat-floored pan with cracks. It was a lens with one interior
  // bar, which read as g-lagoon (coastal) and g-tarn (lakes).
  "g-playa": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 28) * 0.6 * u;
    return P(
      M(x - 4 * u, y - 1.8 * u),
      L(x + 4 * u, y - 1.8 * u),
      Q(x + 4.4 * u, y + 1.8 * u, x + 2.8 * u, y + 2.4 * u),
      L(x - 2.8 * u, y + 2.4 * u),
      Q(x - 4.4 * u, y + 1.8 * u, x - 4 * u, y - 1.8 * u),
      "Z",
      M(x - 2.2 * u, y),
      L(x - 0.4 * u, y),
      M(x + 0.6 * u + d, y + 1.2 * u),
      L(x + 2.4 * u, y + 1.2 * u),
    );
  },
  // A dry channel: two bank lines with a broken thalweg between them. It was
  // four scattered strokes, which read as g-scree (mountain) at 26 px.
  "g-wadi": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 29) * 0.6 * u;
    return P(
      M(x - 4.4 * u, y - 3 * u),
      Q(x - u, y - 0.8 * u + d, x + 4.4 * u, y + 0.6 * u),
      M(x - 4.4 * u, y - 0.6 * u),
      Q(x - u, y + 1.6 * u + d, x + 4.4 * u, y + 3 * u),
      M(x - 2.4 * u, y - 1.4 * u),
      L(x - 0.8 * u, y - 0.8 * u),
      M(x + 0.8 * u, y + 0.2 * u),
      L(x + 2.4 * u, y + 0.8 * u),
    );
  },
  // A wide flat pool with the palm OFF to one side. A centred palm over a
  // round pool read as g-mangrove (wetland); the asymmetry is the separator.
  "g-oasis": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 30) * 0.5 * u;
    return P(
      M(x - 3.6 * u, y + 3 * u),
      Q(x, y + 1.4 * u, x + 3.6 * u, y + 3 * u),
      Q(x, y + 4.4 * u, x - 3.6 * u, y + 3 * u),
      "Z",
      M(x + 1.6 * u, y + 2.2 * u),
      L(x + 1.6 * u + d, y - 1.8 * u),
      M(x + 1.6 * u + d, y - 1.8 * u),
      Q(x - 0.6 * u, y - 3.2 * u, x - 1.8 * u, y - 1.2 * u),
      M(x + 1.6 * u + d, y - 1.8 * u),
      Q(x + 3.8 * u, y - 3.2 * u, x + 4.4 * u, y - 1 * u),
    );
  },

  // ── volcanic (4) ───────────────────────────────────────────────────────
  "g-cone": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 31) * 0.5 * u;
    return P(
      M(x - 4.2 * u, y + 3.4 * u),
      L(x - 1.4 * u + d, y - 3.4 * u),
      L(x - 0.5 * u, y - 2.4 * u),
      L(x + 0.5 * u, y - 3.4 * u),
      L(x + 1.4 * u + d, y - 3.4 * u),
      L(x + 4.2 * u, y + 3.4 * u),
      "Z",
    );
  },
  "g-caldera": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 32) * 0.4 * u;
    return P(
      M(x - 4.4 * u, y + u),
      L(x - 2.4 * u, y - 2.4 * u + d),
      L(x + 2.4 * u, y - 2.4 * u),
      L(x + 4.4 * u, y + u),
      M(x - 2.4 * u, y - 2.4 * u + d),
      Q(x, y + 1.4 * u, x + 2.4 * u, y - 2.4 * u),
    );
  },
  "g-lavafield": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 33) * 0.5 * u;
    return P(
      M(x - 4.2 * u, y - u),
      L(x - 2.4 * u, y + u + d),
      L(x - 0.6 * u, y - u),
      M(x + 0.8 * u, y + 2.4 * u),
      L(x + 2.4 * u, y + 0.6 * u),
      L(x + 4.2 * u, y + 2.4 * u),
    );
  },
  "g-vent": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 34) * 0.5 * u;
    return P(
      CIRC(x, y + 2.2 * u, u),
      M(x - 1.6 * u, y + 0.6 * u),
      L(x - 2.2 * u + d, y - 2.6 * u),
      M(x, y + 0.4 * u),
      L(x + d, y - 3.4 * u),
      M(x + 1.6 * u, y + 0.6 * u),
      L(x + 2.2 * u + d, y - 2.6 * u),
    );
  },

  // ── wetland (3) ────────────────────────────────────────────────────────
  "g-tuft": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 35) * 0.4 * u;
    return P(
      M(x - 4 * u, y + 2 * u),
      L(x + 4 * u, y + 2 * u),
      M(x - 2 * u, y + 2 * u),
      L(x - 2.2 * u, y - 1.4 * u),
      M(x + d, y + 2 * u),
      L(x + d, y - 2.6 * u),
      M(x + 2 * u, y + 2 * u),
      L(x + 2.2 * u, y - 1.4 * u),
    );
  },
  "g-bog": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 36) * 0.7 * u;
    return P(
      M(x - 3.6 * u, y - 2.4 * u),
      L(x - 0.4 * u, y - 2.4 * u),
      M(x + 1.2 * u + d, y - 2.4 * u),
      L(x + 3.6 * u, y - 2.4 * u),
      M(x - 3 * u, y + 0.2 * u),
      L(x + 0.6 * u, y + 0.2 * u),
      M(x + 2 * u, y + 0.2 * u),
      L(x + 3.6 * u, y + 0.2 * u),
      M(x - 3.6 * u, y + 2.8 * u),
      L(x - 0.8 * u, y + 2.8 * u),
      M(x + 0.8 * u + d, y + 2.8 * u),
      L(x + 3.6 * u, y + 2.8 * u),
    );
  },
  "g-mangrove": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 37) * 0.4 * u;
    return P(
      M(x + d, y + 3.6 * u),
      L(x + d, y - 1.4 * u),
      M(x + d, y - 1.4 * u),
      Q(x - 2.6 * u, y - 2.4 * u, x - 3.4 * u, y - 0.4 * u),
      M(x + d, y - 1.4 * u),
      Q(x + 2.6 * u, y - 2.4 * u, x + 3.4 * u, y - 0.4 * u),
      M(x + d, y + 1.6 * u),
      L(x - 2.4 * u, y + 3.6 * u),
      M(x + d, y + 1.6 * u),
      L(x + 2.4 * u, y + 3.6 * u),
    );
  },

  // ── lakes (2) ──────────────────────────────────────────────────────────
  "g-lake": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 38) * 0.5 * u;
    return P(
      M(x - 4.2 * u, y),
      Q(x - 2 * u + d, y - 3.4 * u, x + 1.4 * u, y - 2.6 * u),
      Q(x + 4.2 * u, y - 2 * u, x + 4.2 * u, y + 0.6 * u),
      Q(x + 2 * u, y + 3.2 * u, x - 1.4 * u, y + 2.6 * u),
      Q(x - 4.2 * u, y + 2 * u, x - 4.2 * u, y),
      "Z",
    );
  },
  "g-tarn": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 39) * 0.4 * u;
    return P(
      M(x - 2.6 * u, y + 0.6 * u),
      Q(x + d, y - 3 * u, x + 2.6 * u, y + 0.6 * u),
      Q(x, y + 3 * u, x - 2.6 * u, y + 0.6 * u),
      "Z",
      M(x - 3.6 * u, y - 2.4 * u),
      L(x - 2 * u, y - 1.2 * u),
    );
  },

  // ── island (2) ─────────────────────────────────────────────────────────
  // Land WITH its waterline: a peaked blob flanked by two sea dashes. It was
  // a bare dome on a flat base, which read as g-cave (karst) at 26 px.
  "g-isle": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 40) * 0.6 * u;
    return P(
      M(x - 2.6 * u, y + 1.2 * u),
      Q(x - 2.2 * u + d, y - 2.6 * u, x + 0.2 * u, y - 2.8 * u),
      Q(x + 2.8 * u, y - 2 * u, x + 2.6 * u, y + 1.2 * u),
      "Z",
      M(x - 4.6 * u, y + 2.8 * u),
      L(x - 2 * u, y + 2.8 * u),
      M(x + 2 * u, y + 2.8 * u),
      L(x + 4.6 * u, y + 2.8 * u),
    );
  },
  // A broken ring of islets round a lagoon — which is what an atoll is. The
  // upper arc alone read as g-dune (desert).
  "g-atoll": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 41) * 0.4 * u;
    return P(
      M(x - 3.2 * u, y + 0.6 * u),
      Q(x - 3.2 * u + d, y - 3.4 * u, x + 0.4 * u, y - 3.2 * u),
      M(x + 1.8 * u, y - 2.8 * u),
      Q(x + 3.6 * u, y - 1.6 * u, x + 3.2 * u, y + 0.8 * u),
      M(x + 2.4 * u, y + 2.4 * u),
      Q(x, y + 3.6 * u, x - 2.4 * u, y + 2.4 * u),
      M(x - 3.6 * u, y + 1.8 * u),
      L(x - 3.2 * u, y + 2.6 * u),
    );
  },

  // ── oceanic (2) ────────────────────────────────────────────────────────
  // Coral stipple: three heads in a row. It was a bar with hanging ticks —
  // the hachure form — which read as g-cliff (coastal) at 26 px.
  "g-reef": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 42) * 0.5 * u;
    return P(
      CIRC(x - 2.8 * u, y + 0.8 * u, 0.9 * u),
      CIRC(x + d, y - 1.2 * u, 0.9 * u),
      CIRC(x + 2.8 * u, y + 0.8 * u, 0.9 * u),
    );
  },
  // A peak UNDER the sea surface: the wave line is what makes it submarine,
  // and what separates it from g-peak (mountain) and g-cone (volcanic).
  "g-seamount": ({ x, y, size, seed }) => {
    const u = size / 10,
      d = j(seed, 43) * 0.5 * u;
    return P(
      M(x - 3.6 * u, y + 3.4 * u),
      L(x + d, y - 1.2 * u),
      L(x + 3.6 * u, y + 3.4 * u),
      M(x - 4.4 * u, y - 2.8 * u),
      Q(x - 2.2 * u, y - 4.2 * u, x, y - 2.8 * u),
      Q(x + 2.2 * u, y - 1.4 * u, x + 4.4 * u, y - 2.8 * u),
    );
  },
};

/**
 * <symbol> definitions. Each family is drawn ONCE at the origin at size 10 in
 * a "-6 -6 12 12" viewBox; sheets place instances with glyphUse(). At 1,740
 * instances that is 40 definitions plus 1,740 short <use> elements, instead
 * of 1,740 inlined paths.
 *
 * Output order follows the `ids` argument, never GLYPHS' key order, so the
 * caller owns the bytes. An id with no family is DROPPED rather than emitted
 * broken — checkGlyphCoverage({ emittedIds }) is what turns that into a
 * reported failure.
 */
export function symbolDefs({ ids }) {
  return ids
    .filter((id) => GLYPHS[id])
    .map(
      (id) =>
        `<symbol id="${id}" viewBox="-6 -6 12 12" overflow="visible">` +
        `<path d="${GLYPHS[id]({ x: 0, y: 0, size: 10, seed: 0 })}" fill="none" ` +
        `stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/>` +
        `</symbol>`,
    )
    .join("\n");
}

export function glyphUse({ id, x, y, size }) {
  return (
    `<use href="#${id}" x="${r2(x - size / 2)}" y="${r2(y - size / 2)}" ` +
    `width="${r2(size)}" height="${r2(size)}"/>`
  );
}

export function glyphForType({ lexicon, typeId }) {
  const row = lexicon.find((r) => r.id === typeId);
  return row ? row.glyph : null;
}

/**
 * G-GLYPH. Three rules, in one pass over the lexicon:
 *
 *   1. no two landform GROUPS share a glyph (within a group, sharing is the
 *      whole point of 40 families for 170 types);
 *   2. every type that needs a mark has a family;
 *   3. every referenced glyph was actually emitted as a <symbol>.
 *
 * `namedCounts` is type id -> number of NAMED instances, and its two falsy-ish
 * states mean DIFFERENT things, deliberately:
 *
 *   - `null` (default) = "no instance census available" -> rule 2 audits the
 *     whole catalogue: every catalogued row must resolve to a family. This is
 *     the mode the lexicon test and any census-free caller runs in.
 *   - `{}` (or any object) = "the census says so" -> only types with >= 1
 *     named instance must resolve. The 1,404 unnamed texture instances are
 *     exempt by design: giving each of them a distinct glyph is how you get
 *     1,400 identical dots by another route.
 *
 * Never throws; returns the problem strings in-band.
 */
export function checkGlyphCoverage({ lexicon, namedCounts = null, emittedIds = null }) {
  const problems = [];
  const owner = new Map(); // glyph -> primary group (alsoGroups is a query tag, not a claim)
  for (const row of lexicon) {
    const prev = owner.get(row.glyph);
    if (prev === undefined) owner.set(row.glyph, row.group);
    else if (prev !== row.group)
      problems.push(`G-GLYPH: groups "${prev}" and "${row.group}" share glyph "${row.glyph}"`);
  }
  for (const row of lexicon) {
    const named = namedCounts ? (namedCounts[row.id] ?? 0) : 0;
    if (!GLYPHS[row.glyph] && (named > 0 || namedCounts === null))
      problems.push(
        named > 0
          ? `G-GLYPH: type "${row.id}" has ${named} named instances but no glyph family`
          : `G-GLYPH: type "${row.id}" names glyph "${row.glyph}" with no family`,
      );
  }
  if (emittedIds) {
    const emitted = new Set(emittedIds);
    for (const id of new Set(lexicon.map((r) => r.glyph)))
      if (!emitted.has(id))
        problems.push(`G-GLYPH: glyph "${id}" is referenced but no <symbol> was emitted`);
  }
  return problems;
}
