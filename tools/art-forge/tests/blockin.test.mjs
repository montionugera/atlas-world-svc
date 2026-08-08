import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PLANE_DEPTH,
  SEGMENT_MIN_SEPARATION,
  buildDepthSvg,
  buildSegmentSvg,
  depthPlanesFromBrief,
  renderDepthPng,
  renderSegmentPng,
  segmentMassesFromBrief,
} from "../generate/blockin.mjs";

// The two masses the depth path collapsed: A1-ART-02's river and its far
// bank are both plane "bg", so buildDepthSvg painted both #333333 and the
// design's §1 histogram measured them as one 5.1% band. Under segment
// control they must be two colours.
const RIVER_BRIEF = {
  masses: [
    { name: "far-bank", plane: "bg", shape: "rect", rect: [0, 0.58, 1, 0.63], value: "#7d8288" },
    { name: "river", plane: "bg", shape: "rect", rect: [0, 0.63, 1, 0.7], value: "#9aa4a8" },
    { name: "millwheel-housing", plane: "mg", shape: "rect", rect: [0.46, 0.36, 0.58, 0.9], value: "#5c4a34" },
  ],
};

test("segment svg fills each mass with its own value — a river and its far bank are two colours, not one", () => {
  const svg = buildSegmentSvg({ brief: RIVER_BRIEF, width: 1280, height: 832 });
  assert.match(svg, /fill="#9aa4a8"/);
  assert.match(svg, /fill="#7d8288"/);
  assert.match(svg, /fill="#5c4a34"/);
  assert.doesNotMatch(svg, new RegExp(`<polygon[^>]*fill="${PLANE_DEPTH.bg}"`));
});

test("foreground fill is #b4b4b4 — #e8e8e8 renders as a glossy boat gunwale", () => {
  assert.equal(PLANE_DEPTH.fg, "#b4b4b4");
  assert.equal(PLANE_DEPTH.mg, "#8c8c8c");
  assert.equal(PLANE_DEPTH.bg, "#333333");
});

test("depth svg uses the profile's latent dimensions", () => {
  const svg = buildDepthSvg({
    brief: { planes: { bg: [], mg: [], fg: [] } },
    width: 1280,
    height: 832,
  });
  assert.match(svg, /width="1280"/);
  assert.match(svg, /height="832"/);
});

test("planes draw back to front so the foreground wins overlaps", () => {
  const svg = buildDepthSvg({
    brief: {
      planes: {
        bg: [{ points: "0,0 10,0 10,10" }],
        mg: [{ points: "0,0 20,0 20,20" }],
        fg: [{ points: "0,0 30,0 30,30" }],
      },
    },
    width: 1280,
    height: 832,
  });
  assert.ok(svg.indexOf(PLANE_DEPTH.bg) < svg.indexOf(PLANE_DEPTH.mg));
  assert.ok(svg.indexOf(PLANE_DEPTH.mg) < svg.indexOf(PLANE_DEPTH.fg));
});

test("canvas fill is black, NOT PLANE_DEPTH.bg — ABP-controlnet-rescue.md: 'canvas is black (sky is the farthest thing in frame)'. Using PLANE_DEPTH.bg here would collapse the sky and any bg-plane mass (e.g. a drawn 'sea') to the same tier, losing a depth level.", () => {
  const svg = buildDepthSvg({
    brief: { planes: { bg: [], mg: [], fg: [] } },
    width: 1280,
    height: 832,
  });
  const canvasRect = svg.match(/<rect[^>]*\/>/)[0];
  assert.match(canvasRect, /fill="#000000"/);
  assert.doesNotMatch(canvasRect, new RegExp(`fill="${PLANE_DEPTH.bg}"`));
});

test("depthPlanesFromBrief rejects an unknown plane by name, not with a generic crash", () => {
  assert.throws(
    () =>
      depthPlanesFromBrief({
        brief: { masses: [{ name: "typo-mass", plane: "midground", shape: "rect", rect: [0, 0, 1, 1] }] },
        width: 1280,
        height: 832,
      }),
    /typo-mass.*midground.*bg, mg, fg/s,
  );
});

test("segment canvas fill stays #000000 — unlabelled space, not a label", () => {
  const svg = buildSegmentSvg({ brief: RIVER_BRIEF, width: 1280, height: 832 });
  const canvasRect = svg.match(/<rect[^>]*\/>/)[0];
  assert.match(canvasRect, /fill="#000000"/);
});

test("segment planes draw back to front so nearer masses win overlaps", () => {
  const svg = buildSegmentSvg({ brief: RIVER_BRIEF, width: 1280, height: 832 });
  assert.ok(svg.indexOf('fill="#9aa4a8"') < svg.indexOf('fill="#5c4a34"'));
});

test("segmentMassesFromBrief names the mass whose value is missing — a silently unfilled mass becomes unlabelled space", () => {
  assert.throws(
    () => segmentMassesFromBrief({
      brief: { masses: [{ name: "valueless-mass", plane: "mg", shape: "rect", rect: [0, 0, 1, 1] }] },
      width: 1280, height: 832,
    }),
    /valueless-mass.*#rrggbb/s,
  );
});

test("segmentMassesFromBrief rejects an unknown plane by name, same as the depth path", () => {
  assert.throws(
    () => segmentMassesFromBrief({
      brief: { masses: [{ name: "typo-mass", plane: "midground", shape: "rect", rect: [0, 0, 1, 1], value: "#112233" }] },
      width: 1280, height: 832,
    }),
    /typo-mass.*midground.*bg, mg, fg/s,
  );
});

/** The N most frequent #rrggbb values in a PNG, most frequent first. */
function topColours(png, n) {
  const out = execFileSync("magick", [png, "-format", "%c", "histogram:info:-"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((line) => line.match(/^\s*(\d+):.*?(#[0-9A-Fa-f]{6})/))
    .filter(Boolean)
    .map((m) => ({ count: Number(m[1]), hex: m[2].toUpperCase() }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((c) => c.hex);
}

const MILLCROSS = JSON.parse(readFileSync(new URL("../briefs/A1-ART-02.json", import.meta.url), "utf8"));

test("GUARD: renderDepthPng still emits PLANE_DEPTH — the four measured levels 0/51/140/180, unchanged by segment control", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "blockin-guard-"));
  try {
    const out = path.join(dir, "depth.png");
    await renderDepthPng({ brief: MILLCROSS, width: 1280, height: 832, outPath: out });
    assert.deepEqual(
      new Set(topColours(out, 4)),
      new Set(["#000000", "#333333", "#8C8C8C", "#B4B4B4"]),
      "renderDepthPng was repointed at a different fill — F-026's 16-cell replication record is invalidated",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("renderSegmentPng emits the per-mass values — the river and the far bank survive rasterisation as distinct colours", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "blockin-seg-"));
  try {
    const out = path.join(dir, "segment.png");
    await renderSegmentPng({ brief: MILLCROSS, width: 1280, height: 832, outPath: out });
    const top = topColours(out, 12);
    assert.ok(top.includes("#9AA4A8"), `river colour missing; top colours were ${top.join(" ")}`);
    assert.ok(top.includes("#7D8288"), `far-bank colour missing; top colours were ${top.join(" ")}`);
    assert.ok(top.includes("#5C4A34"), `mill-wheel housing colour missing; top colours were ${top.join(" ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
