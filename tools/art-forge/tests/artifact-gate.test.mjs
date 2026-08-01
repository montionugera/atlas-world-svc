// Tests for artifact-gate.mjs.
//
// TWO TIERS, on purpose:
//
//   SYNTHETIC — fixtures built with ImageMagick at test time. These always
//   run and they prove each detector actually fires on the defect it claims
//   to detect. No images are committed.
//
//   CORPUS — the real generation output under ../out/, which is git-ignored
//   and only exists on a machine that has run the generators. These carry the
//   CALIBRATION: the exact true/false-positive counts the thresholds were
//   tuned to. They SKIP (loudly) when out/ is absent rather than silently
//   passing, because a silent skip of a calibration test is how a gate rots.
//
// The corpus regression test pins tp=15/15 and fp=13/37 exactly. If you change
// a threshold in DEFAULT_CONFIG, that test tells you what it cost. Do not
// "fix" it by editing the expected numbers without re-reading
// docs/worldbuilding/ABP-artifact-gate.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_CONFIG,
  CHECKS,
  parsePGM,
  loadGray,
  laplacianStdDev,
  detectTiling,
  inspectImage,
  writeCornerSheet,
} from "../artifact-gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "../artifact-gate.mjs");
const CORPUS = join(HERE, "../out");
const TMP = mkdtempSync(join(tmpdir(), "artifact-gate-"));

/** Build a fixture with ImageMagick and return its path. */
function fixture(name, args) {
  const out = join(TMP, name);
  execFileSync("magick", [...args, out]);
  return out;
}

// A render-like image: uniform random noise. High detail, no corner outlier,
// no periodicity — the "clean" control for every detector.
const CLEAN = fixture("clean.png", [
  "-size",
  "640x416",
  "xc:gray",
  "+noise",
  "Random",
]);
// A flat vector-art failure: a smooth gradient, almost no Laplacian energy.
const FLAT = fixture("flat.png", [
  "-size",
  "640x416",
  "gradient:#3a5a7a-#8ab0c8",
]);
// The clean control with a 4px-cell checkerboard pasted into it.
const CHECKER = fixture("checker.png", [
  CLEAN,
  "(",
  "-size",
  "64x64",
  "pattern:gray50",
  "-scale",
  "400%",
  ")",
  "-gravity",
  "NorthWest",
  "-geometry",
  "+200+150",
  "-composite",
]);

// ---------- parsePGM ----------

test("parsePGM reads dimensions and raster from ImageMagick's P5 output", () => {
  const buf = execFileSync("magick", [
    "-size",
    "7x3",
    "xc:gray",
    "-colorspace",
    "Gray",
    "-depth",
    "8",
    "pgm:-",
  ]);
  const img = parsePGM(buf);
  assert.equal(img.w, 7);
  assert.equal(img.h, 3);
  assert.equal(img.data.length, 21);
});

test("parsePGM tolerates a # comment line inside the header", () => {
  const img = parsePGM(
    Buffer.concat([
      Buffer.from("P5\n# written by a tool\n2 2\n255\n", "ascii"),
      Buffer.from([1, 2, 3, 4]),
    ]),
  );
  assert.equal(img.w, 2);
  assert.equal(img.h, 2);
  assert.deepEqual([...img.data], [1, 2, 3, 4]);
});

test("parsePGM rejects a non-P5 magic and a truncated raster", () => {
  assert.throws(() => parsePGM(Buffer.from("P3\n2 2\n255\n", "ascii")), /P5/);
  assert.throws(
    () =>
      parsePGM(
        Buffer.concat([
          Buffer.from("P5\n4 4\n255\n", "ascii"),
          Buffer.from([1]),
        ]),
      ),
    /truncated/,
  );
});

// ---------- degenerate ----------

test("laplacianStdDev separates a flat gradient from a detailed render", () => {
  const flat = laplacianStdDev(loadGray({ src: FLAT, width: 1024 }));
  const clean = laplacianStdDev(loadGray({ src: CLEAN, width: 1024 }));
  assert.ok(flat < DEFAULT_CONFIG.degenerateLaplacianMin, `flat sigma ${flat}`);
  assert.ok(
    clean > DEFAULT_CONFIG.degenerateLaplacianMin,
    `clean sigma ${clean}`,
  );
});

test("a flat gradient is FLAGGED degenerate, a noisy render is not", () => {
  const bad = inspectImage({ src: FLAT, only: ["degenerate"] });
  assert.equal(bad.ok, false);
  assert.match(bad.reasons.join("\n"), /degenerate: laplacian sigma/);

  const good = inspectImage({ src: CLEAN, only: ["degenerate"] });
  assert.equal(good.ok, true, good.reasons.join("\n"));
});

// ---------- tiling ----------

test("detectTiling fires on checkerboards from 2px to 8px cells and not on noise", () => {
  for (const cell of [2, 4, 8]) {
    const img = fixture(`chk-${cell}.png`, [
      CLEAN,
      "(",
      "-size",
      "64x64",
      "pattern:gray50",
      "-scale",
      `${cell * 100}%`,
      ")",
      "-gravity",
      "NorthWest",
      "-geometry",
      "+200+150",
      "-composite",
    ]);
    const res = detectTiling(
      loadGray({ src: img, width: null }),
      DEFAULT_CONFIG,
    );
    assert.equal(res.hit, true, `${cell}px checkerboard scored ${res.score}`);
    assert.equal(res.box.lag, cell);
  }
  const clean = detectTiling(
    loadGray({ src: CLEAN, width: null }),
    DEFAULT_CONFIG,
  );
  assert.equal(clean.hit, false, `clean noise scored ${clean.score}`);
});

test("a pasted checkerboard is FLAGGED tiling and reports where it is", () => {
  const res = inspectImage({ src: CHECKER, only: ["tiling"] });
  assert.equal(res.ok, false);
  assert.match(
    res.reasons.join("\n"),
    /tiling: axis-aligned periodic structure/,
  );
  // The paste sits at +200+150 and is 256px square; the reported block must
  // land inside it, not merely somewhere in the frame.
  const { x, y } = res.metrics.tiling.box;
  assert.ok(x >= 200 && x < 456 && y >= 150 && y < 406, `reported (${x},${y})`);
});

test("tiling analysis runs at native resolution — downscaling aliases fine artifacts away", () => {
  assert.equal(DEFAULT_CONFIG.tilingWorkingWidth, null);
  // Prove the claim rather than trusting it. A 2px-cell checkerboard is
  // detectable at native size; halve the working width and its period drops to
  // 1px, which resampling smears toward flat grey and which the lag>=2 rule
  // excludes anyway. This is exactly the artifact class a "helpful" downscale
  // would silently make invisible.
  const fine = fixture("chk-fine.png", [
    CLEAN,
    "(",
    "-size",
    "64x64",
    "pattern:gray50",
    "-scale",
    "200%",
    ")",
    "-gravity",
    "NorthWest",
    "-geometry",
    "+200+150",
    "-composite",
  ]);
  const native = detectTiling(
    loadGray({ src: fine, width: null }),
    DEFAULT_CONFIG,
  );
  assert.equal(native.hit, true, `native scored ${native.score}`);
  assert.equal(
    native.box.lag,
    2,
    "native run must recover the true 2px period",
  );

  // At 0.4x the checkerboard is gone: resampling has averaged it toward flat.
  // (Other factors are worse than useless rather than useless — 640->400
  // still "hits" but reports period 9 for a 2px artifact.)
  const downscaled = detectTiling(
    loadGray({ src: fine, width: 256 }),
    DEFAULT_CONFIG,
  );
  assert.equal(downscaled.hit, false, `downscaled scored ${downscaled.score}`);
});

// ---------- corner sheet (the human-review artifact) ----------

test("writeCornerSheet emits a 2x2 sheet wider and taller than one corner crop", () => {
  const out = join(TMP, "sheet.png");
  writeCornerSheet({ src: CLEAN, out });
  assert.ok(existsSync(out));
  const dims = execFileSync("magick", ["identify", "-format", "%w %h", out], {
    encoding: "utf8",
  })
    .split(" ")
    .map(Number);
  assert.ok(dims[0] >= 2 * DEFAULT_CONFIG.cornerNormWidth, `width ${dims[0]}`);
  assert.ok(dims[1] > 0);
});

// ---------- API + CLI contract ----------

test("inspectImage rejects a missing file and an unknown check name", () => {
  assert.throws(
    () => inspectImage({ src: join(TMP, "nope.png") }),
    /not found/,
  );
  assert.throws(
    () => inspectImage({ src: CLEAN, only: ["bogus"] }),
    /unknown check/,
  );
  assert.deepEqual(CHECKS, ["degenerate", "corner-signature", "tiling"]);
});

test("CLI exits 0 on PASS, 1 on FLAG and 2 on usage error", () => {
  const run = (args) => {
    try {
      return {
        code: 0,
        stdout: execFileSync("node", [GATE, ...args], { encoding: "utf8" }),
      };
    } catch (e) {
      return { code: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
  };
  const pass = run([CLEAN]);
  assert.equal(pass.code, 0);
  assert.match(pass.stdout, /^PASS /);
  // A PASS must never read as a clean bill of health.
  assert.match(pass.stdout, /triage, not proof/);

  const flag = run([FLAT]);
  assert.equal(flag.code, 1);
  assert.match(flag.stdout, /^FLAG /);

  assert.equal(run([]).code, 2);
  assert.equal(run([CLEAN, "--corner-sheet"]).code, 2);
});

test("CLI --json emits the metrics a human needs to adjudicate a flag", () => {
  const out = execFileSync("node", [GATE, CLEAN, "--json"], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.ok(typeof parsed.metrics.laplacianSigma === "number");
  assert.deepEqual(Object.keys(parsed.metrics.corners), [
    "NW",
    "NE",
    "SW",
    "SE",
  ]);
  assert.ok(typeof parsed.metrics.tiling.score === "number");
});

// ---------- corpus calibration ----------

const CORPUS_DIRS = ["flux", "devtest", "anchorcmp"];
const hasCorpus = CORPUS_DIRS.every((d) => existsSync(join(CORPUS, d)));

// Hand-labelled by inspecting histogram-normalised corner crops of all 52
// images. Value = the corner carrying the hallucinated signature.
const WATERMARKED = {
  "flux/ART-04-norhollow__F-base.png": "SW", // CALENER SAFE badge
  "flux/ART-04-norhollow__F-hires.png": "SW", // CALENER SAFE badge
  "devtest/ART-05-gildmark__AC-d0p65_00001_.png": "SE",
  "devtest/ART-05-gildmark__AC-d0p7_00001_.png": "SE",
  "devtest/ART-05-gildmark__AC-d0p75_00001_.png": "SE",
  "devtest/ART-05-gildmark__D-anchored-base_00001_.png": "SE",
  "devtest/ART-05-gildmark__D-anchored-hires_00001_.png": "SW", // ©Llaman Woalo
  "anchorcmp/ART-04-norhollow__D-anchored-hires_00001_.png": "SE", // ©Lorlluifurerou
  "anchorcmp/ART-04-norhollow__S-anchored-best-hires_00001_.png": "SE",
  "anchorcmp/ART-05-gildmark__S-anchored-best-base_00001_.png": "SW",
  "anchorcmp/ART-05-gildmark__S-anchored-best-hires_00001_.png": "SW", // ©Arand Alita
  "anchorcmp/ART-05-gildmark__S-anchored-d0p78-base_00001_.png": "SW",
  "anchorcmp/ART-05-gildmark__S-anchored-d0p80-base_00001_.png": "SW",
  "anchorcmp/ART-05-gildmark__S-anchored-d0p82-base_00001_.png": "SW",
  "anchorcmp/ART-05-gildmark__S-anchored-d0p85-base_00001_.png": "SW",
};

// The six arms that returned flat vector art instead of a render.
const DEGENERATE = [
  "devtest/ART-05-gildmark__A-d0p6_00001_.png",
  "devtest/ART-05-gildmark__A-d0p7_00001_.png",
  "devtest/ART-05-gildmark__A-d0p75_00001_.png",
  "devtest/ART-05-gildmark__A-d0p8_00001_.png",
  "devtest/ART-05-gildmark__A-d0p85_00001_.png",
  "devtest/ART-05-gildmark__A-d0p9_00001_.png",
];

test(
  "corpus: the ©Arand Alita watermark is caught",
  { skip: skipCorpus() },
  () => {
    const rel = "anchorcmp/ART-05-gildmark__S-anchored-best-hires_00001_.png";
    const res = inspectImage({
      src: join(CORPUS, rel),
      only: ["corner-signature"],
    });
    assert.equal(res.ok, false, "known watermark must not pass");
    assert.match(res.reasons.join("\n"), /corner-signature: SW/);
  },
);

test("corpus: the CALENER SAFE badge is caught", { skip: skipCorpus() }, () => {
  const rel = "flux/ART-04-norhollow__F-base.png";
  const res = inspectImage({
    src: join(CORPUS, rel),
    only: ["corner-signature"],
  });
  assert.equal(res.ok, false, "known watermark must not pass");
});

test(
  "corpus: a clean render passes every check",
  { skip: skipCorpus() },
  () => {
    const rel = "anchorcmp/ART-05-gildmark__S-anchored-d0p90-base_00001_.png";
    const res = inspectImage({ src: join(CORPUS, rel) });
    assert.equal(res.ok, true, res.reasons.join("\n"));
  },
);

test(
  "corpus: the degenerate check flags exactly the six failed arms",
  { skip: skipCorpus() },
  () => {
    const flagged = [];
    for (const rel of corpusFiles()) {
      const res = inspectImage({
        src: join(CORPUS, rel),
        only: ["degenerate"],
      });
      if (!res.ok) flagged.push(rel);
    }
    assert.deepEqual(flagged.sort(), [...DEGENERATE].sort());
  },
);

test(
  "corpus: corner-signature holds its calibrated 15/15 recall at 13/37 false positives",
  { skip: skipCorpus() },
  () => {
    let tp = 0;
    let fp = 0;
    const missed = [];
    for (const rel of corpusFiles()) {
      const res = inspectImage({
        src: join(CORPUS, rel),
        only: ["corner-signature"],
      });
      const flagged = !res.ok;
      if (WATERMARKED[rel]) {
        if (flagged) tp++;
        else missed.push(rel);
      } else if (flagged) fp++;
    }
    // Recall is the load-bearing half: a missed watermark ships.
    assert.deepEqual(missed, [], "watermarks the gate stopped catching");
    assert.equal(tp, 15);
    // Precision is pinned too, so a "harmless" threshold tweak that quietly
    // turns this into a flag-everything gate fails here instead of in review.
    assert.equal(fp, 13, "false-positive count drifted from calibration");
  },
);

test(
  "corpus: tiling never fires on 52 real renders (no confirmed corpus positive exists)",
  { skip: skipCorpus() },
  () => {
    for (const rel of corpusFiles()) {
      const res = inspectImage({ src: join(CORPUS, rel), only: ["tiling"] });
      assert.equal(res.ok, true, `${rel}: ${res.reasons.join(" ")}`);
    }
  },
);

function skipCorpus() {
  return hasCorpus
    ? false
    : "corpus tools/art-forge/out/{flux,devtest,anchorcmp} absent — " +
        "generator output is git-ignored, so threshold calibration is UNVERIFIED on this machine";
}

function corpusFiles() {
  const files = [];
  for (const d of CORPUS_DIRS) {
    for (const f of readdirSync(join(CORPUS, d)).sort()) {
      if (f.endsWith(".png") && !f.startsWith("_")) files.push(`${d}/${f}`);
    }
  }
  return files;
}
