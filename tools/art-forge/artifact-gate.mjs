#!/usr/bin/env node
// Artifact gate — screens generated concept art for hallucinated watermarks,
// tiling artifacts and degenerate (flat-vector) renders before it can enter
// the committed art manifest.
//
// WHY THIS EXISTS
// ---------------
// Every model the F-024 campaign tested hallucinates signature text:
// `CALENER SAFE` on flux schnell (docs/worldbuilding/ABP-flux-eval.md), and
// `©Arand Alita` / `©Llaman Woalo` / `©Lorlluifurerou` on schnell+anchor AND
// dev+anchor alike (docs/worldbuilding/ABP-anchor-model-choice.md). The
// watermark tracks the painterly look itself, not the model, so unattended
// batch generation is unsafe without a gate.
//
// READ THIS BEFORE TRUSTING A PASS
// --------------------------------
// This is NOT a general-purpose watermark detector and it does not read text.
// It is a TRIAGE tool. Measured on the 52-image campaign corpus it caught
// 15/15 watermarked images at the cost of flagging 13/37 clean ones, and that
// operating point is a KNIFE EDGE — perturbing the neighbourhood radius from
// 6 to 4 drops recall from 15 to 8. The numbers will NOT generalise cleanly to
// new images. docs/worldbuilding/ABP-artifact-gate.md records the full
// measurement, the instability, and what the gate provably cannot do.
//
// Because of that, `writeCornerSheet()` is not optional polish — a human
// looking at the corner sheet is the actual defence. The automated checks
// exist to make that review cheaper, not to replace it.
//
// NO NEW DEPENDENCIES. Pixels come from ImageMagick (already required by
// generate/contact-sheet.sh and compare.sh) piped as binary PGM into Node,
// which does all the analysis with plain typed arrays.
//
// DELIBERATELY NOT USED: PNG file size. ABP-anchor-model-choice.md measured
// failing arms writing 1.7-1.9 MB — size is not a render-success signal and
// any check built on it is unsound.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAttempt } from "./lib/run-ledger.mjs";

const FORGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(FORGE_DIR, "runs");

/**
 * Tunable thresholds. Every value was calibrated against the campaign corpus
 * in tools/art-forge/out/{flux,devtest,anchorcmp} (52 images, 15 of them
 * carrying a hand-labelled watermark). ABP-artifact-gate.md records the
 * measured distribution each threshold sits between. Changing one without
 * re-running `npm test` in this directory is how this gate silently stops
 * working.
 */
export const DEFAULT_CONFIG = {
  // --- degenerate output (catastrophic flat-vector failure) ---
  // Laplacian standard deviation over a width-normalised greyscale image, in
  // [0,1] luminance units. Corpus: the six failed `A-*` arms measure
  // 0.0039-0.0424; every image that actually rendered measures >= 0.0574.
  degenerateWorkingWidth: 1024,
  degenerateLaplacianMin: 0.05,

  // --- corner signature (hallucinated watermark / artist mark) ---
  // Signatures cluster hard against an image edge. The corner window is
  // resized so its width is always `cornerNormWidth`, which normalises text
  // scale across 1280x832 base and 1920x1248 hires renders.
  cornerFracW: 0.34,
  cornerFracH: 0.2,
  cornerNormWidth: 512,
  cornerBlock: 8,
  // Background is the MEDIAN block energy in a (2r+1)^2 ring around each
  // block, not a single global median: a signature must stand out against
  // what is next to it, which is what makes the same threshold work on flat
  // water and on textured grass.
  cornerRing: 6,
  cornerRatio: 3.0,
  cornerAbsFloor: 0.8,
  // Text-like geometry, in blocks of `cornerBlock` px.
  cornerMinRunBlocks: 4,
  cornerMaxWidthFrac: 0.35,
  cornerMaxBandBlocks: 6,
  cornerMinAspect: 3,
  // Alternation: letters and gaps make the column-energy profile cross its own
  // mean repeatedly. A horizon line or waterline — the dominant false positive
  // — is a smooth continuous band and crosses it barely at all.
  cornerMinCrossings: 8,
  cornerMinCrossPerBlock: 0.7,
  cornerMinRatio: 2.5,

  // --- tiling / checkerboard ---
  // null working width = analyse at NATIVE resolution. Resampling wrecks this
  // detector: measured on a 2px-cell fixture, 640->256 loses it completely
  // (1.000 -> 0.115) while 640->400 still "hits" but reports period 9 for a
  // 2px artifact. Periodicity must be measured at the scale it exists at.
  tilingWorkingWidth: null,
  tilingBlock: 32,
  // Lag 1 is excluded on purpose: single-pixel alternation is ordinary
  // dithering/grain, and the corpus reaches 0.603 there. From lag 2 up the
  // corpus maximum is 0.485 while a real checkerboard scores 1.000.
  tilingMinLag: 2,
  tilingMaxLag: 12,
  tilingAntiCorr: 0.55,
  tilingMinVariance: 12,
};

const CORNERS = [
  { id: "NW", gravity: "NorthWest" },
  { id: "NE", gravity: "NorthEast" },
  { id: "SW", gravity: "SouthWest" },
  { id: "SE", gravity: "SouthEast" },
];

export const CHECKS = ["degenerate", "corner-signature", "tiling"];

// --- pixel access ------------------------------------------------------

/**
 * Run ImageMagick and parse its binary PGM (P5) output into a greyscale
 * plane. PGM rather than raw `gray:-` because its header carries the
 * dimensions, so one subprocess call yields both pixels and geometry — no
 * second `identify` that could disagree with what was actually decoded.
 * @param {string[]} args argv for `magick`, minus the output target
 * @returns {{w: number, h: number, data: Uint8Array}}
 */
function runMagickGray(args) {
  let out;
  try {
    out = execFileSync(
      "magick",
      [...args, "-colorspace", "Gray", "-depth", "8", "pgm:-"],
      { maxBuffer: 1 << 30 },
    );
  } catch (err) {
    throw new Error(
      `ImageMagick failed (is \`magick\` on PATH?): ${String(err.message).split("\n")[0]}`,
    );
  }
  return parsePGM(out);
}

/**
 * Parse a binary PGM (P5), tolerating the `#` comment lines ImageMagick may
 * emit between header tokens.
 * @param {Buffer} buf
 * @returns {{w: number, h: number, data: Uint8Array}}
 */
export function parsePGM(buf) {
  let pos = 0;
  const isSpace = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
  const nextToken = () => {
    while (pos < buf.length) {
      if (buf[pos] === 0x23) {
        while (pos < buf.length && buf[pos] !== 0x0a) pos++;
        continue;
      }
      if (isSpace(buf[pos])) {
        pos++;
        continue;
      }
      break;
    }
    const start = pos;
    while (pos < buf.length && !isSpace(buf[pos])) pos++;
    return buf.toString("ascii", start, pos);
  };

  const magic = nextToken();
  if (magic !== "P5")
    throw new Error(`expected binary PGM (P5), got "${magic}"`);
  const w = Number(nextToken());
  const h = Number(nextToken());
  const maxval = Number(nextToken());
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`malformed PGM header: ${w}x${h}`);
  }
  if (maxval !== 255)
    throw new Error(`expected 8-bit PGM, got maxval ${maxval}`);
  pos++; // exactly one whitespace byte separates header from raster
  if (buf.length - pos < w * h) throw new Error("truncated PGM raster");
  const data = new Uint8Array(buf.buffer, buf.byteOffset + pos, w * h);
  return { w, h, data };
}

/**
 * Load a greyscale plane of the whole image. `width: null` means native
 * resolution; a number downscales to at most that width (never upscales).
 * @param {{src: string, width: number|null}} params
 */
export function loadGray({ src, width }) {
  const args = [src];
  if (width) args.push("-resize", `${width}x>`);
  return runMagickGray(args);
}

/**
 * Load one corner window, resized so its width is always `normWidth`. The
 * resize is what lets a threshold calibrated on a 1280-wide base render also
 * hold on a 1920-wide hires render: signature text occupies roughly the same
 * FRACTION of the frame at both sizes, so normalising the fraction normalises
 * the stroke width in pixels.
 * @param {{src: string, gravity: string, fracW: number, fracH: number, normWidth: number}} params
 */
export function loadCorner({ src, gravity, fracW, fracH, normWidth }) {
  return runMagickGray([
    src,
    "-gravity",
    gravity,
    "-crop",
    `${Math.round(fracW * 100)}%x${Math.round(fracH * 100)}%+0+0`,
    "+repage",
    "-resize",
    `${normWidth}x`,
  ]);
}

// --- primitives --------------------------------------------------------

/**
 * Standard deviation of the 4-neighbour Laplacian, in [0,1] luminance units.
 * This is the detail-density measure ABP-anchor-model-choice.md already used
 * to rank dev against schnell (0.0289 vs 0.0154 on Norhollow) — reused rather
 * than reinvented so gate numbers and eval numbers stay comparable.
 * @param {{w: number, h: number, data: Uint8Array}} img
 * @returns {number}
 */
export function laplacianStdDev(img) {
  const { w, h, data } = img;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v =
        (data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i]) /
        255;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
}

/**
 * Sobel gradient magnitude, in input units (0-255 scale).
 * @param {{w: number, h: number, data: Uint8Array}} img
 * @returns {Float32Array} length w*h; the 1px border stays 0
 */
export function sobelMagnitude(img) {
  const { w, h, data } = img;
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1];
      const tc = data[i - w];
      const tr = data[i - w + 1];
      const ml = data[i - 1];
      const mr = data[i + 1];
      const bl = data[i + w - 1];
      const bc = data[i + w];
      const br = data[i + w + 1];
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
      g[i] = Math.hypot(gx, gy) / 4;
    }
  }
  return g;
}

/**
 * @param {ArrayLike<number>} values
 * @returns {number}
 */
export function median(values) {
  if (values.length === 0) return 0;
  const s = Float64Array.from(values).sort();
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- detector: corner signature ---------------------------------------

/**
 * Look for a hallucinated signature / watermark in one corner window.
 *
 * The signal is NOT "text" and NOT "high contrast" — the corpus holds both a
 * near-black badge on pale grass (`CALENER SAFE`, huge contrast) and green
 * text on a flat green band (`©Arand Alita`, so low-contrast it is invisible
 * until the crop is histogram-normalised). What they share is being a
 * horizontally elongated cluster of edge energy that is a strong outlier
 * against its immediate surroundings, whose internal energy alternates the way
 * letters and gaps do. So every test here is relative and structural.
 *
 * @param {{w: number, h: number, data: Uint8Array}} img corner window
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {{hit: boolean, score: number, box: object|null}}
 */
export function detectCornerSignature(img, cfg) {
  const { w, h } = img;
  const bs = cfg.cornerBlock;
  const bw = Math.floor(w / bs);
  const bh = Math.floor(h / bs);
  if (bw < cfg.cornerMinRunBlocks || bh < 2)
    return { hit: false, score: 0, box: null };

  const g = sobelMagnitude(img);

  // Per-block mean edge energy.
  const energy = new Float64Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let acc = 0;
      for (let y = by * bs; y < (by + 1) * bs; y++) {
        for (let x = bx * bs; x < (bx + 1) * bs; x++) acc += g[y * w + x];
      }
      energy[by * bw + bx] = acc / (bs * bs);
    }
  }

  // Local ring-median background + hot mask.
  const r = cfg.cornerRing;
  const background = new Float64Array(bw * bh);
  const hot = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const vals = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = bx + dx;
          const ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          vals.push(energy[ny * bw + nx]);
        }
      }
      const m = median(vals);
      const i = by * bw + bx;
      background[i] = m;
      hot[i] =
        energy[i] > Math.max(m * cfg.cornerRatio, cfg.cornerAbsFloor) ? 1 : 0;
    }
  }

  // Column energy per block-row, so any candidate bbox can be profiled.
  const colByRow = [];
  for (let by = 0; by < bh; by++) {
    const row = new Float64Array(w);
    for (let y = by * bs; y < (by + 1) * bs; y++) {
      for (let x = 0; x < w; x++) row[x] += g[y * w + x];
    }
    colByRow.push(row);
  }

  const seen = new Uint8Array(bw * bh);
  let best = { hit: false, score: 0, box: null };

  for (let start = 0; start < hot.length; start++) {
    if (!hot[start] || seen[start]) continue;
    // Flood fill (8-connectivity) this hot component.
    const queue = [start];
    seen[start] = 1;
    const members = [];
    while (queue.length) {
      const i = queue.pop();
      members.push(i);
      const cx = i % bw;
      const cy = (i / bw) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const j = ny * bw + nx;
          if (hot[j] && !seen[j]) {
            seen[j] = 1;
            queue.push(j);
          }
        }
      }
    }

    let x0 = bw;
    let x1 = -1;
    let y0 = bh;
    let y1 = -1;
    let acc = 0;
    let bgAcc = 0;
    for (const i of members) {
      const cx = i % bw;
      const cy = (i / bw) | 0;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      acc += energy[i];
      bgAcc += background[i];
    }
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;

    // Geometry: a wide, short, BOUNDED band. The width cap is what rejects
    // horizons and waterlines, which run the full width of the window.
    if (cw < cfg.cornerMinRunBlocks) continue;
    if (cw > cfg.cornerMaxWidthFrac * bw) continue;
    if (ch > cfg.cornerMaxBandBlocks) continue;
    if (cw / ch < cfg.cornerMinAspect) continue;

    // Alternation along x inside the bbox.
    const px0 = x0 * bs;
    const px1 = (x1 + 1) * bs;
    const profile = new Float64Array(px1 - px0);
    for (let by = y0; by <= y1; by++) {
      const row = colByRow[by];
      for (let x = px0; x < px1; x++) profile[x - px0] += row[x];
    }
    let pMean = 0;
    for (const v of profile) pMean += v;
    pMean /= profile.length;
    let crossings = 0;
    let above = profile[0] > pMean;
    for (let i = 1; i < profile.length; i++) {
      const now = profile[i] > pMean;
      if (now && !above) crossings++;
      above = now;
    }
    if (crossings < cfg.cornerMinCrossings) continue;
    if (crossings / cw < cfg.cornerMinCrossPerBlock) continue;

    const ratio = acc / members.length / Math.max(bgAcc / members.length, 0.15);
    if (ratio < cfg.cornerMinRatio) continue;

    if (ratio > best.score) {
      best = {
        hit: true,
        score: ratio,
        box: {
          bx: x0,
          by: y0,
          bw: cw,
          bh: ch,
          aspect: cw / ch,
          crossings,
          blocks: members.length,
        },
      };
    }
  }
  return best;
}

// --- detector: tiling / checkerboard ----------------------------------

/**
 * Detect axis-aligned periodic (checkerboard / texture-atlas) structure.
 *
 * A checkerboard of cell size c anticorrelates with itself at lag c along
 * BOTH axes at once. Natural texture — wood grain, grass, water — is
 * directional: it may anticorrelate along one axis but almost never along both
 * at the same lag. Taking the minimum of the two axis scores is what separates
 * the artifact from real material.
 *
 * @param {{w: number, h: number, data: Uint8Array}} img
 * @param {typeof DEFAULT_CONFIG} cfg
 * @returns {{hit: boolean, score: number, box: object|null}}
 */
export function detectTiling(img, cfg) {
  const { w, h, data } = img;
  const bs = cfg.tilingBlock;
  const bw = Math.floor(w / bs);
  const bh = Math.floor(h / bs);
  let best = { hit: false, score: 0, box: null };

  const blk = new Float64Array(bs * bs);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      for (let y = 0; y < bs; y++) {
        for (let x = 0; x < bs; x++) {
          const v = data[(by * bs + y) * w + bx * bs + x];
          blk[y * bs + x] = v;
          sum += v;
        }
      }
      const mean = sum / (bs * bs);
      let variance = 0;
      for (let i = 0; i < blk.length; i++) {
        blk[i] -= mean;
        variance += blk[i] * blk[i];
      }
      variance /= blk.length;
      // A flat block has no periodicity to measure and would divide by ~0.
      if (variance < cfg.tilingMinVariance) continue;

      let blockBest = 0;
      let blockLag = 0;
      for (
        let lag = cfg.tilingMinLag;
        lag <= cfg.tilingMaxLag && lag < bs;
        lag++
      ) {
        let ax = 0;
        let nx = 0;
        let ay = 0;
        let ny = 0;
        for (let y = 0; y < bs; y++) {
          for (let x = 0; x + lag < bs; x++) {
            ax += blk[y * bs + x] * blk[y * bs + x + lag];
            nx++;
          }
        }
        for (let y = 0; y + lag < bs; y++) {
          for (let x = 0; x < bs; x++) {
            ay += blk[y * bs + x] * blk[(y + lag) * bs + x];
            ny++;
          }
        }
        const rx = nx ? ax / nx / variance : 0;
        const ry = ny ? ay / ny / variance : 0;
        const s = Math.min(-rx, -ry);
        if (s > blockBest) {
          blockBest = s;
          blockLag = lag;
        }
      }
      if (blockBest > best.score) {
        best = {
          hit: blockBest >= cfg.tilingAntiCorr,
          score: blockBest,
          box: { x: bx * bs, y: by * bs, size: bs, lag: blockLag },
        };
      }
    }
  }
  if (best.score < cfg.tilingAntiCorr) best.hit = false;
  return best;
}

// --- top level ---------------------------------------------------------

/**
 * Inspect one image and return a pass/flag verdict.
 *
 * @param {object} opts
 * @param {string} opts.src        path to the image
 * @param {object} [opts.config]   overrides merged over DEFAULT_CONFIG
 * @param {string[]} [opts.only]   run only these checks (see CHECKS)
 * @returns {{ok: boolean, src: string, reasons: string[], metrics: object}}
 */
export function inspectImage(opts = {}) {
  const { src, config, only } = opts;
  if (!src) throw new Error("artifact-gate: 'src' is required");
  if (!existsSync(src))
    throw new Error(`artifact-gate: source not found: ${src}`);
  if (only) {
    const unknown = only.filter((c) => !CHECKS.includes(c));
    if (unknown.length) {
      throw new Error(`artifact-gate: unknown check(s): ${unknown.join(", ")}`);
    }
  }
  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const enabled = (name) => !only || only.includes(name);

  const reasons = [];
  const metrics = {};

  if (enabled("degenerate")) {
    const img = loadGray({ src, width: cfg.degenerateWorkingWidth });
    const sigma = laplacianStdDev(img);
    metrics.laplacianSigma = Number(sigma.toFixed(5));
    if (sigma < cfg.degenerateLaplacianMin) {
      reasons.push(
        `degenerate: laplacian sigma ${sigma.toFixed(5)} < ${cfg.degenerateLaplacianMin} — ` +
          `flat vector output, the render failed`,
      );
    }
  }

  if (enabled("corner-signature")) {
    metrics.corners = {};
    for (const corner of CORNERS) {
      const img = loadCorner({
        src,
        gravity: corner.gravity,
        fracW: cfg.cornerFracW,
        fracH: cfg.cornerFracH,
        normWidth: cfg.cornerNormWidth,
      });
      const res = detectCornerSignature(img, cfg);
      metrics.corners[corner.id] = {
        score: Number(res.score.toFixed(2)),
        box: res.box,
      };
      if (res.hit) {
        reasons.push(
          `corner-signature: ${corner.id} holds a text-like energy outlier ` +
            `(${res.box.bw}x${res.box.bh} blocks, aspect ${res.box.aspect.toFixed(1)}, ` +
            `${res.box.crossings} crossings, ${res.score.toFixed(1)}x local background) — ` +
            `possible hallucinated watermark, check the corner sheet`,
        );
      }
    }
  }

  if (enabled("tiling")) {
    const img = loadGray({ src, width: cfg.tilingWorkingWidth });
    const res = detectTiling(img, cfg);
    metrics.tiling = { score: Number(res.score.toFixed(3)), box: res.box };
    if (res.hit) {
      reasons.push(
        `tiling: axis-aligned periodic structure at (${res.box.x},${res.box.y}) ` +
          `period ${res.box.lag}px, anticorrelation ${res.score.toFixed(2)} — ` +
          `checkerboard / texture-atlas artifact`,
      );
    }
  }

  return { ok: reasons.length === 0, src, reasons, metrics };
}

/**
 * Write the human-review artifact: a histogram-normalised 2x2 sheet of all
 * four corners.
 *
 * This is deliberately NOT optional polish. The gate's automated corner check
 * is a knife-edge triage heuristic (see the header), so a PASS verdict is only
 * as trustworthy as the human who looked at this sheet. `-normalize` is
 * applied because several corpus watermarks are literally invisible without
 * it.
 *
 * @param {{src: string, out: string, config?: object}} params
 * @returns {string} the path written
 */
export function writeCornerSheet({ src, out, config }) {
  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const geom = `${Math.round(cfg.cornerFracW * 100)}%x${Math.round(cfg.cornerFracH * 100)}%+0+0`;
  // Each crop needs its OWN parenthesised group: -crop applies to every image
  // in the current list, so two crops in one group would re-crop the first.
  // Rows are then +append-ed and the two rows -append-ed, giving a 2x2 sheet
  // laid out the way the corners actually sit in the frame:
  //     NW | NE
  //     SW | SE
  const crop = (gravity) => [
    "(",
    src,
    "-gravity",
    gravity,
    "-crop",
    geom,
    "+repage",
    "-normalize",
    "-resize",
    `${cfg.cornerNormWidth}x`,
    ")",
  ];
  execFileSync("magick", [
    "(",
    ...crop("NorthWest"),
    ...crop("NorthEast"),
    "+append",
    ")",
    "(",
    ...crop("SouthWest"),
    ...crop("SouthEast"),
    "+append",
    ")",
    "-append",
    out,
  ]);
  return out;
}

// --- CLI ---------------------------------------------------------------

function printUsageAndExit() {
  console.error(
    "usage: node artifact-gate.mjs <image.png> [--json] [--corner-sheet <out.png>] [--ledger <briefId>]\n" +
      "       --ledger tees the verdict into the brief's run ledger (tools/art-forge/runs/)\n" +
      "       exits 0 on PASS, 1 on FLAG, 2 on usage/IO error",
  );
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0].startsWith("--")) printUsageAndExit();
  const src = path.resolve(argv[0]);
  const json = argv.includes("--json");
  const sheetIdx = argv.indexOf("--corner-sheet");
  const sheet = sheetIdx !== -1 ? argv[sheetIdx + 1] : null;
  if (sheetIdx !== -1 && (!sheet || sheet.startsWith("--"))) {
    console.error("--corner-sheet requires an output path");
    printUsageAndExit();
  }
  const ledgerIdx = argv.indexOf("--ledger");
  const ledgerBriefId = ledgerIdx !== -1 ? argv[ledgerIdx + 1] : null;
  if (ledgerIdx !== -1 && (!ledgerBriefId || ledgerBriefId.startsWith("--"))) {
    console.error("--ledger requires a brief id");
    printUsageAndExit();
  }

  const result = inspectImage({ src });
  if (sheet)
    result.cornerSheet = writeCornerSheet({ src, out: path.resolve(sheet) });

  // Run-ledger entry (F-050): tee the verdict — both PASS and FLAG — into
  // the brief's ledger before exiting.
  if (ledgerBriefId) {
    appendAttempt(RUNS_DIR, ledgerBriefId, {
      type: "gate",
      png: path.relative(FORGE_DIR, src),
      ok: result.ok,
      reasons: result.reasons,
      cornerSheet: result.cornerSheet
        ? path.relative(FORGE_DIR, result.cornerSheet)
        : null,
    });
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FLAG"} ${src}`);
    for (const reason of result.reasons) console.log(`  - ${reason}`);
    if (result.cornerSheet)
      console.log(`  corner sheet: ${result.cornerSheet}`);
    if (result.ok) {
      console.log(
        "  NOTE: PASS is triage, not proof. Review the corner sheet before intake.",
      );
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(`artifact-gate.mjs: ERROR: ${err.message}`);
    process.exit(2);
  }
}
