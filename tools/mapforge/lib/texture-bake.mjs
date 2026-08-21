// tools/mapforge/lib/texture-bake.mjs — bake the texture, do not tile it.
//
// MEASURED: rsvg-convert -w 2000 on the committed 47 KB cluster1 sheet takes
// 10.92-11.59 s; replacing every url(#...) with a flat colour drops it to
// 0.52 s. Cost scales with pattern-covered PIXEL AREA. At target density one
// sheet took 18.16 s and 8.2 MB. So the pattern layer is composited ONCE into
// a single raster and emitted as ONE <image>; vector ink draws on top.
//
// WHY THE STREAM IS COMPRESSED, not stored. The first version of this encoder
// wrote RFC 1951 STORED blocks — legal, trivially deterministic, and 1.33
// bytes of base64 per RGBA byte with no compression at all. At the atlas
// sheet's own frame (ATLAS_PX_PER_KM = 3.5 over 400 km = 1400 x 1400 px) that
// is a single href attribute of 10,456,335 bytes, and libxml2 — inside
// librsvg — refuses ANY attribute value over 10,000,000 bytes
// (XML_MAX_TEXT_LENGTH; librsvg does not set XML_PARSE_HUGE). The sheet did
// not render slowly, it failed to PARSE:
//
//   XML parse error: Error domain 1 code 73 ... column 10000106 ...
//
// The ceiling was pinned by bisection at 1360 px OK / 1370 px FAILS, so the
// budget cannot be raised past it — the cliff is in the parser, not in us.
// XML_MAX_ATTR_BYTES below is that cliff, and bakedUnderlay reports crossing
// it as a problem rather than emitting a sheet nobody can open.
//
// DETERMINISM: these bytes land inside a committed, byte-compared SVG, and CI
// pins node-version 18 while local dev runs v26. node:zlib is therefore BANNED
// on this path — not because level-0 framing is known to differ, but because
// "it should be identical across two zlib builds we cannot both run" is an
// assumption we would be resting a byte comparison on. Instead the whole
// stream is written by hand: the RFC 1950 wrapper (0x78 0x01), RFC 1951
// FIXED-HUFFMAN blocks (BTYPE=01, the §3.2.6 code table, the §3.2.5
// length/distance bases and extra bits) over a greedy LZ77 parse, and an
// adler32 trailer over the WHOLE uncompressed stream. Every step is integer
// arithmetic over a bit layout the RFC specifies exactly — the same discipline
// as this programme's no-transcendentals-on-a-committed-path rule.
//
// Fixed Huffman is deterministic GIVEN the parse, and the parse is ours: the
// four constants below (WINDOW, MIN_MATCH/MAX_MATCH, CHAIN_LIMIT, MAX_BLOCK)
// are part of the committed bytes exactly as MAX_STORED once was. Change one
// and every baked sheet re-inks. texture-bake.test.mjs holds them: it walks
// the emitted blocks by hand, inflates them with an independent decoder, and
// verifies every PNG chunk CRC.
//
// PALETTE: the composite of <= 20 tile recipes over one ground colour holds
// nine distinct colours in the whole frame (eleven opacities x 8-bit rounding
// collapse to eight ink shades plus the ground), so encodePng emits PNG colour
// type 3 at the smallest bit depth that fits whenever the image has <= 256
// colours, and falls back to colour type 6 when it does not. The palette is
// built in first-seen scan order, which is a function of the image alone. Row
// filters stay 0 (None) on every scanline in BOTH encodings: adaptive filters
// make indexed data BIGGER, because sub-byte index runs are exactly what
// filtering destroys.
//
// ERRORS ARE IN-BAND. Every exported function returns { problems: [...] } and
// never throws. A sheet builder that dies takes finish() with it and silently
// drops every failure recorded before it — the repo's own trap. Callers read
// `problems`, and `notes` records which branch the encoder took, because a
// sheet silently changing encoding between builds is a re-baseline nobody
// ordered.
//
// THE HONEST COST, stated rather than hidden: each pattern has TWO
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

// libxml2's XML_MAX_TEXT_LENGTH. An `href` at or over this cannot be parsed by
// librsvg at all — see the header. Exported so a sheet builder can state the
// budget it is measured against instead of re-deriving the number.
export const XML_MAX_ATTR_BYTES = 10000000;

// A frame this large is a caller mistake, not a map. Guarding it keeps the
// allocation below from throwing RangeError, which would be an out-of-band
// failure in a function that promises never to throw.
const MAX_FRAME_PX = 16000000;

// ── PNG chunk framing ──────────────────────────────────────────────────────
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

// ── RFC 1951 fixed-Huffman DEFLATE, written by hand ────────────────────────
// These five constants ARE the committed bytes. Change one and every baked
// sheet re-inks; texture-bake.test.mjs pins each of them.
const WINDOW = 32768; // RFC 1951 max back-reference distance
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const CHAIN_LIMIT = 128; // hash-chain nodes examined per position
const MAX_BLOCK = 0xffff; // raw bytes per block, the stored-block cadence kept

const WMASK = WINDOW - 1;
const HASH_BITS = 15;
const HASH_MASK = (1 << HASH_BITS) - 1;

// RFC 1951 §3.2.5, table of length codes 257..285 and distance codes 0..29.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const LEN_SYM = new Uint8Array(MAX_MATCH + 1);
for (let i = 0; i < LEN_BASE.length; i++) {
  const hi = i === LEN_BASE.length - 1 ? MAX_MATCH : LEN_BASE[i + 1] - 1;
  for (let l = LEN_BASE[i]; l <= hi; l++) LEN_SYM[l] = i;
}
const DIST_SYM = new Uint8Array(WINDOW + 1);
for (let i = 0; i < DIST_BASE.length; i++) {
  const hi = i === DIST_BASE.length - 1 ? WINDOW : DIST_BASE[i + 1] - 1;
  for (let d = DIST_BASE[i]; d <= hi; d++) DIST_SYM[d] = i;
}

// RFC 1951 §3.2.6. Huffman codes are packed most-significant-bit FIRST while
// everything else in the format is least-significant-bit first, so each code
// is stored pre-reversed and the writer only ever emits LSB-first.
const revBits = (v, n) => {
  let r = 0;
  for (let i = 0; i < n; i++) r = (r << 1) | ((v >>> i) & 1);
  return r;
};
const FIX_LEN = new Uint8Array(288);
const FIX_CODE = new Uint16Array(288);
for (let i = 0; i <= 143; i++) (FIX_LEN[i] = 8), (FIX_CODE[i] = revBits(0x30 + i, 8));
for (let i = 144; i <= 255; i++) (FIX_LEN[i] = 9), (FIX_CODE[i] = revBits(0x190 + i - 144, 9));
for (let i = 256; i <= 279; i++) (FIX_LEN[i] = 7), (FIX_CODE[i] = revBits(i - 256, 7));
for (let i = 280; i <= 287; i++) (FIX_LEN[i] = 8), (FIX_CODE[i] = revBits(0xc0 + i - 280, 8));
const FIX_DIST = new Uint8Array(30);
for (let i = 0; i < 30; i++) FIX_DIST[i] = revBits(i, 5);

class BitSink {
  constructor(hint) {
    this.buf = Buffer.alloc(Math.max(64, hint | 0));
    this.n = 0;
    this.acc = 0;
    this.nbits = 0;
  }
  grow(need) {
    if (this.n + need <= this.buf.length) return;
    const next = Buffer.alloc(Math.max(this.buf.length * 2, this.n + need));
    this.buf.copy(next, 0, 0, this.n);
    this.buf = next;
  }
  /** `n` <= 16 bits of `v`, least-significant bit first. */
  put(v, n) {
    this.acc |= v << this.nbits;
    this.nbits += n;
    if (this.nbits >= 8) {
      this.grow(4);
      while (this.nbits >= 8) {
        this.buf[this.n++] = this.acc & 0xff;
        this.acc >>>= 8;
        this.nbits -= 8;
      }
    }
  }
  bytes() {
    if (this.nbits > 0) {
      this.grow(1);
      this.buf[this.n++] = this.acc & 0xff;
      this.acc = 0;
      this.nbits = 0;
    }
    return this.buf.subarray(0, this.n);
  }
}

/**
 * Greedy LZ77 over a 32 KB window with 3-byte hash chains. Emits one Int32
 * token per symbol: a literal is its own byte value (>= 0), a match is
 * `-((dist << 9) | len)`. Greedy, not lazy — one strategy, no heuristics, so
 * the parse is a pure function of the input and the constants above.
 */
function lz77(src) {
  const n = src.length;
  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const prev = new Int32Array(WINDOW).fill(-1);
  let cap = 4096;
  let tokens = new Int32Array(cap);
  let tn = 0;
  const push = (v) => {
    if (tn === cap) {
      cap *= 2;
      const t = new Int32Array(cap);
      t.set(tokens);
      tokens = t;
    }
    tokens[tn++] = v;
  };
  const hashAt = (i) => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & HASH_MASK;
  const insert = (i) => {
    if (i + MIN_MATCH > n) return;
    const h = hashAt(i);
    prev[i & WMASK] = head[h];
    head[h] = i;
  };
  let i = 0;
  while (i < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (i + MIN_MATCH <= n) {
      const maxLen = Math.min(MAX_MATCH, n - i);
      let cand = head[hashAt(i)];
      let chain = CHAIN_LIMIT;
      while (cand >= 0 && chain-- > 0) {
        const dist = i - cand;
        if (dist <= 0 || dist > WINDOW) break;
        if (src[cand + bestLen] === src[i + bestLen]) {
          let l = 0;
          while (l < maxLen && src[cand + l] === src[i + l]) l++;
          if (l > bestLen) {
            bestLen = l;
            bestDist = dist;
            if (l >= maxLen) break;
          }
        }
        cand = prev[cand & WMASK];
      }
    }
    if (bestLen >= MIN_MATCH) {
      push(-((bestDist << 9) | bestLen));
      const end = i + bestLen;
      for (; i < end; i++) insert(i);
    } else {
      push(src[i]);
      insert(i);
      i++;
    }
  }
  return { tokens, tn };
}

/**
 * The token stream as RFC 1951 fixed-Huffman blocks: BFINAL on the LAST block
 * only, BTYPE = 01, an end-of-block symbol (256) closing each. Blocks break at
 * the first token boundary at or past MAX_BLOCK raw bytes; back-references may
 * cross a boundary, which the format explicitly allows, so the split costs ten
 * bits per block and nothing else.
 */
function deflateFixed(raw) {
  const { tokens, tn } = lz77(raw);
  const out = new BitSink(Math.max(64, raw.length >> 3));
  let t = 0;
  for (;;) {
    let e = t;
    let blockRaw = 0;
    while (e < tn && blockRaw < MAX_BLOCK) {
      const v = tokens[e];
      blockRaw += v >= 0 ? 1 : -v & 511;
      e++;
    }
    const final = e >= tn;
    out.put(final ? 1 : 0, 1);
    out.put(1, 2); // BTYPE = 01, fixed Huffman
    for (; t < e; t++) {
      const v = tokens[t];
      if (v >= 0) {
        out.put(FIX_CODE[v], FIX_LEN[v]);
        continue;
      }
      const m = -v;
      const len = m & 511;
      const dist = m >>> 9;
      const ls = LEN_SYM[len];
      out.put(FIX_CODE[257 + ls], FIX_LEN[257 + ls]);
      if (LEN_EXTRA[ls]) out.put(len - LEN_BASE[ls], LEN_EXTRA[ls]);
      const ds = DIST_SYM[dist];
      out.put(FIX_DIST[ds], 5);
      if (DIST_EXTRA[ds]) out.put(dist - DIST_BASE[ds], DIST_EXTRA[ds]);
    }
    out.put(FIX_CODE[256], FIX_LEN[256]); // end of block
    if (final) break;
  }
  return out.bytes();
}

function adler32(buf) {
  let a = 1,
    b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// RFC 1950: CMF = 0x78 (deflate, 32K window), FLG = 0x01 (no preset dict, and
// 0x7801 % 31 === 0 so FCHECK is valid), then the deflate stream, then adler32
// over the WHOLE uncompressed stream — once, never per block.
function zlibFixed(raw) {
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(adler32(raw), 0);
  return Buffer.concat([Buffer.from([0x78, 0x01]), deflateFixed(raw), trailer]);
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

// ── palette (PNG colour type 3) ────────────────────────────────────────────
const MAX_PALETTE = 256;
/** First-seen scan order — a function of the image alone. null = > 256 colours. */
function paletteOf(src, w, h) {
  const px = w * h;
  const seen = new Map();
  const entries = [];
  const idx = new Uint8Array(px);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const key = ((src[o] << 24) | (src[o + 1] << 16) | (src[o + 2] << 8) | src[o + 3]) >>> 0;
    let v = seen.get(key);
    if (v === undefined) {
      if (entries.length >= MAX_PALETTE) return null;
      v = entries.length;
      seen.set(key, v);
      entries.push(key);
    }
    idx[i] = v;
  }
  return { idx, entries };
}
const depthFor = (n) => (n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8);

/** Indices packed high-order-bit first within each byte, rows byte-aligned. */
function packIndexed(idx, w, h, depth) {
  const per = 8 / depth;
  const rowBytes = Math.ceil(w / per);
  const raw = Buffer.alloc(h * (1 + rowBytes)); // filter byte 0 (None) per row
  for (let y = 0; y < h; y++) {
    const ro = y * (1 + rowBytes) + 1;
    for (let x = 0; x < w; x++) {
      const v = idx[y * w + x];
      if (depth === 8) raw[ro + x] = v;
      else raw[ro + ((x / per) | 0)] |= v << (8 - depth - (x % per) * depth);
    }
  }
  return raw;
}

/**
 * RGBA8 -> `{ dataUri, problems, notes }`. Deterministic by construction, and
 * it never throws: a bad frame or a short buffer comes back in `problems`.
 * `notes.encoding` names the branch taken — "palette-<depth>" or "truecolour" —
 * because a sheet silently changing encoding between builds is a re-baseline
 * nobody ordered. `notes.colours` is null when the image exceeds 256 colours.
 */
export function encodePng({ w, h, rgba }) {
  const problems = [];
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
    problems.push(`encodePng: ${w}x${h} is not a positive integer frame`);
  else if (w * h > MAX_FRAME_PX)
    problems.push(`encodePng: ${w}x${h} is ${w * h} px, over the ${MAX_FRAME_PX} px frame ceiling`);
  if (problems.length) return { dataUri: "", problems, notes: null };
  const src = asBytes(rgba);
  if (src.length < w * h * 4) {
    problems.push(`encodePng: ${src.length} bytes for a ${w}x${h} RGBA image (need ${w * h * 4})`);
    return { dataUri: "", problems, notes: null };
  }

  const pal = paletteOf(src, w, h);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[10] = 0; // compression method: deflate
  ihdr[11] = 0; // filter method 0; every row uses filter type 0 (None)
  ihdr[12] = 0; // no interlace
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  let raw;
  let encoding;
  if (pal) {
    const depth = depthFor(pal.entries.length);
    ihdr[8] = depth;
    ihdr[9] = 3; // colour type 3 = indexed
    parts.push(chunk("IHDR", ihdr));
    const plte = Buffer.alloc(pal.entries.length * 3);
    const alpha = Buffer.alloc(pal.entries.length);
    for (let i = 0; i < pal.entries.length; i++) {
      const k = pal.entries[i];
      plte[i * 3] = (k >>> 24) & 0xff;
      plte[i * 3 + 1] = (k >>> 16) & 0xff;
      plte[i * 3 + 2] = (k >>> 8) & 0xff;
      alpha[i] = k & 0xff;
    }
    parts.push(chunk("PLTE", plte));
    // tRNS only when it says something: trailing 255s are the default.
    let keep = alpha.length;
    while (keep > 0 && alpha[keep - 1] === 255) keep--;
    if (keep > 0) parts.push(chunk("tRNS", alpha.subarray(0, keep)));
    raw = packIndexed(pal.idx, w, h, depth);
    encoding = `palette-${depth}`;
  } else {
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type 6 = truecolour with alpha
    parts.push(chunk("IHDR", ihdr));
    const stride = 1 + w * 4;
    raw = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) src.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
    encoding = "truecolour";
  }
  parts.push(chunk("IDAT", zlibFixed(raw)), chunk("IEND", Buffer.alloc(0)));
  const png = Buffer.concat(parts);
  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  return {
    dataUri,
    problems,
    notes: {
      w,
      h,
      encoding,
      colours: pal ? pal.entries.length : null,
      rawBytes: raw.length,
      pngBytes: png.length,
      uriBytes: dataUri.length,
    },
  };
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

// Object.hasOwn, not a truthiness test: `BIOME_FILL["constructor"]` inherits
// Object's constructor FUNCTION and would sail past `!patternId`, putting a
// function where a pattern id belongs. A caller-supplied key is never a
// prototype key here.
const recipeOf = (patternId) =>
  typeof patternId === "string" && Object.hasOwn(TILE_RECIPES, patternId) ? TILE_RECIPES[patternId] : null;
const fillOf = (biome) =>
  typeof biome === "string" && Object.hasOwn(BIOME_FILL, biome) ? BIOME_FILL[biome] : null;

/** null when the pattern has no recipe — callers validate before they get here. */
function tileFor(patternId) {
  const r = recipeOf(patternId);
  if (!r) return null;
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

/** The one place a biome is turned into a pattern id, so both bakes agree. */
function recipeProblem(biome) {
  const patternId = fillOf(biome);
  if (!patternId) return `G-BIOME-INK: biome "${biome}" has no BIOME_FILL entry`;
  if (!recipeOf(patternId)) return `G-BIOME-INK: pattern "${patternId}" has no tile recipe`;
  return null;
}

/** One biome's tile as a PNG. `{ dataUri, w, h, problems, notes }`; never throws. */
export function bakeBiomeTexture({ biome, pxPerKm }) {
  // pxPerKm is part of the stated interface and deliberately unused: a tile is
  // authored in tile space and the <pattern> that carries it does the scaling.
  void pxPerKm;
  const problem = recipeProblem(biome);
  if (problem) return { dataUri: "", w: 0, h: 0, problems: [problem], notes: null };
  const t = tileFor(fillOf(biome));
  const png = encodePng({ w: t.w, h: t.h, rgba: t.rgba });
  return { dataUri: png.dataUri, w: t.w, h: t.h, problems: png.problems, notes: png.notes };
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
 * ONE <image> for the whole texture layer. `regions` is [{ id, biome, ring }]
 * in km; input order does not matter — regions are composited in ascending
 * `id`, so an overlap resolves the same way whatever order the caller passes.
 *
 * Returns `{ svg, problems, notes }` and never throws. `svg` is "" whenever
 * `problems` is non-empty, including when the emitted href would cross
 * libxml2's attribute ceiling — the failure that a stored-block encoder shipped
 * silently and no assertion could see. `maxHrefBytes` names that ceiling so a
 * caller with a tighter sheet budget can measure against its own number; the
 * default is the parser's, which no caller can raise.
 */
export function bakedUnderlay({ regions, pxPerKm, maxHrefBytes = XML_MAX_ATTR_BYTES }) {
  const problems = [];
  if (!Array.isArray(regions)) problems.push("bakedUnderlay: regions must be an array");
  if (!Number.isFinite(pxPerKm) || pxPerKm <= 0)
    problems.push(`bakedUnderlay: pxPerKm ${JSON.stringify(pxPerKm)} is not a positive number`);
  if (problems.length) return { svg: "", problems, notes: null };

  for (const r of regions) {
    if (!r || typeof r.id !== "string") {
      problems.push("bakedUnderlay: a region has no string id");
      continue;
    }
    if (!Array.isArray(r.ring) || r.ring.length < 3) {
      problems.push(`bakedUnderlay: region "${r.id}" has no ring of at least 3 points`);
      continue;
    }
    const bad = r.ring.some((p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]));
    if (bad) problems.push(`bakedUnderlay: region "${r.id}" has a ring point that is not a finite [x, y]`);
    const problem = recipeProblem(r.biome);
    if (problem) problems.push(problem);
  }
  if (problems.length) return { svg: "", problems, notes: null };

  let maxX = 0,
    maxY = 0;
  for (const r of regions)
    for (const [x, y] of r.ring) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  const W = Math.max(1, Math.ceil(maxX * pxPerKm));
  const H = Math.max(1, Math.ceil(maxY * pxPerKm));
  if (W * H > MAX_FRAME_PX) {
    problems.push(`bakedUnderlay: ${W}x${H} is ${W * H} px, over the ${MAX_FRAME_PX} px frame ceiling`);
    return { svg: "", problems, notes: null };
  }
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
    const t = tileFor(fillOf(r.biome));
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
  const png = encodePng({ w: W, h: H, rgba: out });
  if (png.problems.length) return { svg: "", problems: png.problems, notes: png.notes };
  const svg = `<image href="${png.dataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
  if (png.dataUri.length >= maxHrefBytes)
    problems.push(
      `bakedUnderlay: the href is ${png.dataUri.length} bytes; an attribute of ${maxHrefBytes} or more will not parse, so the sheet would not render`,
    );
  return {
    svg: problems.length ? "" : svg,
    problems,
    notes: { ...png.notes, regions: regions.length, hrefBytes: png.dataUri.length, svgBytes: svg.length },
  };
}
