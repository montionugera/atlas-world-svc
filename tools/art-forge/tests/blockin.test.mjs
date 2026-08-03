import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE_DEPTH, buildDepthSvg, depthPlanesFromBrief } from "../generate/blockin.mjs";

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
