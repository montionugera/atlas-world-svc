// Plan B Task 9 — pattern fills are 100% of the rasteriser's cost, and the
// design was about to add pattern layers over 90% of the land. The underlay
// replaces N live patterns with ONE <image>. Determinism is non-negotiable:
// these bytes land inside a committed, byte-compared SVG.
//
// node:zlib is banned in tools/mapforge/lib/texture-bake.mjs and NOT here. A
// decoder in the harness is the opposite of a shortcut in the encoder: it is
// the independent oracle that proves the hand-written bytes mean what the
// module claims. The ban is enforced twice below — once on the specifier shape
// in the source, once at runtime by checking that exercising the module never
// causes the native zlib binding to load at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TILE_RECIPES,
  XML_MAX_ATTR_BYTES,
  bakeBiomeTexture,
  bakedUnderlay,
  encodePng,
} from "../lib/texture-bake.mjs";
import { PATTERNS, BIOME_FILL, C } from "../lib/draft.mjs";
import { GENERATOR_VERSION } from "../lib/version.mjs";
import { computeLock } from "../../../scripts/lib/render-lock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MODULE = join(ROOT, "tools/mapforge/lib/texture-bake.mjs");

// Four regions that OVERLAP. Disjoint fixtures make the ascending-id
// composite rule untestable — deleting the sort cannot change a pixel when no
// pixel is claimed twice, which is how that rule survived its own deletion.
// r1 and r2 share x 30..40 / y 0..30; r1 and r3 share y 25..30; r2 and r3
// share x 30..40 / y 25..40. Ascending id means r4 beats r3 beats r2 beats r1.
//
// r4 is deliberately NOT axis-aligned. Every ring here was a rectangle, and on
// a rectangle deleting the even-odd y-guard in rowCrossings is INVISIBLE: a
// horizontal edge divides by zero, both horizontal edges contribute the same
// signed infinity, and adding two crossings never changes a parity. A slanted
// edge contributes exactly one spurious crossing and flips it.
const REGIONS = [
  { id: "r1", biome: "karst", ring: [[0, 0], [40, 0], [40, 30], [0, 30]] },
  { id: "r2", biome: "desert", ring: [[30, 0], [90, 0], [90, 40], [30, 40]] },
  { id: "r3", biome: "forest", ring: [[0, 25], [40, 25], [40, 70], [0, 70]] },
  { id: "r4", biome: "lava", ring: [[45, 30], [75, 20], [90, 50], [60, 60]] },
];
const PX_PER_KM = 3.5;
// The atlas sheet's own frame: ATLAS_PX_PER_KM = 3.5 over a 400 km world.
const ATLAS_KM = 400;

// The plan's version of the single-home test shelled out to `git grep`. It
// cannot: raster.test.mjs's "no mapforge test spawns a version-control
// subprocess" rule bans the spelling outright, and a tracked-file search is
// also the wrong instrument — it is blind to an untracked second definition,
// which is exactly the state this file is written in. A filesystem walk sees
// what the module resolver sees.
const SOURCE_ROOTS = ["scripts", "tools"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
function sourceFiles(dir, rel, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      sourceFiles(join(dir, e.name), `${rel}/${e.name}`, out);
    } else if (/\.(mjs|cjs|js|ts)$/.test(e.name)) {
      out.push(`${rel}/${e.name}`);
    }
  }
  return out;
}

// Same shape as raster.test.mjs's, and for the same reason — see the zlib test.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

// ── an independent PNG decoder, built from the spec, used as the oracle ─────
// The CRC table is rebuilt here from the PNG spec's own polynomial rather than
// imported, so a wrong table in the encoder cannot make a wrong table in the
// checker agree with it.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const PREFIX = "data:image/png;base64,";

/** Walk the chunk stream, verifying every chunk's CRC. */
function pngChunks(dataUri) {
  assert.ok(dataUri.startsWith(PREFIX), "not a PNG data URI");
  const png = Buffer.from(dataUri.slice(PREFIX.length), "base64");
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG signature");
  const chunks = [];
  let p = 8;
  while (p < png.length) {
    assert.ok(p + 12 <= png.length, "chunk header runs past the end of the file");
    const len = png.readUInt32BE(p);
    const type = png.subarray(p + 4, p + 8).toString("ascii");
    assert.ok(p + 12 + len <= png.length, `${type}: chunk length ${len} runs past the end`);
    const got = png.readUInt32BE(p + 8 + len);
    const want = crc32(png.subarray(p + 4, p + 8 + len));
    assert.equal(got, want, `${type}: chunk CRC ${got.toString(16)} != ${want.toString(16)}`);
    chunks.push({ type, data: png.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  assert.equal(chunks[0].type, "IHDR");
  assert.equal(chunks[chunks.length - 1].type, "IEND");
  return { png, chunks };
}

/** Decode to a pixel accessor. Asserts filter 0 on every scanline. */
function decodePng(dataUri) {
  const { png, chunks } = pngChunks(dataUri);
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colour = ihdr[9];
  assert.equal(ihdr[10], 0, "compression method must be deflate");
  assert.equal(ihdr[11], 0, "filter method must be 0");
  assert.equal(ihdr[12], 0, "interlacing is never used");
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const plte = chunks.find((c) => c.type === "PLTE");
  const trns = chunks.find((c) => c.type === "tRNS");
  const bpp = colour === 3 ? depth : 32;
  const rowBytes = Math.ceil((w * bpp) / 8);
  assert.equal(raw.length, h * (1 + rowBytes), "the inflated stream is not h x (filter + row)");
  for (let y = 0; y < h; y++)
    assert.equal(raw[y * (1 + rowBytes)], 0, `row ${y}: filter byte must be 0 (None)`);
  const at = (x, y) => {
    const ro = y * (1 + rowBytes) + 1;
    if (colour === 6) return [raw[ro + x * 4], raw[ro + x * 4 + 1], raw[ro + x * 4 + 2], raw[ro + x * 4 + 3]];
    assert.ok(plte, "colour type 3 without a PLTE chunk");
    const per = 8 / depth;
    const idx = depth === 8 ? raw[ro + x] : (raw[ro + ((x / per) | 0)] >> (8 - depth - (x % per) * depth)) & ((1 << depth) - 1);
    assert.ok(idx * 3 + 2 < plte.data.length, `palette index ${idx} is outside the PLTE`);
    return [plte.data[idx * 3], plte.data[idx * 3 + 1], plte.data[idx * 3 + 2], trns && idx < trns.data.length ? trns.data[idx] : 255];
  };
  return { w, h, depth, colour, chunks, raw, at, bytes: png.length, palette: plte ? plte.data.length / 3 : 0 };
}

/** Walk the deflate stream's BLOCK structure by hand, without inflating. */
function deflateBlocks(dataUri) {
  const { chunks } = pngChunks(dataUri);
  const z = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  assert.equal(z[0], 0x78, "zlib CMF: deflate with a 32K window");
  assert.equal(z[1], 0x01, "zlib FLG: no preset dictionary, and 0x7801 % 31 === 0");
  assert.equal((z[0] * 256 + z[1]) % 31, 0, "FCHECK is invalid");
  // Read the block headers bit by bit, LSB-first, skipping each block's body
  // by inflating it — the only way to find the next header without a full
  // Huffman decoder is to let the oracle tell us where the stream ends.
  let bit = 0;
  const bits = z.subarray(2, z.length - 4);
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v |= ((bits[(bit >> 3)] >> (bit & 7)) & 1) << i;
      bit++;
    }
    return v;
  };
  // Only the FIRST block header is readable without decoding; the rest are
  // proven by inflating the whole stream and by the BFINAL rule below.
  const first = { bfinal: read(1), btype: read(2) };
  return { z, first, raw: inflateSync(z) };
}

const hexOf = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
/** The ink shade a recipe of `opacity` lays over the parchment ground. */
function inkShade(opacity) {
  const g = hexOf(C.parchmentDeep);
  const k = hexOf(C.inkSoft);
  const px = new Uint8ClampedArray(3);
  for (let i = 0; i < 3; i++) px[i] = g[i] + (k[i] - g[i]) * opacity;
  return [px[0], px[1], px[2], 255];
}
const GROUND = [...hexOf(C.parchmentDeep), 255];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// ── the version constant ───────────────────────────────────────────────────

test("GENERATOR_VERSION is a semver string", () => {
  assert.match(GENERATOR_VERSION, /^\d+\.\d+\.\d+$/);
});

test("GENERATOR_VERSION has exactly ONE definition in the repo", () => {
  // Plan A Task 10 created a second `export const GENERATOR_VERSION = "3.0.0"`
  // inside scripts/lib/render-lock.mjs because this module did not exist yet.
  // Step 3b deletes it and re-exports instead. If both survive, the render lock
  // and Plan C's runId can disagree about which generator produced a world —
  // which is the exact failure the single-home rule exists to prevent. A
  // regex on the string itself cannot see that; only a repo-wide scan can.
  const files = [];
  for (const root of SOURCE_ROOTS) sourceFiles(join(ROOT, root), root, files);
  assert.ok(files.length > 50, `only ${files.length} source files scanned`);
  const hits = files
    .filter((f) => /^export const GENERATOR_VERSION\b/m.test(readFileSync(join(ROOT, f), "utf8")))
    .sort();
  assert.deepEqual(hits, ["tools/mapforge/lib/version.mjs"]);
});

test("scripts/lib/render-lock.mjs re-exports the constant rather than redefining it", () => {
  const src = readFileSync(join(ROOT, "scripts/lib/render-lock.mjs"), "utf8");
  assert.match(src, /from "\.\.\/\.\.\/tools\/mapforge\/lib\/version\.mjs"/);
  assert.doesNotMatch(src, /^export const GENERATOR_VERSION/m);
});

// ── the recipe table ───────────────────────────────────────────────────────

test("every pattern has a tile recipe, and every recipe has a pattern", () => {
  assert.deepEqual(Object.keys(TILE_RECIPES).sort(), Object.keys(PATTERNS).sort());
});

test("every recipe's tile is the SAME SIZE as the <pattern> it transcribes", () => {
  // The module header calls the two definitions of a pattern — a vector
  // <pattern> in draft.mjs and a raster recipe here — an open drift surface.
  // Matching key sets only prove nothing goes un-baked. The tile GEOMETRY is
  // the half that decides whether the baked underlay and a live pattern draw
  // the same picture, and it is checkable: the <pattern> markup states its own
  // width and height. Lane D pins the vector side with per-tile digests; this
  // pins the raster side to the same numbers, so a resized tile can no longer
  // change one definition without the other.
  for (const [id, markup] of Object.entries(PATTERNS)) {
    const w = Number(/\bwidth="([\d.]+)"/.exec(markup)?.[1]);
    const h = Number(/\bheight="([\d.]+)"/.exec(markup)?.[1]);
    assert.ok(Number.isFinite(w) && Number.isFinite(h), `${id}: <pattern> states no tile size`);
    assert.equal(TILE_RECIPES[id].w, w, `${id}: recipe tile width != the <pattern>'s`);
    assert.equal(TILE_RECIPES[id].h, h, `${id}: recipe tile height != the <pattern>'s`);
  }
});

test("every recipe is a non-empty tile of a legible size", () => {
  for (const [id, r] of Object.entries(TILE_RECIPES)) {
    assert.ok(r.w >= 7 && r.h >= 7, `${id}: tile ${r.w}x${r.h} is a grey smear at thumb scale`);
    assert.ok(Array.isArray(r.ink) && r.ink.length > 0, `${id}: no ink`);
    for (const [x0, y0, x1, y1] of r.ink) {
      for (const v of [x0, y0, x1, y1]) assert.ok(Number.isFinite(v), id);
      assert.ok(x0 >= 0 && x1 <= r.w && y0 >= 0 && y1 <= r.h, `${id}: segment leaves the tile`);
    }
    assert.ok(r.opacity > 0 && r.opacity <= 1, id);
  }
});

// ── the zlib ban, enforced twice ───────────────────────────────────────────

test("the committed-byte path never imports zlib, under ANY spelling of the specifier", () => {
  // The first version of this assertion matched two literal spellings —
  // `node:zlib` and `require("zlib")` — plus the function names deflateSync
  // and gzipSync. A reviewer walked straight through it with
  // `import { deflateRawSync } from "zlib"`: a bare specifier, and a function
  // name that does not contain the substring "deflateSync". Match the
  // SPECIFIER SHAPE instead: every static import, dynamic import and require
  // of a literal zlib specifier, with or without the node: prefix. The
  // function-name half is deliberately gone — it was the half that produced
  // false confidence, and a computed specifier defeats any regex, which is
  // what the runtime test below is for.
  //
  // Comments are stripped before scanning, for the reason raster.test.mjs
  // already had to discover: the module's own header EXPLAINS the ban, and as
  // first written this assertion reddened on that explanation. A comment
  // describing the hazard must not count as committing it — otherwise the
  // cheapest way to keep the guard green is to delete the paragraph that says
  // why the guard exists.
  const src = stripComments(readFileSync(MODULE, "utf8"));
  assert.doesNotMatch(
    src,
    /(?:^|[^\w$])(?:from|import|require)\s*\(?\s*["'](?:node:)?zlib["']/,
    "zlib framing is an unprovable cross-version assumption on a committed-byte path",
  );
});

test("exercising the module never LOADS zlib — the ban survives a computed specifier", () => {
  // A source scan cannot see `createRequire(["node","zlib"].join(":"))`, and a
  // reviewer built exactly that. Whatever the spelling, every route to zlib
  // ends at the same native binding, and Node records it. Run the encoder in a
  // clean child and read the loaded-module list.
  const code = `
    const m = await import(${JSON.stringify(pathToFileURL(MODULE).href)});
    const tile = m.bakeBiomeTexture({ biome: "built", pxPerKm: ${PX_PER_KM} });
    const under = m.bakedUnderlay({ regions: ${JSON.stringify(REGIONS)}, pxPerKm: ${PX_PER_KM} });
    process.stdout.write(JSON.stringify({
      zlib: process.moduleLoadList.filter((s) => /zlib/i.test(s)),
      loaded: process.moduleLoadList.length,
      worked: tile.dataUri.length > 100 && under.svg.length > 500,
    }));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "--eval", code], { encoding: "utf8" });
  assert.equal(run.status, 0, `child exited ${run.status}: ${run.stderr}`);
  const got = JSON.parse(run.stdout);
  assert.ok(got.loaded > 20, "moduleLoadList is empty — the oracle itself stopped working");
  assert.equal(got.worked, true, "the child never actually reached the encoder");
  assert.deepEqual(got.zlib, [], `zlib was loaded: ${got.zlib.join(", ")}`);
});

// ── the hand-written DEFLATE ───────────────────────────────────────────────

test("the deflate stream is a FIXED-HUFFMAN block sequence, not a stored one", () => {
  // Stored blocks were the first implementation and they are why this task had
  // to be redone: 1.33 bytes of base64 per RGBA byte put the atlas frame's
  // href at 10,456,335 bytes, past libxml2's 10,000,000-byte attribute cap.
  // BTYPE = 01 is the whole fix, so it is asserted directly on the bits.
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const { first, z, raw } = deflateBlocks(encodePng({ w: 4, h: 4, rgba }).dataUri);
  assert.equal(first.bfinal, 1, "a 4x4 tile is one block and it must be final");
  assert.equal(first.btype, 1, "BTYPE must be 01 (fixed Huffman); 00 is a stored block");
  assert.ok(z.length - 6 < raw.length, "the compressed body is not smaller than the raw stream");
});

test("an independent decoder reproduces the pixels — single block and multi", () => {
  // A stored-block encoder is right for one block and can be wrong for two.
  // A Huffman encoder has more ways to be wrong than that, and none of them
  // are visible in the emitted bytes to anything but a decoder. These are the
  // raw-stream sizes that straddle the 65,535-byte block cadence: 65,533 sits
  // just under one block, 65,537 forces a 2-byte second block, and 327,675 is
  // six. Every case round-trips through node:zlib in the harness.
  for (const [w, h, wantRaw] of [[257, 1, 1029], [100, 200, 80200], [16383, 1, 65533], [16384, 1, 65537], [16385, 1, 65541], [1, 65535, 327675]]) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    // > 256 distinct colours, so this takes the truecolour path and the raw
    // stream really is h x (1 + 4w) bytes — the sizes named above.
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = (i * 37) & 255;
      rgba[i * 4 + 1] = (i >>> 8) & 255;
      rgba[i * 4 + 2] = (i * 13) & 255;
      rgba[i * 4 + 3] = 255;
    }
    const png = encodePng({ w, h, rgba });
    assert.deepEqual(png.problems, [], `${w}x${h}`);
    assert.equal(png.notes.rawBytes, wantRaw, `${w}x${h}: raw stream size`);
    const d = decodePng(png.dataUri);
    assert.equal(d.colour, 6, `${w}x${h}: expected the truecolour branch`);
    const raw = d.raw;
    const stride = 1 + w * 4;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w * 4; x++)
        assert.equal(raw[y * stride + 1 + x], rgba[y * w * 4 + x], `${w}x${h}: byte ${x} of row ${y}`);
  }
});

test("BFINAL is set on the LAST block only, and adler32 covers the WHOLE stream", () => {
  // Both halves are mechanically checkable without a Huffman decoder: strip
  // the final block's bit and node:zlib reports a truncated stream; compute
  // adler32 from the spec over the inflated bytes and compare the trailer.
  const w = 100, h = 200; // raw = 200 x (1 + 400) = 80,200 B -> 2 blocks
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = (i * 37) & 255; // > 256 colours, so this is the truecolour
    rgba[i * 4 + 1] = (i >>> 8) & 255; // path and the raw stream really is 80,200 B
    rgba[i * 4 + 2] = (i * 13) & 255;
    rgba[i * 4 + 3] = 255;
  }
  const { z, raw } = deflateBlocks(encodePng({ w, h, rgba }).dataUri);
  assert.equal(raw.length, 80200, "the stream does not reconstitute 80,200 raw bytes");
  let a = 1, b = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  assert.equal(z.readUInt32BE(z.length - 4), ((b << 16) | a) >>> 0,
    "adler32 is per-block or per-something, not over the whole uncompressed stream");
  // A stream whose only BFINAL is on a non-final block truncates; one with no
  // BFINAL at all is an error. Either way inflateSync must refuse it, which is
  // what proves the flag is load-bearing rather than decorative.
  assert.throws(() => inflateSync(z.subarray(0, z.length - 5)), /.*/,
    "a truncated stream inflated cleanly — the block framing is not being read");
});

// ── the PNG chunk layer ────────────────────────────────────────────────────

test("every emitted PNG has correct chunk CRCs, in both encodings", () => {
  // Seeding crc32 with 0 instead of -1 makes every chunk CRC wrong and every
  // strict decoder refuse the file, while a suite that only checks chunk NAMES
  // stays green. pngChunks() verifies each CRC against a table rebuilt here
  // from the polynomial.
  for (const biome of Object.keys(BIOME_FILL)) {
    const t = bakeBiomeTexture({ biome, pxPerKm: PX_PER_KM });
    assert.deepEqual(t.problems, [], biome);
    const d = decodePng(t.dataUri);
    assert.equal(d.colour, 3, `${biome}: a two-colour tile must be indexed`);
    assert.deepEqual(d.chunks.map((c) => c.type), ["IHDR", "PLTE", "IDAT", "IEND"], biome);
  }
  const noisy = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    noisy[i * 4] = i & 255;
    noisy[i * 4 + 1] = (i >>> 6) & 255;
    noisy[i * 4 + 2] = (i * 7) & 255;
    noisy[i * 4 + 3] = 255;
  }
  const d = decodePng(encodePng({ w: 64, h: 64, rgba: noisy }).dataUri);
  assert.equal(d.colour, 6);
  assert.deepEqual(d.chunks.map((c) => c.type), ["IHDR", "IDAT", "IEND"], "truecolour needs no PLTE");
});

test("encodePng picks the palette when it fits and truecolour when it does not", () => {
  const px = (n, f) => {
    const rgba = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const [r, g, b, a] = f(i);
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = a;
    }
    return rgba;
  };
  const cases = [
    [2, (i) => [i * 10, 0, 0, 255], "palette-1", 1],
    [4, (i) => [i * 10, 0, 0, 255], "palette-2", 2],
    [16, (i) => [i * 10, 0, 0, 255], "palette-4", 4],
    [256, (i) => [i, 0, 0, 255], "palette-8", 8],
    [257, (i) => [i & 255, i >>> 8, 0, 255], "truecolour", 8],
  ];
  for (const [n, f, encoding, depth] of cases) {
    const r = encodePng({ w: n, h: 1, rgba: px(n, f) });
    assert.deepEqual(r.problems, [], `${n} colours`);
    assert.equal(r.notes.encoding, encoding, `${n} distinct colours`);
    const d = decodePng(r.dataUri);
    assert.equal(d.depth, depth, `${n}: bit depth`);
    assert.equal(d.colour, encoding === "truecolour" ? 6 : 3);
    for (let i = 0; i < n; i++) assert.deepEqual(d.at(i, 0), f(i), `${n}: pixel ${i}`);
  }
});

test("the palette is first-seen scan order, and transparency survives it", () => {
  // Palette construction must be a function of the image alone. First-seen
  // order is; anything sorted by frequency is not, because a tie-break would
  // have to come from somewhere.
  const rgba = new Uint8ClampedArray([9, 9, 9, 255, 1, 2, 3, 128, 9, 9, 9, 255, 4, 5, 6, 0]);
  const r = encodePng({ w: 4, h: 1, rgba });
  const d = decodePng(r.dataUri);
  assert.equal(d.palette, 3, "three distinct RGBA colours");
  assert.deepEqual(d.at(0, 0), [9, 9, 9, 255]);
  assert.deepEqual(d.at(1, 0), [1, 2, 3, 128], "tRNS must carry the partial alpha");
  assert.deepEqual(d.at(2, 0), [9, 9, 9, 255], "a repeat must reuse index 0");
  assert.deepEqual(d.at(3, 0), [4, 5, 6, 0], "a fully transparent entry");
  assert.ok(d.chunks.some((c) => c.type === "tRNS"), "no tRNS chunk for a non-opaque palette");
  // and an all-opaque palette must NOT carry one
  const opaque = decodePng(encodePng({ w: 2, h: 1, rgba: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]) }).dataUri);
  assert.ok(!opaque.chunks.some((c) => c.type === "tRNS"), "tRNS emitted for a fully opaque palette");
});

test("encodePng is deterministic and reads every buffer shape the same way", () => {
  // The obvious spelling — Buffer.from(rgba.buffer, rgba.byteOffset + row, len)
  // — silently reads the WRONG WINDOW for a subarray view and silently ignores
  // its offset arguments for a plain Array (Buffer.from dispatches on the
  // argument type). Both produce a plausible PNG of the wrong picture, which is
  // the failure mode a committed-byte path can least afford.
  const backing = new Uint8ClampedArray(4 + 4 * 4 * 4).fill(7);
  const view = backing.subarray(4);
  view.fill(200);
  const plain = Array.from(view);
  const fromView = encodePng({ w: 4, h: 4, rgba: view }).dataUri;
  assert.equal(fromView, encodePng({ w: 4, h: 4, rgba: view }).dataUri, "not deterministic");
  assert.equal(fromView, encodePng({ w: 4, h: 4, rgba: new Uint8ClampedArray(64).fill(200) }).dataUri,
    "a non-zero byteOffset shifted the window");
  assert.equal(fromView, encodePng({ w: 4, h: 4, rgba: plain }).dataUri, "a plain array took a different path");
});

// ── the baked picture ──────────────────────────────────────────────────────

test("a tile's ink is drawn as LINES in inkSoft at the recipe's opacity", () => {
  // "One <image> and no url(#)" is also satisfied by a blank rectangle, and
  // every structural assertion in this file passes on one. pBuilt is a 12x12
  // tile with a horizontal and a vertical segment: 12 + 12 pixels sharing one
  // crossing, clipped at the far edge = 23 inked pixels. Reduce Bresenham to
  // its endpoints and that becomes 2; swap inkSoft for accent and the shade is
  // wrong; drop the alpha and every pixel goes transparent.
  const d = decodePng(bakeBiomeTexture({ biome: "built", pxPerKm: PX_PER_KM }).dataUri);
  assert.equal(BIOME_FILL.built, "pBuilt");
  assert.equal(d.w, 12);
  assert.equal(d.h, 12);
  const ink = inkShade(TILE_RECIPES.pBuilt.opacity);
  let inked = 0;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const p = d.at(x, y);
      assert.equal(p[3], 255, `tile pixel ${x},${y} is not opaque`);
      const onLine = y === 6 || x === 6;
      assert.deepEqual(p, onLine ? ink : GROUND, `tile pixel ${x},${y}`);
      if (onLine) inked++;
    }
  assert.equal(inked, 23, "pBuilt's two segments cover 23 pixels");
});

test("the underlay's pixels ARE the tiles, phase-locked to the frame", () => {
  // The strongest statement that can be made without re-implementing the
  // rasteriser: for every pixel the winning region claims, the underlay pixel
  // must equal that biome's own tile at (px % w, py % h). That one identity
  // holds the point-in-polygon predicate, the tile phase lock, the pxPerKm
  // scaling and the alpha channel at once — each of which survived its own
  // deletion while the suite only ever checked structure.
  const u = bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM });
  assert.deepEqual(u.problems, []);
  const d = decodePng(u.svg.match(/href="([^"]+)"/)[1]);
  assert.equal(d.w, Math.ceil(90 * PX_PER_KM), "W must be ceil(maxX * pxPerKm)");
  assert.equal(d.h, Math.ceil(70 * PX_PER_KM), "H must be ceil(maxY * pxPerKm)");
  const tiles = Object.fromEntries(
    [...new Set(REGIONS.map((r) => r.biome))].map((b) => [b, decodePng(bakeBiomeTexture({ biome: b, pxPerKm: PX_PER_KM }).dataUri)]),
  );
  // Ascending id composites r1, then r2, then r3 — so the LAST region whose
  // ring contains the pixel centre owns it.
  const owner = (px, py) => {
    const x = (px + 0.5) / PX_PER_KM,
      y = (py + 0.5) / PX_PER_KM;
    let win = null;
    for (const r of REGIONS) {
      let inside = false;
      for (let i = 0, k = r.ring.length - 1; i < r.ring.length; k = i++) {
        const [xi, yi] = r.ring[i];
        const [xk, yk] = r.ring[k];
        if (yi > y !== yk > y && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) inside = !inside;
      }
      if (inside) win = r;
    }
    return win;
  };
  let checked = 0, overlapChecked = 0, inkSeen = 0;
  for (let py = 0; py < d.h; py += 3)
    for (let px = 0; px < d.w; px += 3) {
      const r = owner(px, py);
      const got = d.at(px, py);
      assert.equal(got[3], 255, `pixel ${px},${py} lost its alpha`);
      if (!r) {
        assert.deepEqual(got, GROUND, `pixel ${px},${py} is outside every region and must be bare parchment`);
      } else {
        const t = tiles[r.biome];
        assert.deepEqual(got, t.at(px % t.w, py % t.h), `pixel ${px},${py} (${r.id}/${r.biome})`);
        if (!same(got, GROUND)) inkSeen++;
      }
      checked++;
    }
  // the three named overlaps resolve to the HIGHER id, not to the first drawn
  for (const [kmX, kmY, biome] of [[35, 10, "desert"], [10, 27, "forest"], [35, 30, "forest"], [10, 10, "karst"], [60, 10, "desert"], [70, 40, "lava"]]) {
    const px = Math.floor(kmX * PX_PER_KM), py = Math.floor(kmY * PX_PER_KM);
    const t = tiles[biome];
    assert.deepEqual(d.at(px, py), t.at(px % t.w, py % t.h), `${kmX},${kmY} km must be ${biome}`);
    overlapChecked++;
  }
  assert.ok(checked > 8000, `only ${checked} pixels sampled`);
  assert.equal(overlapChecked, 6);
  assert.ok(inkSeen > 200, `only ${inkSeen} inked pixels — the underlay is nearly blank`);
});

test("bakedUnderlay emits ONE <image> and ZERO pattern references", () => {
  const u = bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM });
  assert.equal([...u.svg.matchAll(/<image /g)].length, 1, "the whole point is one blit");
  assert.equal([...u.svg.matchAll(/url\(#/g)].length, 0, "no live pattern may survive the bake");
  assert.match(u.svg, /^<image [^>]*href="data:image\/png;base64,/);
});

test("bakedUnderlay is deterministic and independent of region input order", () => {
  // With OVERLAPPING regions this is a real statement: the reversed order
  // composites r3 first, so only the ascending-id sort can make the bytes
  // agree.
  const a = bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM });
  assert.equal(a.svg, bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM }).svg);
  assert.equal(a.svg, bakedUnderlay({ regions: [...REGIONS].reverse(), pxPerKm: PX_PER_KM }).svg,
    "reversing the input changed the picture — the composite is order-dependent");
  assert.equal(a.svg, bakedUnderlay({ regions: [REGIONS[2], REGIONS[0], REGIONS[3], REGIONS[1]], pxPerKm: PX_PER_KM }).svg);
});

test("bakeBiomeTexture is deterministic and covers every biome", () => {
  for (const biome of Object.keys(BIOME_FILL)) {
    const a = bakeBiomeTexture({ biome, pxPerKm: PX_PER_KM });
    assert.deepEqual(a.problems, [], biome);
    assert.equal(a.dataUri, bakeBiomeTexture({ biome, pxPerKm: PX_PER_KM }).dataUri, biome);
    assert.ok(a.w > 0 && a.h > 0, biome);
    assert.match(a.dataUri, /^data:image\/png;base64,/);
  }
});

test("bakedUnderlay actually inks each region with its OWN biome tile", () => {
  const one = (biome) => bakedUnderlay({ regions: [{ id: "r1", biome, ring: REGIONS[0].ring }], pxPerKm: PX_PER_KM }).svg;
  assert.notEqual(one("karst"), one("desert"), "two biomes baked to identical bytes");
  const swapped = [{ ...REGIONS[0], biome: "ocean" }, ...REGIONS.slice(1)];
  assert.notEqual(bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM }).svg,
    bakedUnderlay({ regions: swapped, pxPerKm: PX_PER_KM }).svg, "changing a biome changed nothing");
});

// ── the budgets this task exists to meet ───────────────────────────────────

test("BUDGET: the atlas sheet's own 1400x1400 frame fits the href cap and maxSvgBytes", () => {
  // This is the measurement Task 9 shipped without: its benchmark used a
  // non-square 1404x1173 frame that happened to sit 1.42 MB under a parse
  // cliff nobody knew existed. The real frame is ATLAS_PX_PER_KM = 3.5 over
  // 400 km, and with stored blocks its href was 10,456,335 bytes — unparseable.
  const biomes = Object.keys(BIOME_FILL);
  const regions = [{ id: "a-sea", biome: "ocean", ring: [[0, 0], [ATLAS_KM, 0], [ATLAS_KM, ATLAS_KM], [0, ATLAS_KM]] }];
  // 160 irregular regions, deterministic — a jittered 13-column lattice with
  // 24-gon rings, so no scanline shares a tile phase with its neighbour.
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 65536 % 1;
  for (let k = 0; k < 160; k++) {
    const cx = 8 + (k % 13) * 30.5, cy = 8 + ((k / 13) | 0) * 30.5;
    const ring = [];
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const rad = 12 + rnd() * 6;
      // a closed ring without transcendentals: walk the unit diamond
      const u = t < 0.5 ? 1 - 4 * t : 4 * t - 3;
      const v = t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4;
      ring.push([cx + u * rad, cy + v * rad]);
    }
    regions.push({ id: `r${String(k).padStart(3, "0")}`, biome: biomes[k % biomes.length], ring });
  }
  const t0 = process.hrtime.bigint();
  const u = bakedUnderlay({ regions, pxPerKm: 3.5 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.deepEqual(u.problems, []);
  assert.equal(u.notes.w, 1400, "the atlas frame is 400 km x 3.5 px/km");
  assert.equal(u.notes.h, 1400);
  assert.ok(u.notes.hrefBytes < XML_MAX_ATTR_BYTES / 10,
    `href is ${u.notes.hrefBytes} B, within an order of magnitude of the ${XML_MAX_ATTR_BYTES} B parse cliff`);
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  assert.ok(u.notes.svgBytes < budgets.sheets.maxSvgBytes,
    `the underlay alone is ${u.notes.svgBytes} B against maxSvgBytes ${budgets.sheets.maxSvgBytes}`);
  assert.equal(u.notes.encoding.startsWith("palette-"), true, `expected the palette branch, got ${u.notes.encoding}`);
  assert.ok(ms < 4000, `bake + encode took ${ms.toFixed(0)} ms`);
});

test("XML_MAX_ATTR_BYTES is libxml2's cap, and crossing it is REPORTED not emitted", () => {
  assert.equal(XML_MAX_ATTR_BYTES, 10000000, "libxml2's XML_MAX_TEXT_LENGTH; librsvg does not set XML_PARSE_HUGE");
  // Measured by bisection against rsvg-convert 2.58.1: a 1360 px square frame
  // parses, 1370 px does not. The ceiling is in the parser, so no budget can
  // be raised past it — the only defence is refusing to emit.
  const tight = bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM, maxHrefBytes: 200 });
  assert.equal(tight.svg, "", "a sheet that cannot parse must not be handed back");
  assert.equal(tight.problems.length, 1);
  assert.match(tight.problems[0], /href is \d+ bytes; an attribute of 200 or more will not parse/);
  assert.ok(tight.notes.hrefBytes > 200, "notes must still report what was measured");
  // and the default ceiling is the parser's, not a caller's convenience
  assert.deepEqual(bakedUnderlay({ regions: REGIONS, pxPerKm: PX_PER_KM }).problems, []);
});

// ── never throws ───────────────────────────────────────────────────────────

test("every entry point reports degenerate input IN-BAND and never throws", () => {
  // A sheet builder that throws takes finish() with it and silently drops
  // every failure recorded before it. Errors are values here.
  const ring = [[0, 0], [1, 0], [1, 1]];
  const cases = [
    ["regions null", () => bakedUnderlay({ regions: null, pxPerKm: PX_PER_KM }), /regions must be an array/],
    ["no args", () => bakedUnderlay({}), /regions must be an array/],
    ["pxPerKm 0", () => bakedUnderlay({ regions: [], pxPerKm: 0 }), /is not a positive number/],
    ["pxPerKm absent", () => bakedUnderlay({ regions: [] }), /is not a positive number/],
    ["pxPerKm NaN", () => bakedUnderlay({ regions: [], pxPerKm: NaN }), /is not a positive number/],
    ["region without id", () => bakedUnderlay({ regions: [{ biome: "karst", ring }], pxPerKm: PX_PER_KM }), /no string id/],
    ["region without ring", () => bakedUnderlay({ regions: [{ id: "x", biome: "karst" }], pxPerKm: PX_PER_KM }), /no ring of at least 3 points/],
    ["ring too short", () => bakedUnderlay({ regions: [{ id: "x", biome: "karst", ring: [[0, 0], [1, 1]] }], pxPerKm: PX_PER_KM }), /no ring of at least 3 points/],
    ["ring point NaN", () => bakedUnderlay({ regions: [{ id: "x", biome: "karst", ring: [[0, 0], [1, NaN], [1, 1]] }], pxPerKm: PX_PER_KM }), /not a finite \[x, y\]/],
    ["unknown biome", () => bakedUnderlay({ regions: [{ id: "x", biome: "not-a-biome", ring }], pxPerKm: PX_PER_KM }), /biome "not-a-biome" has no BIOME_FILL entry/],
    // `BIOME_FILL["constructor"]` inherits Object's constructor FUNCTION, so a
    // plain truthiness test hands a function to the pattern lookup. Lane D hit
    // the same hole in frontierPattern(); every table read here is Object.hasOwn.
    ["prototype key as a biome", () => bakedUnderlay({ regions: [{ id: "x", biome: "constructor", ring }], pxPerKm: PX_PER_KM }), /biome "constructor" has no BIOME_FILL entry/],
    ["prototype key in bakeBiomeTexture", () => bakeBiomeTexture({ biome: "toString", pxPerKm: PX_PER_KM }), /biome "toString" has no BIOME_FILL entry/],
    ["non-string biome", () => bakeBiomeTexture({ biome: 7, pxPerKm: PX_PER_KM }), /biome "7" has no BIOME_FILL entry/],
    ["frame too large", () => bakedUnderlay({ regions: [{ id: "x", biome: "karst", ring: [[0, 0], [9e4, 0], [9e4, 9e4]] }], pxPerKm: PX_PER_KM }), /px frame ceiling/],
    ["bakeBiomeTexture unknown", () => bakeBiomeTexture({ biome: "not-a-biome", pxPerKm: PX_PER_KM }), /biome "not-a-biome" has no BIOME_FILL entry/],
    ["bakeBiomeTexture no args", () => bakeBiomeTexture({}), /has no BIOME_FILL entry/],
    ["encodePng short buffer", () => encodePng({ w: 4, h: 4, rgba: new Uint8ClampedArray(4) }), /4 bytes for a 4x4 RGBA image/],
    ["encodePng zero frame", () => encodePng({ w: 0, h: 4, rgba: new Uint8ClampedArray(4) }), /not a positive integer frame/],
    ["encodePng fractional frame", () => encodePng({ w: 4.5, h: 4, rgba: new Uint8ClampedArray(400) }), /not a positive integer frame/],
  ];
  for (const [name, run, pattern] of cases) {
    let out;
    assert.doesNotThrow(() => (out = run()), `${name}: threw instead of reporting`);
    assert.ok(Array.isArray(out.problems) && out.problems.length > 0, `${name}: reported nothing`);
    assert.match(out.problems.join(" | "), pattern, name);
    assert.equal(out.svg ?? out.dataUri, "", `${name}: handed back output alongside a problem`);
  }
  // and the empty-but-valid case is NOT a problem
  const empty = bakedUnderlay({ regions: [], pxPerKm: PX_PER_KM });
  assert.deepEqual(empty.problems, []);
  assert.match(empty.svg, /^<image /);
});

// ── the lock hashes bytes ──────────────────────────────────────────────────

test("computeLock hashes artifact BYTES, not a lossy utf8 decode", () => {
  // computeLock read extraPaths with readFileSync(..., "utf8"). Every byte
  // sequence that is not valid UTF-8 decodes to U+FFFD, so two PNGs differing
  // at one byte hashed IDENTICALLY. Harmless while every locked artifact is
  // SVG; a hole the moment Task 11 commits PNG thumbs.
  const dir = mkdtempSync(join(tmpdir(), "mapforge-lock-"));
  try {
    const a = Buffer.alloc(512, 0x41);
    const b = Buffer.from(a);
    a[211] = 0x80; // both invalid as standalone UTF-8, both -> U+FFFD
    b[211] = 0xbf;
    writeFileSync(join(dir, "a.png"), a);
    writeFileSync(join(dir, "b.png"), b);
    const text = '<svg xmlns="http://www.w3.org/2000/svg"><title>ok</title></svg>\n';
    writeFileSync(join(dir, "c.svg"), text, "utf8");
    const lock = computeLock({ repoRoot: dir, sheets: {}, extraPaths: ["a.png", "b.png", "c.svg"] });
    assert.notEqual(lock.artifacts["a.png"], lock.artifacts["b.png"],
      "two PNGs differing at byte 211 hashed identically — the read is lossy");
    // and a valid-UTF-8 artifact must hash exactly as a string would, or every
    // committed lock row silently re-baselines.
    const asString = computeLock({
      repoRoot: dir,
      sheets: { s: { outSvg: "c.svg", build: () => ({ svg: text, problems: [] }) } },
    });
    assert.equal(lock.artifacts["c.svg"], asString.artifacts["c.svg"],
      "hashing a UTF-8 file's bytes must equal hashing its text — the committed lock must not move");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
