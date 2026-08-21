// Plan B Task 10 — the canary. This is the ONLY artifact in the repo built at
// the size of the world Plan C is about to generate: 13 landmasses, 160
// regions, 1,740 glyph instances, 340 labels. Every Phase 3 capability is
// proved here before it touches a live sheet.
//
// The raster half of this file is deliberately heavy. `rsvg-convert` EXITS 0
// on a PNG whose chunk CRCs are corrupt and writes a blank page — measured on
// this machine at 16,818 B for a 2000 x 2082 frame the good sheet fills with
// 2.4 MB. `status === 0 && size > 0` is therefore not a test of anything: it
// is green on the exact failure the raster gate exists to catch. What is
// asserted instead is INK — the decoded pixels — with every floor calibrated
// against three measured points and a positive control that proves the metric
// still rejects what it was calibrated on.
//
// node:zlib is used here and banned only in tools/mapforge/lib/texture-bake.mjs,
// whose output lands inside a committed, byte-compared SVG. A test decoding
// somebody else's PNG has no committed bytes to keep stable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSyntheticWorld, buildSyntheticSheet } from "../lib/synthetic-sheet.mjs";
import { GLYPHS, GLYPH_SIZE } from "../lib/glyphs.mjs";
import { RANKS } from "../lib/labels.mjs";
import { LEGEND } from "../lib/draft.mjs";
import { SHEETS } from "../render-sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "fixtures/synthetic-world/world.json"), "utf8"),
);
const LEXICON = JSON.parse(
  readFileSync(join(ROOT, "content/world/lexicon/landforms.json"), "utf8"),
);
const BUDGETS = JSON.parse(
  readFileSync(join(ROOT, "content/world/budgets.json"), "utf8"),
);
const world = () =>
  makeSyntheticWorld({ ...FIXTURE.params, lexicon: LEXICON, rankMix: FIXTURE.rankMix });

// ── the census ─────────────────────────────────────────────────────────────

test("the fixture world hits the target census exactly", () => {
  const w = world();
  assert.equal(w.regions.length, FIXTURE.expect.regions);
  assert.equal(w.instances.length, FIXTURE.expect.instances);
  assert.equal(w.labels.length, FIXTURE.expect.labels);
  assert.equal(new Set(w.regions.map((r) => r.landmass)).size, FIXTURE.expect.landmasses);
});

test("the declared rank mix sums to the declared label count, and is what is built", () => {
  const sum = Object.keys(RANKS).reduce((n, k) => n + (FIXTURE.rankMix[k] ?? 0), 0);
  assert.equal(sum, FIXTURE.params.labels, "rankMix does not sum to params.labels");
  const built = {};
  for (const l of world().labels) built[l.rank] = (built[l.rank] ?? 0) + 1;
  for (const [key, want] of Object.entries(FIXTURE.rankMix))
    if (key in RANKS) assert.equal(built[RANKS[key]] ?? 0, want, `rank ${key}`);
});

test("the mix is not stacked toward the cheap end of the ladder", () => {
  // Low rank = high priority = a BIGGER box, so "easy" is not one end of the
  // scale. What would make this canary a fake is a mix with no middle: the
  // 160 region names are what actually crowd a world chart, and they must be
  // the plurality. Asserted as a SHAPE, not as the number itself, so a future
  // re-census cannot silently gut it.
  const byRank = {};
  for (const l of world().labels) byRank[l.rank] = (byRank[l.rank] ?? 0) + 1;
  assert.ok(
    (byRank[RANKS.region] ?? 0) >= FIXTURE.params.labels * 0.4,
    `only ${byRank[RANKS.region] ?? 0} region-rank labels of ${FIXTURE.params.labels}`,
  );
  assert.ok(Object.keys(byRank).length >= 8, "fewer than 8 of the 10 ranks are exercised");
  assert.ok((byRank[RANKS.ocean] ?? 0) > 0, "no rank-1 label — the 15 px size is untested");
});

test("every catalogued landform type carries named instances", () => {
  // This is what puts checkGlyphCoverage in its STRONGEST mode. A census
  // derived from the glyphs that happened to be emitted marks a type as named
  // iff its glyph is used, which makes rule 2 ("a named type with no family")
  // unfireable by construction. Here the census comes from the instances.
  const w = world();
  assert.equal(Object.keys(w.namedCounts).length, LEXICON.length);
  const zero = Object.entries(w.namedCounts).filter(([, n]) => n === 0);
  assert.deepEqual(zero, [], `${zero.length} catalogued types have no instance`);
  assert.equal(
    Object.values(w.namedCounts).reduce((a, b) => a + b, 0),
    FIXTURE.expect.instances,
  );
});

test("makeSyntheticWorld is deterministic", () => {
  assert.deepEqual(world(), world());
});

test("makeSyntheticWorld never throws, whatever it is handed", () => {
  for (const arg of [undefined, null, {}, { regions: -1, lexicon: null }, { lexicon: [null, 3] }])
    assert.doesNotThrow(() => makeSyntheticWorld(arg));
});

test("a count too large to hold degrades to an empty census instead of killing the process", () => {
  // `Number.isInteger(n) && n > 0` has no upper bound, and `instances:
  // 5_000_000` does not throw — it exhausts the heap. A V8 OOM is a fatal
  // process abort, so buildUncached's try/catch cannot intercept it and the
  // CLI dies with no diagnosable report. Reproduced under
  // --max-old-space-size=256 before the ceiling existed.
  const huge = { ...FIXTURE.params, lexicon: LEXICON, rankMix: FIXTURE.rankMix };
  for (const key of ["regions", "instances"]) {
    const w = makeSyntheticWorld({ ...huge, [key]: 5_000_000 });
    assert.equal(w[key].length, 0, `${key} was not refused`);
  }
  const wl = makeSyntheticWorld({ ...huge, rankMix: { region: 5_000_000 } });
  assert.equal(wl.labels.length, 0, "an over-large rank mix was not refused");
});

test("POSITIVE CONTROL: G-CANARY fires when the fixture outruns the world budget", () => {
  const over = BUDGETS.landforms.maxInstances + 1;
  const f = JSON.parse(JSON.stringify(FIXTURE));
  f.params.instances = over;
  const { problems } = buildSyntheticSheet({ repoRoot: ROOT, fixture: f });
  assert.ok(
    problems.some((p) => new RegExp(`^G-CANARY: the fixture asks for ${over} landform instances`).test(p)),
    problems.join("\n").slice(0, 400),
  );
});

test("POSITIVE CONTROL: a fixture with no seed is reported, not silently redrawn", () => {
  const f = JSON.parse(JSON.stringify(FIXTURE));
  delete f.params.seed;
  const { problems } = buildSyntheticSheet({ repoRoot: ROOT, fixture: f });
  assert.ok(problems.some((p) => /^synthetic: seed is undefined/.test(p)), problems.join("\n"));
});

// ── the sheet ──────────────────────────────────────────────────────────────

test("ACCEPTANCE: the canary builds with ZERO problems at target density", () => {
  const { svg, notes, problems } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(svg.startsWith("<svg "), "not an svg");
  assert.ok(notes.some((n) => /labels 340 placed 340 dropped 0/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /instances 1740/.test(n)), notes.join(" | "));
  assert.ok(notes.some((n) => /regions 160 · landmasses 13/.test(n)), notes.join(" | "));
});

test("buildSyntheticSheet never throws and answers in-band", () => {
  for (const arg of [undefined, {}, { repoRoot: "/nonexistent-root-for-this-test" }]) {
    let r;
    assert.doesNotThrow(() => { r = buildSyntheticSheet(arg); });
    assert.ok(Array.isArray(r.problems) && Array.isArray(r.notes));
    assert.equal(typeof r.svg, "string");
  }
  assert.ok(
    buildSyntheticSheet({ repoRoot: "/nonexistent-root-for-this-test" }).problems.length > 0,
    "an unreadable repo root produced no problem",
  );
});

test("the memo notices when the content it read changes under one repo root", () => {
  // Keyed on the path alone, the first answer is returned forever: a caller
  // that reuses one --repo-root across a change to the lexicon gets a stale
  // sheet with no way to tell. Proven here by changing the file on disk
  // between two builds at the SAME root.
  const root = mkdtempSync(join(tmpdir(), "canary-memo-"));
  mkdirSync(join(root, "content/world/lexicon"), { recursive: true });
  const lexPath = join(root, "content/world/lexicon/landforms.json");
  copyFileSync(join(ROOT, "content/world/lexicon/landforms.json"), lexPath);
  copyFileSync(join(ROOT, "content/world/budgets.json"), join(root, "content/world/budgets.json"));

  const first = buildSyntheticSheet({ repoRoot: root });
  assert.deepEqual(first.problems, [], first.problems.join("\n"));

  const bent = [...LEXICON, { ...LEXICON[0], id: "s-invented-type", glyph: "g-no-such-family" }];
  writeFileSync(lexPath, JSON.stringify(bent, null, 2) + "\n");
  const second = buildSyntheticSheet({ repoRoot: root });
  assert.ok(
    second.problems.some((p) => /s-invented-type/.test(p)),
    "the memo served a stale sheet after its input changed on disk",
  );
  // And the missing family reports as a missing <symbol>, not merely as a bad
  // type — which is only true because emittedIds is scanned from the markup.
  assert.ok(
    second.problems.some((p) => /glyph "g-no-such-family" is referenced but no <symbol> was emitted/.test(p)),
    second.problems.join("\n"),
  );
});

test("the memo hands every caller its own arrays", () => {
  const a = buildSyntheticSheet({ repoRoot: ROOT });
  a.notes.push("poison");
  a.problems.push("poison");
  const b = buildSyntheticSheet({ repoRoot: ROOT });
  assert.ok(!b.notes.includes("poison"), "notes are shared across callers");
  assert.deepEqual(b.problems, []);
});

test("the map canvas is ONE baked image with no live pattern on it", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal([...svg.matchAll(/<image /g)].length, 1);
  // Everything before the last </g> is the frame: background, underlay, glyph
  // layer. The legend swatches after it are the only live patterns the sheet
  // is allowed, and they are what G-BIOME-INK's legend half is checking.
  const canvas = svg.slice(0, svg.lastIndexOf("</g>"));
  assert.equal(
    [...canvas.matchAll(/url\(#/g)].length,
    0,
    "a live pattern survived the bake onto the map canvas",
  );
  const refs = [...svg.matchAll(/fill="url\(#([^)]+)\)"/g)].map((m) => m[1]);
  assert.deepEqual(refs, LEGEND.filter((r) => r.tier <= 3).map((r) => r.pattern));
});

test("1,740 instances are drawn as <use>, not inlined paths", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal([...svg.matchAll(/<use href="#g-/g)].length, 1740);
  const symbols = [...svg.matchAll(/<symbol id="(g-[^"]+)"/g)].map((m) => m[1]);
  assert.equal(symbols.length, 40);
  assert.ok(symbols.length <= Object.keys(GLYPHS).length);
});

test("no instance is placed below the family-identity minimum", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  const sizes = new Set([...svg.matchAll(/<use href="#g-[^"]+" x="[^"]*" y="[^"]*" width="([^"]*)"/g)]
    .map((m) => Number(m[1])));
  assert.deepEqual([...sizes], [GLYPH_SIZE.min]);
  for (const s of sizes) assert.ok(s >= GLYPH_SIZE.min, `${s} px < GLYPH_SIZE.min`);
});

test("every label the sheet declares reaches the page", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal([...svg.matchAll(/<text class="lbl"/g)].length, FIXTURE.expect.labels);
});

test("the canary stays inside the committed sheet byte budget", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  const bytes = Buffer.byteLength(svg, "utf8");
  assert.ok(bytes <= BUDGETS.sheets.maxSvgBytes, `${bytes} > ${BUDGETS.sheets.maxSvgBytes}`);
});

test("the committed synthetic-density.svg is not stale", () => {
  const { svg } = buildSyntheticSheet({ repoRoot: ROOT });
  assert.equal(
    readFileSync(join(ROOT, SHEETS.synthetic.outSvg), "utf8"),
    svg,
    "run: node tools/mapforge/render-sheet.mjs --sheet synthetic",
  );
});

test("the registry entry carries a title and a zoom tier", () => {
  assert.equal(typeof SHEETS.synthetic.title, "string");
  assert.equal(SHEETS.synthetic.maxLabelRank, 10);
});

// ── the raster ─────────────────────────────────────────────────────────────

/** Minimal PNG decode: IHDR + concatenated IDAT + the five filter types. */
function decodePng(buf) {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not a PNG");
  let o = 8, w = 0, h = 0, ct = -1, depth = 0;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("latin1", o + 4, o + 8);
    if (type === "IHDR") {
      w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12);
      depth = buf[o + 16]; ct = buf[o + 17];
      assert.equal(buf[o + 20], 0, "interlaced PNG — this decoder does not handle Adam7");
    } else if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
    if (type === "IEND") break;
  }
  assert.equal(depth, 8, "expected 8 bits per channel");
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : 0;
  assert.ok(bpp, `unsupported colour type ${ct}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  assert.equal(raw.length, h * (stride + 1), "the inflated stream is not h x (filter + row)");
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[up + x] : 0;
      const c = y > 0 && x >= bpp ? px[up + x - bpp] : 0;
      const r = raw[src + x];
      let v;
      if (f === 0) v = r;
      else if (f === 1) v = r + a;
      else if (f === 2) v = r + b;
      else if (f === 3) v = r + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else assert.fail(`unknown PNG filter type ${f} on row ${y}`);
      px[dst + x] = v & 0xff;
    }
  }
  return { w, h, bpp, px };
}

/**
 * The three things a page has to have to be a drawn sheet rather than a blank
 * one. MEASURED on this machine, librsvg 2.58.1, at 2000 px:
 *
 *                       canary   underlay only   blank page
 *   distinctColours      2129         960             1
 *   inkFraction         0.8393      0.8708         0.0000
 *   darkFraction        0.0462      0.0009         0.0000
 *
 * "underlay only" is the canary with every <use> and every <text> stripped —
 * i.e. the whole glyph and label layer gone. Note that inkFraction alone
 * RISES in that case: a page can be 87% non-background and still have lost
 * every mark on it. darkFraction is the column that separates them, by 50x.
 */
function inkStats({ w, h, bpp, px }) {
  const seen = new Uint8Array(1 << 24);
  const BG = 0xf3e7ce; // C.parchment, which is also rsvg-convert's -b argument
  let distinctColours = 0, nonBg = 0, dark = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp, r = px[o], g = px[o + 1], b = px[o + 2];
    const k = (r << 16) | (g << 8) | b;
    if (!seen[k]) { seen[k] = 1; distinctColours++; }
    if (k !== BG) nonBg++;
    if (r * 299 + g * 587 + b * 114 < 150000) dark++;
  }
  return { distinctColours, inkFraction: nonBg / (w * h), darkFraction: dark / (w * h) };
}

const FLOORS = { distinctColours: 64, inkFraction: 0.4, darkFraction: 0.015 };

function assertRealInk(stats, what) {
  assert.ok(stats.distinctColours >= FLOORS.distinctColours,
    `${what}: ${stats.distinctColours} distinct colours < ${FLOORS.distinctColours} — the page is flat`);
  assert.ok(stats.inkFraction >= FLOORS.inkFraction,
    `${what}: ${(stats.inkFraction * 100).toFixed(1)}% non-background — the biome underlay did not draw`);
  assert.ok(stats.darkFraction >= FLOORS.darkFraction,
    `${what}: ${(stats.darkFraction * 100).toFixed(2)}% dark pixels — the glyph and label ink layer did not draw`);
}

const rsvg = (args) => spawnSync("rsvg-convert", args, { stdio: "pipe", maxBuffer: 1 << 26 });
const haveRsvg = () => {
  const probe = rsvg(["--version"]);
  return !probe.error && probe.status === 0;
};

test("BUDGET: rsvg-convert rasterises the canary in under 2 s at 2000 px, with real ink on it", (t) => {
  if (!haveRsvg()) { t.skip("rsvg-convert not installed"); return; }
  const dir = mkdtempSync(join(tmpdir(), "canary-"));
  const out = join(dir, "out.png");
  const svgPath = join(ROOT, SHEETS.synthetic.outSvg);
  const t0 = process.hrtime.bigint();
  const run = rsvg(["-w", String(BUDGETS.sheets.rasterWidthPx), "-b", "#f3e7ce", svgPath, "-o", out]);
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  assert.equal(run.status, 0, String(run.stderr));

  // Everything below this line exists because rsvg-convert EXITS 0 on a
  // corrupt PNG. A green status and a non-zero size prove nothing.
  const bytes = statSync(out).size;
  assert.ok(bytes > 250000, `${bytes} B — a blank page of this frame measures ~17 KB`);
  const img = decodePng(readFileSync(out));
  assert.equal(img.w, BUDGETS.sheets.rasterWidthPx, "not rasterised at the budgeted width");
  assert.ok(img.h > img.w, "the sheet is taller than it is wide — the legend band is missing");
  assertRealInk(inkStats(img), "canary");

  assert.ok(secs <= BUDGETS.sheets.maxRasterSeconds,
    `G-RASTER-BUDGET: ${secs.toFixed(2)} s > budget ${BUDGETS.sheets.maxRasterSeconds} s at ${BUDGETS.sheets.rasterWidthPx} px`);
});

test("POSITIVE CONTROL: the ink metric still rejects the blank page it was calibrated on", (t) => {
  if (!haveRsvg()) { t.skip("rsvg-convert not installed"); return; }
  // Rasterised through the SAME command, so this proves the metric can fail
  // on a real rsvg-convert output — not merely on a hand-built buffer.
  const dir = mkdtempSync(join(tmpdir(), "canary-blank-"));
  const svgPath = join(dir, "blank.svg"), out = join(dir, "blank.png");
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="1492" height="1543"/>');
  const run = rsvg(["-w", String(BUDGETS.sheets.rasterWidthPx), "-b", "#f3e7ce", svgPath, "-o", out]);
  assert.equal(run.status, 0, "rsvg-convert refused the blank page — it is supposed to exit 0");
  assert.ok(statSync(out).size > 0, "the blank page is supposed to have bytes; that is the point");
  assert.throws(
    () => assertRealInk(inkStats(decodePng(readFileSync(out))), "blank"),
    /the page is flat/,
    "the ink metric passed a blank page — it is not a test",
  );
});

test("POSITIVE CONTROL: the ink metric rejects a page whose glyph and label layer vanished", (t) => {
  if (!haveRsvg()) { t.skip("rsvg-convert not installed"); return; }
  // The failure this floor exists for is NOT a blank page — it is a page that
  // rasterises, fills 87% of itself with biome texture, and has lost every
  // mark and every name. inkFraction RISES in that state; only darkFraction
  // separates it, and without this control that floor's value is unproven.
  const dir = mkdtempSync(join(tmpdir(), "canary-noink-"));
  const svgPath = join(dir, "noink.svg"), out = join(dir, "noink.png");
  const stripped = readFileSync(join(ROOT, SHEETS.synthetic.outSvg), "utf8")
    .replace(/<use [^>]*\/>/g, "")
    .replace(/<text class="lbl"[^>]*>[^<]*<\/text>/g, "");
  writeFileSync(svgPath, stripped);
  const run = rsvg(["-w", String(BUDGETS.sheets.rasterWidthPx), "-b", "#f3e7ce", svgPath, "-o", out]);
  assert.equal(run.status, 0, String(run.stderr));
  const stats = inkStats(decodePng(readFileSync(out)));
  assert.ok(stats.inkFraction >= FLOORS.inkFraction,
    "the underlay is supposed to survive this strip — otherwise the control proves the wrong thing");
  assert.throws(
    () => assertRealInk(stats, "stripped"),
    /ink layer did not draw/,
    "the ink metric passed a sheet with no marks and no names on it",
  );
});

// ── the gates are WIRED, not decorative ────────────────────────────────────
//
// Every assertion above runs against committed data that is correct by
// construction, so each `problems.push(...check*())` line in the builder could
// be deleted with the whole suite still green — three of them measurably
// were. These hand the builder a deliberately broken fixture and assert that
// the matching gate FIRES. They are positive controls: they must keep
// detecting what they were calibrated on, or the suite has stopped covering.

const bent = (over) => {
  const f = JSON.parse(JSON.stringify(FIXTURE));
  Object.assign(f.params, over.params ?? {});
  return buildSyntheticSheet({ repoRoot: ROOT, fixture: f });
};

test("POSITIVE CONTROL: G-CANARY fires when the world is not at the declared density", () => {
  const { problems, svg } = bent({ params: { regions: 120 } });
  assert.ok(
    problems.some((p) => /^G-CANARY: the synthetic world has 120 regions, not the 160/.test(p)),
    problems.join("\n"),
  );
  assert.equal(svg, "", "a sheet with problems must not hand back bytes");
});

test("POSITIVE CONTROL: G-GLYPH's size half fires below the family-identity minimum", () => {
  const { problems } = bent({ params: { glyphSizePx: 8 } });
  assert.ok(
    problems.some((p) => /^G-GLYPH: glyph .* is placed at 8 px/.test(p)),
    problems.join("\n").slice(0, 400),
  );
});

test("POSITIVE CONTROL: G-GLYPH's coverage half fires when a family is never emitted", () => {
  // 100 instances cannot reach all 40 families, so the lexicon references a
  // glyph for which no <symbol> was written.
  const { problems } = bent({ params: { instances: 100 } });
  assert.ok(
    problems.some((p) => /^G-GLYPH: glyph "g-.*" is referenced but no <symbol> was emitted/.test(p)),
    problems.join("\n").slice(0, 400),
  );
});

test("POSITIVE CONTROL: G-LABEL fires when 340 names cannot fit the frame", () => {
  const { problems } = bent({ params: { pxPerKm: 0.35 } });
  assert.ok(
    problems.some((p) => /^G-LABEL: \d+ labels dropped/.test(p)),
    problems.join("\n").slice(0, 400),
  );
});
