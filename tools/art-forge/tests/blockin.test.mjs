import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANE_DEPTH, buildDepthSvg } from "../generate/blockin.mjs";

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
