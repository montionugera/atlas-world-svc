// tools/mapforge/lib/texture-bake.mjs — bake the texture, do not tile it.
//
// MEASURED: rsvg-convert -w 2000 on the committed 47 KB cluster1 sheet takes
// 10.92-11.59 s; replacing every url(#...) with a flat colour drops it to
// 0.52 s. Cost scales with pattern-covered PIXEL AREA. At target density one
// sheet took 18.16 s and 8.2 MB. So the pattern layer is composited ONCE into
// a single raster and emitted as ONE <image>; vector ink draws on top.
//
// DETERMINISM: these bytes land inside a committed, byte-compared SVG, and CI
// pins node-version 18 while local dev runs v26. node:zlib is therefore BANNED
// on this path — not because level-0 framing is known to differ, but because
// "it should be identical across two zlib builds we cannot both run" is an
// assumption we would be resting a byte comparison on. Instead the zlib stream
// is written by hand: the RFC 1950 wrapper (0x78 0x01) plus RFC 1951 STORED
// blocks (0x01/0x00, LEN LE, NLEN LE, raw bytes) plus an adler32 trailer.
// All integer arithmetic, all fully specified bit layouts — the same discipline
// as this programme's no-transcendentals-on-a-committed-path rule. Both halves
// are enforced by texture-bake.test.mjs: a source scan for zlib, and a
// byte-by-byte read of the emitted stream on BOTH the single- and multi-block
// paths (the tile takes the first, the frame-sized underlay always the second).
//
// THE HONEST COST, stated rather than hidden: each pattern now has TWO
// definitions — a vector <pattern> in draft.mjs's PATTERNS and a raster recipe
// in TILE_RECIPES here — and nothing forces the recipe to be re-transcribed
// when the vector path is edited. That drift surface is real and it is not
// closed by construction. What IS enforced is that the two KEY SETS stay
// identical (texture-bake.test.mjs), so a pattern can never go un-baked; the
// SHAPE of a recipe is held only by the convention that it is a literal
// transcription of its vector path's segments. Read the two side by side when
// changing either one.
import { BIOME_FILL, C } from "./draft.mjs";

// Tile recipes: [x0, y0, x1, y1] ink segments in tile space, transcribed from
// the matching PATTERNS entry. `opacity` matches the vector stroke weight's
// visual density (a 0.45-wide stroke reads lighter than a 0.9 one).
export const TILE_RECIPES = {
  pIce: { w: 26, h: 13, opacity: 0.7, ink: [[0, 4, 11, 4], [15, 4, 24, 4], [4, 9, 17, 9], [20, 9, 26, 9]] },
  pUpland: { w: 18, h: 14, opacity: 0.7, ink: [[2, 10, 6, 4], [6, 4, 10, 10], [11, 13, 14, 8], [14, 8, 17, 13]] },
  pFlat: { w: 16, h: 16, opacity: 0.7, ink: [[3, 4, 3, 4], [11, 9, 11, 9], [6, 13, 6, 13]] },
  pRim: { w: 11, h: 11, opacity: 0.6, ink: [[0, 11, 11, 0]] },
  pBramble: { w: 9, h: 9, opacity: 0.55, ink: [[0, 9, 9, 0], [0, 0, 9, 9]] },
  pMire: { w: 22, h: 16, opacity: 0.8, ink: [[2, 8, 11, 8], [6, 8, 6, 4], [4, 8, 4, 5], [9, 8, 9, 5], [13, 15, 21, 15], [17, 15, 17, 12], [15, 15, 15, 13], [19, 15, 19, 13]] },
  pRock: { w: 12, h: 12, opacity: 0.7, ink: [[2, 2, 2, 6], [7, 5, 7, 9], [10, 1, 10, 4], [4, 9, 4, 12]] },
  pRiver: { w: 20, h: 18, opacity: 0.65, ink: [[3, 12, 3, 7], [6, 14, 6, 10], [13, 7, 13, 2], [16, 9, 16, 5]] },
  pReported: { w: 7, h: 7, opacity: 0.35, ink: [[0, 7, 7, 0]] },
  pReportedSworn: { w: 7, h: 7, opacity: 0.5, ink: [[0, 7, 7, 0]] },
  pReportedHearsay: { w: 11, h: 11, opacity: 0.42, ink: [[0, 11, 11, 0]] },
  pReportedInferred: { w: 15, h: 15, opacity: 0.3, ink: [[0, 15, 15, 0]] },
  pOcean: { w: 24, h: 24, opacity: 0.35, ink: [[0, 6, 12, 6], [12, 6, 24, 6], [0, 18, 12, 18], [12, 18, 24, 18]] },
  pMeadow: { w: 20, h: 20, opacity: 0.5, ink: [[4, 15, 4, 12], [10, 18, 10, 15], [16, 13, 16, 10]] },
  pForest: { w: 18, h: 18, opacity: 0.6, ink: [[5, 14, 8, 8], [8, 8, 11, 14], [12, 17, 14, 12], [14, 12, 17, 17]] },
  pAsh: { w: 14, h: 14, opacity: 0.6, ink: [[3, 3, 3, 3], [9, 7, 9, 7], [5, 11, 5, 11], [12, 12, 12, 12]] },
  pBuilt: { w: 12, h: 12, opacity: 0.45, ink: [[0, 6, 12, 6], [6, 0, 6, 12]] },
  pTundra: { w: 20, h: 20, opacity: 0.5, ink: [[3, 10, 8, 10], [12, 16, 17, 16], [15, 6, 15, 6]] },
  pLake: { w: 18, h: 18, opacity: 0.55, ink: [[2, 7, 10, 7], [6, 14, 14, 14]] },
  pScree: { w: 14, h: 14, opacity: 0.6, ink: [[2, 3, 4, 5], [8, 2, 10, 4], [4, 9, 6, 11], [10, 10, 12, 12]] },
  pKarst: { w: 16, h: 16, opacity: 0.55, ink: [[0, 5, 16, 5], [0, 11, 16, 11], [5, 0, 5, 5], [11, 5, 11, 11], [3, 11, 3, 16]] },
  pBadland: { w: 15, h: 15, opacity: 0.55, ink: [[2, 14, 5, 5], [5, 5, 8, 14], [9, 14, 11, 8], [11, 8, 14, 14]] },
  pDesert: { w: 22, h: 14, opacity: 0.55, ink: [[0, 10, 11, 10], [11, 10, 22, 10]] },
  pLava: { w: 13, h: 13, opacity: 0.75, ink: [[1, 4, 4, 7], [4, 7, 1, 10], [7, 2, 10, 5], [10, 5, 7, 8], [4, 10, 7, 12]] },
  pReef: { w: 16, h: 16, opacity: 0.6, ink: [[3, 12, 3, 8], [1, 10, 5, 10], [11, 14, 11, 9], [9, 11, 13, 11]] },
};

// ── a minimal, deterministic PNG encoder (stdlib only) ─────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// RFC 1950 + RFC 1951 stored blocks, written by hand. No zlib module anywhere
// on this path — see the DETERMINISM note at the top of the file.
// A stored block carries at most 65,535 bytes, so a large underlay is emitted
// as several blocks with BFINAL set only on the last, and ONE adler32 computed
// over the whole uncompressed stream (RFC 1950 §2.2), never per block.
const MAX_STORED = 0xffff;
function adler32(buf) {
  let a = 1,
    b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
function zlibStored(raw) {
  const parts = [Buffer.from([0x78, 0x01])]; // CMF=0x78 (deflate/32K), FLG=0x01
  for (let off = 0; off < raw.length || off === 0; off += MAX_STORED) {
    const len = Math.min(MAX_STORED, raw.length - off);
    const head = Buffer.alloc(5);
    head[0] = off + len >= raw.length ? 0x01 : 0x00; // BFINAL on the last block
    head.writeUInt16LE(len, 1);
    head.writeUInt16LE(0xffff - len, 3); // NLEN = ~LEN
    parts.push(head, raw.subarray(off, off + len));
    if (len === 0) break;
  }
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(adler32(raw), 0);
  parts.push(trailer);
  return Buffer.concat(parts);
}

// A Uint8ClampedArray from `subarray` carries a non-zero byteOffset, and a
// plain Array has no `.buffer` at all. Buffer.from dispatches on the argument
// TYPE, so the one-liner `Buffer.from(rgba.buffer ?? rgba, off, len)` silently
// reads the wrong window in the first case and silently ignores its offset
// arguments in the second — both yielding a plausible PNG of the wrong
// picture. One normalisation, done once, removes the whole class.
function asBytes(rgba) {
  return ArrayBuffer.isView(rgba)
    ? Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
    : Buffer.from(rgba);
}

/** RGBA8 -> a `data:image/png;base64,...` URI. Deterministic by construction. */
export function encodePng({ w, h, rgba }) {
  const src = asBytes(rgba);
  if (src.length < w * h * 4)
    throw new Error(`encodePng: ${src.length} bytes for a ${w}x${h} RGBA image (need ${w * h * 4})`);
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride); // filter byte 0 (None) on every scanline
  for (let y = 0; y < h; y++) src.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering, filter 0 on every row
  ihdr[12] = 0; // no interlace
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ── raster helpers ─────────────────────────────────────────────────────────
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
function line(put, x0, y0, x1, y1) {
  // integer Bresenham — no transcendentals
  const dx = Math.abs(x1 - x0),
    dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function tileFor(patternId) {
  const r = TILE_RECIPES[patternId];
  if (!r) throw new Error(`G-BIOME-INK: pattern "${patternId}" has no tile recipe`);
  const [br, bg, bb] = hex(C.parchmentDeep);
  const [ir, ig, ib] = hex(C.inkSoft);
  const rgba = new Uint8ClampedArray(r.w * r.h * 4);
  for (let i = 0; i < r.w * r.h; i++) {
    rgba[i * 4] = br;
    rgba[i * 4 + 1] = bg;
    rgba[i * 4 + 2] = bb;
    rgba[i * 4 + 3] = 255;
  }
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
    const i = (y * r.w + x) * 4,
      a = r.opacity;
    rgba[i] = br + (ir - br) * a;
    rgba[i + 1] = bg + (ig - bg) * a;
    rgba[i + 2] = bb + (ib - bb) * a;
  };
  for (const [x0, y0, x1, y1] of r.ink) line(put, x0 | 0, y0 | 0, x1 | 0, y1 | 0);
  return { rgba, w: r.w, h: r.h };
}

export function bakeBiomeTexture({ biome, pxPerKm }) {
  const patternId = BIOME_FILL[biome];
  if (!patternId) throw new Error(`G-BIOME-INK: biome "${biome}" has no BIOME_FILL entry`);
  const t = tileFor(patternId);
  return { dataUri: encodePng({ w: t.w, h: t.h, rgba: t.rgba }), w: t.w, h: t.h };
}

// Even-odd point-in-polygon, hoisted one loop outward. The naive form re-walks
// every ring edge for every pixel — O(pixels x vertices), which at the plan's
// 200-vertex regions is two orders of magnitude of pure waste. Computing the
// row's x-crossings ONCE and then counting how many exceed a pixel's centre is
// the identical predicate: `inside` is the parity of the crossings strictly to
// the right, and a parity count does not depend on the order it is taken in.
// Same comparisons, same float values, same result — bit for bit.
function rowCrossings(ring, py, out) {
  out.length = 0;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i];
    const [xk, yk] = ring[k];
    if (yi > py !== yk > py) out.push(((xk - xi) * (py - yi)) / (yk - yi) + xi);
  }
  return out;
}
const insideAt = (crossings, px) => {
  let n = 0;
  for (let i = 0; i < crossings.length; i++) if (px < crossings[i]) n++;
  return (n & 1) === 1;
};

/**
 * ONE <image> for the whole texture layer. `regions` is
 * [{ id, biome, ring }] in km; ring order does not matter — regions are
 * composited in ascending `id` so the output is a function of the set.
 */
export function bakedUnderlay({ regions, pxPerKm }) {
  let maxX = 0,
    maxY = 0;
  for (const r of regions)
    for (const [x, y] of r.ring) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  const W = Math.max(1, Math.ceil(maxX * pxPerKm));
  const H = Math.max(1, Math.ceil(maxY * pxPerKm));
  const [pr, pg, pb] = hex(C.parchmentDeep);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = pr;
    out[i * 4 + 1] = pg;
    out[i * 4 + 2] = pb;
    out[i * 4 + 3] = 255;
  }
  const crossings = [];
  for (const r of [...regions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const patternId = BIOME_FILL[r.biome];
    if (!patternId) throw new Error(`G-BIOME-INK: biome "${r.biome}" has no BIOME_FILL entry`);
    const t = tileFor(patternId);
    let lo = Infinity,
      hi = -Infinity,
      top = Infinity,
      bot = -Infinity;
    for (const [x, y] of r.ring) {
      if (x < lo) lo = x;
      if (x > hi) hi = x;
      if (y < top) top = y;
      if (y > bot) bot = y;
    }
    const x0 = Math.max(0, Math.floor(lo * pxPerKm)),
      x1 = Math.min(W, Math.ceil(hi * pxPerKm));
    const y0 = Math.max(0, Math.floor(top * pxPerKm)),
      y1 = Math.min(H, Math.ceil(bot * pxPerKm));
    for (let py = y0; py < y1; py++) {
      rowCrossings(r.ring, (py + 0.5) / pxPerKm, crossings);
      if (crossings.length === 0) continue;
      const rowOff = (py % t.h) * t.w;
      for (let px = x0; px < x1; px++) {
        if (!insideAt(crossings, (px + 0.5) / pxPerKm)) continue;
        const s = (rowOff + (px % t.w)) * 4,
          d = (py * W + px) * 4;
        out[d] = t.rgba[s];
        out[d + 1] = t.rgba[s + 1];
        out[d + 2] = t.rgba[s + 2];
        out[d + 3] = 255;
      }
    }
  }
  return `<image href="${encodePng({ w: W, h: H, rgba: out })}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
}
