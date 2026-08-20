// Plan B Task 9 — pattern fills are 100% of the rasteriser's cost, and the
// design was about to add pattern layers over 90% of the land. The underlay
// replaces N live patterns with ONE <image>. Determinism is non-negotiable:
// these bytes land inside a committed, byte-compared SVG.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TILE_RECIPES,
  bakeBiomeTexture,
  bakedUnderlay,
  encodePng,
} from "../lib/texture-bake.mjs";
import { PATTERNS, BIOME_FILL } from "../lib/draft.mjs";
import { GENERATOR_VERSION } from "../lib/version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const REGIONS = [
  { id: "r1", biome: "karst", ring: [[0, 0], [40, 0], [40, 30], [0, 30]] },
  { id: "r2", biome: "desert", ring: [[40, 0], [90, 0], [90, 40], [40, 40]] },
  { id: "r3", biome: "forest", ring: [[0, 30], [40, 30], [40, 70], [0, 70]] },
];

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

test("every pattern has a tile recipe, and every recipe has a pattern", () => {
  assert.deepEqual(Object.keys(TILE_RECIPES).sort(), Object.keys(PATTERNS).sort());
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

test("encodePng produces a valid, deterministic data URI", () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  const a = encodePng({ w: 4, h: 4, rgba });
  assert.equal(a, encodePng({ w: 4, h: 4, rgba }), "not deterministic");
  assert.match(a, /^data:image\/png;base64,/);
  const bytes = Buffer.from(a.slice("data:image/png;base64,".length), "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "PNG signature");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii"), "IEND");
});

test("encodePng reads a typed array with a non-zero byteOffset, and a plain array", () => {
  // The obvious spelling — Buffer.from(rgba.buffer, rgba.byteOffset + row, len)
  // — silently reads the WRONG WINDOW for a subarray view and silently ignores
  // its offset arguments for a plain Array (Buffer.from dispatches on the
  // argument type). Both produce a plausible PNG of the wrong picture, which is
  // the failure mode a committed-byte path can least afford.
  const backing = new Uint8ClampedArray(4 + 4 * 4 * 4).fill(7);
  const view = backing.subarray(4);
  view.fill(200);
  const plain = Array.from(view);
  const fromView = encodePng({ w: 4, h: 4, rgba: view });
  assert.equal(fromView, encodePng({ w: 4, h: 4, rgba: new Uint8ClampedArray(64).fill(200) }),
    "a non-zero byteOffset shifted the window");
  assert.equal(fromView, encodePng({ w: 4, h: 4, rgba: plain }), "a plain array took a different path");
});

test("encodePng never calls zlib — the committed-byte path is pure arithmetic", () => {
  // Determinism WITHIN one Node build is not the property that matters. These
  // bytes land inside a committed, byte-compared SVG; CI pins node-version 18
  // while this worktree runs v26, so the real question is cross-build byte
  // identity. Rather than BET on node:zlib framing being stable across majors
  // and then be unable to prove it, the encoder does not use zlib at all: it
  // hand-writes RFC 1951 stored blocks (§3.2.4) and the RFC 1950 zlib wrapper.
  // Both are fully specified bit layouts over integer arithmetic, in the same
  // family as the plan's no-transcendentals rule. This test is the enforcement.
  //
  // Comments are stripped before scanning, for the reason raster.test.mjs
  // already had to discover: the module's own header EXPLAINS the ban, and as
  // first written this assertion reddened on that explanation. A comment
  // describing the hazard must not count as committing it — otherwise the
  // cheapest way to keep the guard green is to delete the paragraph that says
  // why the guard exists.
  const src = stripComments(readFileSync(join(ROOT, "tools/mapforge/lib/texture-bake.mjs"), "utf8"));
  assert.doesNotMatch(src, /node:zlib|require\(["']zlib/,
    "zlib framing is an unprovable cross-version assumption on a committed-byte path");
  assert.doesNotMatch(src, /deflateSync|gzipSync/);
});

test("encodePng's zlib stream is a literal, byte-checkable stored block", () => {
  // A 4x4 opaque grey PNG. Every byte below is derivable from the two RFCs and
  // the PNG spec, so this literal is a specification, not a captured output:
  //   raw scanlines = 4 rows x (1 filter byte 0x00 + 16 bytes of 0xC8) = 68 B
  //   zlib wrapper  = 0x78 0x01, then ONE final stored block:
  //                   0x01, LEN=68 (0x44 0x00), NLEN=~68 (0xBB 0xFF), 68 raw bytes
  //   adler32 over the 68 raw bytes, big-endian
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255; // opaque alpha
  const bytes = Buffer.from(
    encodePng({ w: 4, h: 4, rgba }).slice("data:image/png;base64,".length), "base64");
  // Locate the IDAT payload: 4-byte length, "IDAT", payload, 4-byte CRC.
  const i = bytes.indexOf(Buffer.from("IDAT", "ascii"));
  const len = bytes.readUInt32BE(i - 4);
  const z = bytes.subarray(i + 4, i + 4 + len);
  assert.equal(z[0], 0x78, "zlib CMF (deflate, 32K window)");
  assert.equal(z[1], 0x01, "zlib FLG (no dict, fastest) — 0x7801 has a valid FCHECK");
  assert.equal(z[2], 0x01, "one FINAL STORED block");
  assert.equal(z.readUInt16LE(3), 68, "LEN = 4 rows x (1 filter + 16 px bytes)");
  assert.equal(z.readUInt16LE(5), 0xffff - 68, "NLEN = one's complement of LEN");
  assert.equal(z[7], 0x00, "row 0 filter byte is None — filters are never adaptive here");
  assert.equal(z[8], 200, "first pixel byte");
  // adler32 of the 68 raw bytes, computed here from the spec, not from the impl.
  let a = 1, b = 0;
  for (const v of z.subarray(7, 7 + 68)) { a = (a + v) % 65521; b = (b + a) % 65521; }
  assert.equal(z.readUInt32BE(7 + 68), ((b << 16) | a) >>> 0, "adler32 trailer");
  assert.equal(z.length, 2 + 5 + 68 + 4, "no second block, no padding");
});

test("the MULTI-BLOCK path sets BFINAL only on the last block and adler32s the WHOLE stream", () => {
  // A stored block carries at most 65,535 bytes (RFC 1951 §3.2.4), so the
  // frame-sized underlay ALWAYS takes this path while the 4x4 tile above never
  // does. An encoder that is right for one block and wrong for two produces a
  // truncated or mis-checksummed underlay that a lenient decoder may still
  // render — so the single-block test above proves nothing about the shape
  // this module actually emits, and this test is not a duplicate of it.
  const w = 100, h = 200;                    // raw = 200 x (1 + 400) = 80,200 B
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < rgba.length; k++) rgba[k] = (k * 37) & 0xff; // varied, deterministic
  const bytes = Buffer.from(
    encodePng({ w, h, rgba }).slice("data:image/png;base64,".length), "base64");
  const i = bytes.indexOf(Buffer.from("IDAT", "ascii"));
  const z = bytes.subarray(i + 4, i + 4 + bytes.readUInt32BE(i - 4));
  const RAW = h * (1 + w * 4);
  assert.equal(RAW, 80200);

  const raw = Buffer.alloc(RAW);
  let p = 2, rawAt = 0, blocks = 0, sawFinal = false;
  while (p < z.length - 4) {
    const bfinal = z[p];
    const blen = z.readUInt16LE(p + 1);
    assert.ok(bfinal === 0x00 || bfinal === 0x01, `block ${blocks}: header byte ${bfinal} is not a stored-block header`);
    assert.equal(z.readUInt16LE(p + 3), 0xffff - blen, `block ${blocks}: NLEN is not ~LEN`);
    assert.equal(sawFinal, false, `block ${blocks}: a block follows BFINAL=1`);
    if (bfinal === 0x01) sawFinal = true;
    z.copy(raw, rawAt, p + 5, p + 5 + blen);
    rawAt += blen;
    p += 5 + blen;
    blocks++;
  }
  assert.equal(blocks, 2, "80,200 raw bytes must be 65,535 + 14,665");
  assert.equal(sawFinal, true, "no block carried BFINAL");
  assert.equal(rawAt, RAW, "the blocks do not reconstitute the raw stream");
  assert.equal(p, z.length - 4, "trailing bytes between the last block and adler32");

  let a = 1, b = 0;                          // adler32 over the WHOLE raw stream
  for (const v of raw) { a = (a + v) % 65521; b = (b + a) % 65521; }
  assert.equal(z.readUInt32BE(z.length - 4), ((b << 16) | a) >>> 0,
    "adler32 is per-block, not over the whole uncompressed stream");
  // and the reconstituted rows really are the caller's pixels, filter byte apart
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (1 + w * 4)], 0x00, `row ${y} filter byte`);
    assert.equal(raw[y * (1 + w * 4) + 1], rgba[y * w * 4], `row ${y} first pixel byte`);
  }
});

test("bakeBiomeTexture is deterministic and covers every biome", () => {
  for (const biome of Object.keys(BIOME_FILL)) {
    const a = bakeBiomeTexture({ biome, pxPerKm: 3.5 });
    assert.equal(a.dataUri, bakeBiomeTexture({ biome, pxPerKm: 3.5 }).dataUri, biome);
    assert.ok(a.w > 0 && a.h > 0, biome);
    assert.match(a.dataUri, /^data:image\/png;base64,/);
  }
});

test("bakedUnderlay emits ONE <image> and ZERO pattern references", () => {
  const svg = bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 });
  assert.equal([...svg.matchAll(/<image /g)].length, 1, "the whole point is one blit");
  assert.equal([...svg.matchAll(/url\(#/g)].length, 0, "no live pattern may survive the bake");
  assert.match(svg, /^<image [^>]*href="data:image\/png;base64,/);
});

test("bakedUnderlay is deterministic and independent of region input order", () => {
  const a = bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 });
  assert.equal(a, bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 }));
  assert.equal(a, bakedUnderlay({ regions: [...REGIONS].reverse(), pxPerKm: 3.5 }));
});

test("bakedUnderlay actually inks each region with its OWN biome tile", () => {
  // "One <image>, zero url(#)" is also satisfied by a blank parchment rectangle.
  // Three regions with three different tiles must produce three different
  // pictures, and swapping one region's biome must change the bytes.
  const one = (biome) => bakedUnderlay({ regions: [{ id: "r1", biome, ring: REGIONS[0].ring }], pxPerKm: 3.5 });
  assert.notEqual(one("karst"), one("desert"), "two biomes baked to identical bytes");
  const swapped = [{ ...REGIONS[0], biome: "lava" }, REGIONS[1], REGIONS[2]];
  assert.notEqual(bakedUnderlay({ regions: REGIONS, pxPerKm: 3.5 }),
    bakedUnderlay({ regions: swapped, pxPerKm: 3.5 }), "changing a biome changed nothing");
});

test("a region whose biome has no fill is reported, not silently blank", () => {
  assert.throws(
    () => bakedUnderlay({ regions: [{ id: "x", biome: "not-a-biome", ring: [[0, 0], [1, 0], [1, 1]] }], pxPerKm: 3.5 }),
    /G-BIOME-INK: biome "not-a-biome" has no BIOME_FILL entry/,
    "the bake is called from inside a builder that catches — see synthetic-sheet.mjs");
});
