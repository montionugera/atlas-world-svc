// F-047 seam-4 fix pass — a DETERMINISTIC ink measure over committed bytes.
//
// The defect this exists for: at d86f948 nothing in the repo could tell a
// blank image from a real one. Both seam-4 reviewers found it independently.
// A 1,899 B blank 512 px PNG dropped in place of the atlas thumb passed the
// storybook suite (47/0), check_render_lock, check_asset_manifest and
// check_content. The two rules Task 11 added bound a thumb only from ABOVE
// (maxThumbBytes) and pin its width; neither can see that the pixels are all
// one colour. The one guard that claimed to — render-sheet.test.mjs's
// `statSync(out).size > 10000` — cannot work either: a blank 2000 px raster
// measures 14,079 B, comfortably over its own floor.
//
// Why not "is the file big enough": because that is the proxy that already
// failed. Compressed size is a function of the encoder, the width and the
// content all at once, so any floor that admits a real small sheet also
// admits a large blank one. This reads the PIXELS.
//
// Why node:zlib is allowed here and banned in texture-bake.mjs: the ban is on
// the COMMITTED-BYTE path. texture-bake.mjs COMPRESSES, and a deflate stream's
// exact framing is an unprovable cross-version assumption when those bytes
// land inside a byte-compared artifact. This module only DECOMPRESSES, and
// nothing it returns is ever written anywhere. inflate is fully specified:
// one compressed stream has exactly one expansion on every zlib build there
// has ever been. tools/mapforge/tests/texture-bake.test.mjs:14 and
// synthetic-sheet.test.mjs:21 already import inflateSync for the same reason.
//
// Everything here answers IN-BAND — `{ error }` on anything it cannot read —
// because its callers include a gate, and a gate that throws skips finish()
// and drops every failure recorded before it.
import { inflateSync } from "node:zlib";

const SIG = "89504e470d0a1a0a";

/** Channels per pixel for each PNG colour type; undefined = not a colour type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a non-interlaced PNG to 8-bit RGB samples.
 * Returns { width, height, rgb: Uint8Array(width*height*3) } or { error }.
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) return { error: "not a Buffer" };
  if (buf.length < 33) return { error: `too short to be a PNG (${buf.length} B)` };
  if (buf.subarray(0, 8).toString("hex") !== SIG) return { error: "not a PNG (bad signature)" };

  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString("latin1");
    const data = buf.subarray(p + 8, p + 8 + len);
    if (p + 12 + len > buf.length) return { error: `truncated ${type} chunk` };
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (!width || !height) return { error: "no IHDR" };
  if (interlace !== 0) return { error: "interlaced PNGs are not supported" };
  const ch = CHANNELS[colorType];
  if (ch === undefined) return { error: `unsupported colour type ${colorType}` };
  if (colorType === 3 ? ![1, 2, 4, 8].includes(bitDepth) : bitDepth !== 8)
    return { error: `unsupported bit depth ${bitDepth} for colour type ${colorType}` };
  if (colorType === 3 && !palette) return { error: "palette image with no PLTE" };
  if (!idat.length) return { error: "no IDAT" };

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (e) {
    return { error: `IDAT does not inflate: ${e.message}` };
  }

  // Unfilter. `bpp` is bytes per pixel ROUNDED UP to 1 — the sub/paeth left
  // neighbour is a whole byte even at sub-byte depths, per PNG spec 9.2.
  const bitsPerPixel = ch * bitDepth;
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  if (raw.length < height * (stride + 1))
    return { error: `IDAT expands to ${raw.length} B, short of ${height * (stride + 1)} B` };
  const lines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? null : lines.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (ft === 0) { /* none */ }
      else if (ft === 1) v = (v + a) & 0xff;
      else if (ft === 2) v = (v + b) & 0xff;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else return { error: `unknown filter type ${ft} on row ${y}` };
      cur[x] = v;
    }
  }

  // Expand to RGB. Alpha is composited over WHITE, so a fully transparent
  // page and a white page read the same — both are blank, and both must.
  const rgb = new Uint8Array(width * height * 3);
  const sample = (row, i) => {
    if (bitDepth === 8) return row[i];
    const per = 8 / bitDepth;
    const byte = row[Math.floor(i / per)];
    const shift = 8 - bitDepth * ((i % per) + 1);
    return (byte >> shift) & ((1 << bitDepth) - 1);
  };
  for (let y = 0; y < height; y++) {
    const row = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      let r, g, b, a = 255;
      if (colorType === 0) { r = g = b = row[x]; }
      else if (colorType === 2) { r = row[x * 3]; g = row[x * 3 + 1]; b = row[x * 3 + 2]; }
      else if (colorType === 4) { r = g = b = row[x * 2]; a = row[x * 2 + 1]; }
      else if (colorType === 6) { r = row[x * 4]; g = row[x * 4 + 1]; b = row[x * 4 + 2]; a = row[x * 4 + 3]; }
      else {
        const idx = sample(row, x);
        if (idx * 3 + 2 >= palette.length) return { error: `palette index ${idx} out of range` };
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      }
      const o = (y * width + x) * 3;
      if (a === 255) { rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b; }
      else {
        const t = a / 255;
        rgb[o] = Math.round(r * t + 255 * (1 - t));
        rgb[o + 1] = Math.round(g * t + 255 * (1 - t));
        rgb[o + 2] = Math.round(b * t + 255 * (1 - t));
      }
    }
  }
  return { width, height, colorType, bitDepth, rgb };
}

/**
 * How much of an image is NOT its own background.
 *
 * `modal` is the single most common colour — for a map sheet that is the
 * parchment, for a blank page it is the whole page. `inkFraction` is the share
 * of pixels more than `tolerance` (per channel, Chebyshev) away from it, and
 * `inkRows` is how many scanlines carry at least one such pixel. Both are
 * needed: a sheet that drew only its border scores a low fraction but a high
 * row count, and a sheet with one big blot scores the reverse. `distinct` is
 * capped so a photographic input cannot cost an unbounded Set.
 *
 * Returns { error } for anything undecodable — never throws.
 */
export function inkStats(buf, { tolerance = 8, maxDistinct = 4096 } = {}) {
  const img = decodePng(buf);
  if (img.error) return { error: img.error };
  const { width, height, rgb } = img;
  const counts = new Map();
  let distinctCapped = false;
  for (let i = 0; i < width * height; i++) {
    const key = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
    const n = counts.get(key);
    if (n !== undefined) counts.set(key, n + 1);
    else if (counts.size < maxDistinct) counts.set(key, 1);
    else distinctCapped = true;
  }
  let modal = 0, best = -1;
  // Deterministic tie-break: lowest packed colour wins, so two runs on the
  // same bytes cannot disagree about which colour is the background.
  for (const [key, n] of counts)
    if (n > best || (n === best && key < modal)) { best = n; modal = key; }
  const mr = (modal >> 16) & 0xff, mg = (modal >> 8) & 0xff, mb = modal & 0xff;
  let ink = 0, inkRows = 0;
  for (let y = 0; y < height; y++) {
    let rowHasInk = false;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      if (
        Math.abs(rgb[o] - mr) > tolerance ||
        Math.abs(rgb[o + 1] - mg) > tolerance ||
        Math.abs(rgb[o + 2] - mb) > tolerance
      ) { ink++; rowHasInk = true; }
    }
    if (rowHasInk) inkRows++;
  }
  return {
    width,
    height,
    distinct: counts.size,
    distinctCapped,
    modal: `#${modal.toString(16).padStart(6, "0")}`,
    inkFraction: ink / (width * height),
    inkRowFraction: inkRows / height,
  };
}
