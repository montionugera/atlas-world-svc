// F-047 seam-4 fix pass — the ink measure's own suite.
//
// The rule this covers exists because at d86f948 NOTHING in the repo could
// tell a blank image from a real one, and a measure that cannot itself be
// shown to separate the two would just be the next thing that looks like a
// guard. So every assertion here is a separation: a real drawing on one side,
// a specific way of being blank on the other.
//
// node:zlib is imported here and BANNED in tools/mapforge/lib/texture-bake.mjs,
// for the reason texture-bake.test.mjs:6 and synthetic-sheet.test.mjs:15 give:
// the ban is on the committed-byte COMPRESS path. Nothing below is committed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, inkStats } from "../lib/png-ink.mjs";
import { encodePng } from "../lib/texture-bake.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAPS = join(ROOT, "game-client/assets/art/maps");

// ── fixture builders ───────────────────────────────────────────────────────

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  let c = -1;
  for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(c ^ -1, 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * An 8-bit truecolour (type 2) PNG from a `paint(x, y) -> [r,g,b]` function,
 * written with a caller-chosen row FILTER so the unfilter branches are covered
 * by a real encoder rather than by a hand-built byte string.
 */
function rgbPng({ w, h, paint, filter = 0 }) {
  const stride = w * 3;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      cur[x * 3] = r;
      cur[x * 3 + 1] = g;
      cur[x * 3 + 2] = b;
    }
    const enc = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? cur[i - 3] : 0;
      const bb = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      if (filter === 0) enc[i] = cur[i];
      else if (filter === 1) enc[i] = (cur[i] - a) & 0xff;
      else if (filter === 2) enc[i] = (cur[i] - bb) & 0xff;
      else if (filter === 3) enc[i] = (cur[i] - ((a + bb) >> 1)) & 0xff;
      else {
        const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
        enc[i] = (cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 0xff;
      }
    }
    rows.push(Buffer.concat([Buffer.from([filter]), enc]));
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PARCH = [243, 231, 206];
export const blankPng = (w = 64, h = 64) => rgbPng({ w, h, paint: () => PARCH });
const drawingPng = (w = 64, h = 64) =>
  rgbPng({
    w,
    h,
    paint: (x, y) => (((x * 7 + y * 13) % 5 === 0) ? [20 + ((x * 3) % 200), 30, 40 + ((y * 5) % 200)] : PARCH),
  });

// ── decode ─────────────────────────────────────────────────────────────────

test("decodePng reads the three committed thumbs", () => {
  for (const f of ["atlas-world", "cluster1-world", "synthetic-density"]) {
    const img = decodePng(readFileSync(join(MAPS, `${f}.png`)));
    assert.equal(img.error, undefined, `${f}: ${img.error}`);
    assert.equal(img.width, 512, f);
    assert.equal(img.rgb.length, img.width * img.height * 3, f);
  }
});

test("every PNG row filter round-trips — the unfilter is not just filter 0", () => {
  // A decoder that only ever met filter-0 rows would look correct on today's
  // committed thumbs and be wrong the day the baker changes. Each filter is
  // encoded by the fixture and must come back to the SAME pixels.
  const paint = (x, y) => [(x * 9) & 0xff, (y * 5) & 0xff, (x ^ y) & 0xff];
  const want = decodePng(rgbPng({ w: 23, h: 17, paint, filter: 0 }));
  assert.equal(want.error, undefined);
  for (const filter of [1, 2, 3, 4]) {
    const got = decodePng(rgbPng({ w: 23, h: 17, paint, filter }));
    assert.equal(got.error, undefined, `filter ${filter}: ${got.error}`);
    assert.deepEqual(
      Buffer.from(got.rgb).toString("hex"),
      Buffer.from(want.rgb).toString("hex"),
      `filter ${filter} decoded to different pixels`,
    );
  }
});

test("decodePng reads the repo's OWN palette encoder, at every packed depth", () => {
  // encodePng picks 1/2/4/8-bit indexed by colour count, so this walks the
  // sub-byte sample unpacking that no committed thumb exercises today.
  for (const colours of [2, 4, 16, 200]) {
    const w = 16, h = 4;
    const rgba = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const c = i % colours;
      rgba[i * 4] = (c * 7) & 0xff;
      rgba[i * 4 + 1] = (c * 11) & 0xff;
      rgba[i * 4 + 2] = (c * 13) & 0xff;
      rgba[i * 4 + 3] = 255;
    }
    const { dataUri, problems, notes } = encodePng({ w, h, rgba });
    assert.deepEqual(problems, []);
    const buf = Buffer.from(dataUri.slice("data:image/png;base64,".length), "base64");
    const img = decodePng(buf);
    assert.equal(img.error, undefined, `${notes.encoding}: ${img.error}`);
    assert.equal(img.width, w);
    for (let i = 0; i < w * h; i++) {
      const c = i % colours;
      assert.equal(img.rgb[i * 3], (c * 7) & 0xff, `${notes.encoding} px ${i}`);
      assert.equal(img.rgb[i * 3 + 2], (c * 13) & 0xff, `${notes.encoding} px ${i}`);
    }
  }
});

test("decodePng answers IN-BAND on everything it cannot read — it never throws", () => {
  const good = blankPng(8, 8);
  const cases = [
    [Buffer.alloc(0), /too short/],
    [Buffer.from("not a png at all, but long enough to pass the length check"), /bad signature/],
    [good.subarray(0, 40), /truncated|no IDAT|no IHDR/],
    ["a string, not a Buffer", /not a Buffer/],
  ];
  for (const [input, re] of cases) {
    const r = decodePng(input);
    assert.match(r.error ?? "", re, `${JSON.stringify(String(input).slice(0, 20))}`);
  }
  // interlaced is refused rather than silently mis-decoded
  const il = Buffer.from(good);
  il[8 + 8 + 12] = 1; // IHDR data byte 12 = interlace method
  assert.match(decodePng(il).error ?? "", /interlac/);
});

test("decodePng is deterministic — the same bytes, the same pixels", () => {
  const buf = readFileSync(join(MAPS, "atlas-world.png"));
  const h = (b) => createHash("sha256").update(Buffer.from(decodePng(b).rgb)).digest("hex");
  assert.equal(h(buf), h(buf));
});

// ── the separation the floor rests on ──────────────────────────────────────

test("a blank page scores ZERO ink, at any size", () => {
  for (const [w, h] of [[8, 8], [512, 570], [300, 400]]) {
    const st = inkStats(blankPng(w, h));
    assert.equal(st.error, undefined);
    assert.equal(st.inkFraction, 0, `${w}x${h}`);
    assert.equal(st.inkRowFraction, 0, `${w}x${h}`);
    assert.equal(st.distinct, 1, `${w}x${h}`);
  }
});

test("a real drawing scores far above the floor the budget sets", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const st = inkStats(drawingPng(64, 64));
  assert.equal(st.error, undefined);
  assert.ok(st.inkFraction > budgets.sheets.minThumbInkFraction, `${st.inkFraction}`);
  assert.ok(st.inkRowFraction > budgets.sheets.minThumbInkRowFraction, `${st.inkRowFraction}`);
  assert.ok(st.distinct > budgets.sheets.minThumbDistinctColours, `${st.distinct}`);
});

test("the three committed thumbs clear every floor, with the margin the budget claims", () => {
  const budgets = JSON.parse(readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"));
  const { minThumbInkFraction, minThumbInkRowFraction, minThumbDistinctColours } = budgets.sheets;
  for (const f of ["atlas-world", "cluster1-world", "synthetic-density"]) {
    const st = inkStats(readFileSync(join(MAPS, `${f}.png`)));
    assert.equal(st.error, undefined, `${f}: ${st.error}`);
    assert.ok(st.inkFraction >= minThumbInkFraction, `${f} ink ${st.inkFraction}`);
    assert.ok(st.inkRowFraction >= minThumbInkRowFraction, `${f} rows ${st.inkRowFraction}`);
    assert.ok(st.distinct >= minThumbDistinctColours, `${f} colours ${st.distinct}`);
  }
});

test("BYTE SIZE cannot do this job — the measure and the proxy disagree by construction", () => {
  // This is the finding, made mechanical. render-sheet.test.mjs guarded a
  // rendered sheet with `size > 10000`; a blank raster clears that floor as
  // soon as the page is big enough, because a bigger blank page is a bigger
  // file. If this ever stops holding, the byte proxy has become defensible and
  // this whole module is redundant — which is worth being told about.
  const blankBig = blankPng(2000, 2226);
  const inkedSmall = drawingPng(40, 40);
  assert.ok(blankBig.length > 10000, `a blank 2000 px page is ${blankBig.length} B`);
  assert.ok(inkedSmall.length < blankBig.length, "the inked page is the smaller file");
  assert.equal(inkStats(blankBig).inkFraction, 0);
  assert.ok(inkStats(inkedSmall).inkFraction > 0.1);
});

test("ink is measured against the image's OWN background, not against white", () => {
  // A parchment sheet is not white and a night sheet is not either. The modal
  // colour is the background by definition, so the same drawing on any ground
  // scores the same.
  const on = (bg) =>
    inkStats(rgbPng({ w: 40, h: 40, paint: (x, y) => ((x + y) % 6 === 0 ? [10, 10, 10] : bg) }));
  const a = on([243, 231, 206]);
  const b = on([12, 18, 40]);
  assert.equal(a.inkFraction, b.inkFraction);
  assert.equal(a.modal, "#f3e7ce");
  assert.equal(b.modal, "#0c1228");
});

test("the second blank mode: ink in ONE band clears the fraction but not the rows", () => {
  // A corner watermark over an empty map. 6 of 60 rows carry every pixel of
  // ink, so the fraction is respectable and the row share is not — which is
  // the whole reason there are two numbers.
  const st = inkStats(rgbPng({ w: 60, h: 60, paint: (x, y) => (y < 6 ? [10, 10, 10] : PARCH) }));
  assert.ok(st.inkFraction >= 0.02, `${st.inkFraction}`);
  assert.ok(st.inkRowFraction < 0.5, `${st.inkRowFraction}`);
});

test("the third blank mode: a flat two-colour placeholder clears both shares", () => {
  // Half the page black. Ink 0.5, rows 1.0 — and 2 colours, which is not a map.
  const st = inkStats(rgbPng({ w: 60, h: 60, paint: (x) => (x < 30 ? [0, 0, 0] : PARCH) }));
  assert.ok(st.inkFraction >= 0.02 && st.inkRowFraction >= 0.5);
  assert.equal(st.distinct, 2);
});

test("near-background noise is not ink — the tolerance is real", () => {
  // JPEG-ish ringing or a 1-LSB dither must not read as a drawing.
  const st = inkStats(rgbPng({ w: 40, h: 40, paint: (x, y) => [243 + ((x + y) % 3) - 1, 231, 206] }));
  assert.equal(st.inkFraction, 0);
  assert.ok(st.distinct > 1, "the pixels really do differ; they are just not ink");
});

test("inkStats answers in-band on undecodable input, like every gate helper", () => {
  const r = inkStats(Buffer.from("still not a png, but long enough to reach the signature test"));
  assert.match(r.error, /bad signature/);
  assert.equal(r.inkFraction, undefined);
});
