# Town Concept Art — Segment Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Give the block-in pipeline a second control renderer that fills each mass with its own authored `value` colour, prove it on Millcross, then author the two missing block-ins and re-author Embervale so all six cluster-1 town concepts can be regenerated and judged against a written acceptance bar — dropping `placeholder-quality` only from the towns that actually pass.

**Architecture.** `tools/art-forge/generate/blockin.mjs` gains `renderSegmentPng()` as a *sibling* of `renderDepthPng()` — same masses, same back-to-front `PLANE_ORDER`, same `-blur 0x6` rasterisation, but filled from `mass.value` instead of `PLANE_DEPTH[mass.plane]`. `forge.config.json`'s `environment` profile gains a `segment` control block alongside the byte-identical depth `controlNet` block, and `env.mjs` gains a `--control` selector that picks both the control block and the renderer. Everything downstream — the graph, the hires pass, the manifest — is unchanged except that `SetUnionControlNetType` receives `segment` and the control PNG carries eight labels instead of three tiers.

**Tech Stack.** Node 22 ESM (`node --test`, no framework), ImageMagick `magick` for SVG→PNG rasterisation and histogram readback, ComfyUI 0.24.1 on mont-pc over an SSH tunnel (FLUX.1-schnell fp8 + `flux-controlnet-union-pro-2.0`), JSON briefs under `tools/art-forge/briefs/`, `game-client/assets/art/art-manifest.json` gated by `scripts/check_asset_manifest.mjs`.

---

## Global Constraints

- **Every command in this plan runs from the repo root** (`/Users/pasitnusso/workspace/repos/atlas-world-svc/.claude/worktrees/_release`), branch `release/1.7`.
- **NEVER a bare `cd` in a command block** — it persists into the next line and breaks it. Use an explicit `( cd tools/art-forge && … )` subshell or `npm --prefix tools/art-forge`.
- **NEVER write `$?` after a pipe** — it reports the last stage, not the command. Redirect to a file, then read the file, then read `$?` on the very next line.
- **The art-forge test command is** `( cd tools/art-forge && node --test tests/*.test.mjs )`. That package has its own `package.json` with a `test` script; `scripts/precheck.sh` (Gate 1) runs exactly this suite at line 152, so a red art-forge suite blocks ship.
- **The GPU tunnel must be up before any generation:** `ssh -f -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100`, then ComfyUI answers at `http://127.0.0.1:8188`. ComfyUI binds `--listen 127.0.0.1` on mont-pc — the Tailscale address is *not* directly reachable and never was.
- **`renderDepthPng`, `PLANE_DEPTH`, `CANVAS_FILL`, and `profiles.environment.controlNet` must stay byte-identical.** F-026's 16-cell replication record, its measured 0.30–0.40 depth strength window, and DR-002 appendix B all rest on them. Add siblings; do not mutate. A `git diff` on those four spans must be empty at every commit in this plan.
- **The duplication between `buildDepthSvg` and `buildSegmentSvg` is deliberate and must NOT be de-duplicated** in any refactor step. Factoring them into one parameterised helper puts the frozen depth path one edit away from the segment path — exactly the silent-invalidation failure the design's §2 danger callout names.
- **The `placeholder-quality` tag drops per town, never in bulk.** One manifest edit per town, each justified by that town's own recorded verdict.
- **A town that fails its acceptance bar keeps its current image AND its `placeholder-quality` tag.** A partial pass is a legitimate, correct end state — better than six replacements the budget scores as met.
- **Measured facts, do not re-measure unless you doubt one:** base generation on `A1-ART-02` at seed 12345 took 218 s, exit 0, 1.5 MB PNG, no OOM at **3.9 GB VRAM free of 24**. The depth control map renders **four levels only** — `0` sky 54.5%, `51` all bg 5.1%, `140` all mg 18.4%, `180` all fg 7.5%. `SetUnionControlNetType` accepts `auto, openpose, depth, hed/pidi/scribble/ted, canny/lineart/anime_lineart/mlsd, normal, segment, tile, repaint`. Only four briefs exist: `A1-ART-02`, `-03`, `-06`, `-07`.
- **Image generation is not deterministic and not unit-testable.** Tasks 3 and 7 produce images and therefore **do not use red-green TDD**. Their "verify" step is defined in the task itself. **Do not write tests that assert anything about image content.**
- **The segment strength is unknown.** F-026's 0.30–0.40 was depth-measured and does not transfer. Task 3 finds it empirically; Tasks 5–8 consume the value Task 3 commits.

---

## File Structure

| File | Responsibility | State |
| --- | --- | --- |
| `tools/art-forge/generate/blockin.mjs` | Adds `SEGMENT_MIN_SEPARATION`, `segmentMassesFromBrief`, `buildSegmentSvg`, `renderSegmentPng`. Depth path untouched. | modified |
| `tools/art-forge/tests/blockin.test.mjs` | Segment unit tests + the guard proving `renderDepthPng` still emits `PLANE_DEPTH`. | modified |
| `tools/art-forge/forge.config.json` | Adds `profiles.environment.segment` + `profiles.environment.control`. Depth `controlNet` block byte-identical. | modified |
| `tools/art-forge/tests/forge-config.test.mjs` | Pins the segment block's shape and the depth block's frozen values. | modified |
| `tools/art-forge/generate/env.mjs` | Adds `CONTROL_BLOCK`/`CONTROL_RENDERER` maps, `resolveControl`, `resolveStrength`, `controlOutputId`; `--control` flag; per-control local + uploaded control filenames. | modified |
| `tools/art-forge/tests/env-graph.test.mjs` | Control selection, strength resolution, filename-collision tests. | modified |
| `tools/art-forge/tests/briefs.test.mjs` | New. Data contract over `briefs/*.json`: non-empty `mustShow`/`mustNotShow`, and pairwise `value` separation ≥ `SEGMENT_MIN_SEPARATION`. | created |
| `tools/art-forge/briefs/A1-ART-02.json` | Millcross: acceptance lists; `value` nudges to clear the separation floor. | modified |
| `tools/art-forge/briefs/A1-ART-03.json` | Embervale: acceptance lists; **masses re-authored asymmetric**; `value`s re-spaced. | modified |
| `tools/art-forge/briefs/A1-ART-04.json` | Norhollow block-in, derived from `A1-geography-cluster1.md` §6 + §9. | created |
| `tools/art-forge/briefs/A1-ART-05.json` | Gildmark block-in, derived from `A1-geography-cluster1.md` §6 + §9. | created |
| `tools/art-forge/briefs/A1-ART-06.json` | Rooktide: acceptance lists; `value`s re-spaced. | modified |
| `tools/art-forge/briefs/A1-ART-07.json` | Cindervast: acceptance lists; `value`s re-spaced. | modified |
| `game-client/assets/art/concept/A1-ART-0{2..7}.png` | Replaced **only** for towns that pass their bar. | modified (per town) |
| `game-client/assets/art/art-manifest.json` | Per-town `note`/`gen` update and `placeholder-quality` removal, passing towns only. | modified |
| `docs/worldbuilding/ABP-segment-control.md` | The record: segment-vs-depth comparison, the measured strength ladder, and six per-town verdicts with seed and settings. | created |

---

## Task 1: `renderSegmentPng` and the depth-unchanged guard

**Files:**
- modify `tools/art-forge/generate/blockin.mjs`
- modify `tools/art-forge/tests/blockin.test.mjs`

**Interfaces:**

```js
// tools/art-forge/generate/blockin.mjs — all new exports

/**
 * Minimum Chebyshev (max-per-channel) distance required between any two
 * mass `value` colours in one brief. A segment control image is a LABEL
 * map: two masses painted within a few levels of each other are one label
 * to the encoder, which is the exact failure the depth path had.
 */
export const SEGMENT_MIN_SEPARATION = 24;

/** "#9aa4a8" -> [154, 164, 168]. Throws on anything that is not #rrggbb. */
export function parseHexColour(value, massName);

/**
 * Convert `brief.masses` into the pixel-space, per-plane shape
 * `buildSegmentSvg` renders. Same plane validation as
 * `depthPlanesFromBrief`, but each polygon carries its OWN fill taken from
 * `mass.value`. Throws by mass name if `value` is missing or malformed —
 * an unfilled mass would render as CANVAS_FILL, i.e. silently become
 * unlabelled space.
 * @returns {{ planes: { bg: Array<{points: string, fill: string}>,
 *                       mg: Array<{points: string, fill: string}>,
 *                       fg: Array<{points: string, fill: string}> } }}
 */
export function segmentMassesFromBrief({ brief, width, height });

/**
 * Build the segment SVG. Planes draw back to front (same PLANE_ORDER as
 * depth) so nearer masses win overlaps; canvas fill stays CANVAS_FILL
 * (#000000 = unlabelled space).
 */
export function buildSegmentSvg({ brief, width, height });

/**
 * Render a segment control PNG for one brief to `outPath`. Same `magick`
 * invocation and same `-blur 0x6` as renderDepthPng. Returns outPath.
 */
export async function renderSegmentPng({ brief, width, height, outPath });
```

**Steps:**

- [ ] Read `tools/art-forge/generate/blockin.mjs` end to end and `tools/art-forge/tests/blockin.test.mjs` end to end. Note that `PLANE_ORDER` and `CANVAS_FILL` are module-private — the new code reuses them in-module, it does not redeclare them.
- [ ] Add to `tools/art-forge/tests/blockin.test.mjs` a failing test that the segment SVG fills each mass with its own `value`, using the real river/far-bank pair from `A1-ART-02`:

```js
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
```

- [ ] Run `( cd tools/art-forge && node --test tests/blockin.test.mjs )` and confirm it fails with `SyntaxError: The requested module '../generate/blockin.mjs' does not provide an export named 'buildSegmentSvg'`.
- [ ] Implement `parseHexColour`, `segmentMassesFromBrief` and `buildSegmentSvg` in `blockin.mjs`, as a sibling block below `buildDepthSvg` — reusing the module-private `massToPoints`, `PLANE_ORDER` and `CANVAS_FILL`, and duplicating the SVG-envelope lines rather than extracting a shared helper (see Global Constraints for why):

```js
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function parseHexColour(value, massName) {
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    throw new Error(
      `mass "${massName}" has value ${JSON.stringify(value)} — a segment mass ` +
        'needs an explicit #rrggbb colour; an unfilled mass renders as the black ' +
        "canvas and becomes unlabelled space",
    );
  }
  const v = value.slice(1);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function segmentMassesFromBrief({ brief, width, height }) {
  const planes = { bg: [], mg: [], fg: [] };
  for (const mass of brief.masses ?? []) {
    if (!Object.hasOwn(planes, mass.plane)) {
      throw new Error(
        `mass "${mass.name}" has plane "${mass.plane}" — must be one of: ${PLANE_ORDER.join(", ")}`,
      );
    }
    parseHexColour(mass.value, mass.name); // validate before it reaches the SVG
    planes[mass.plane].push({
      points: massToPoints({ mass, width, height }),
      fill: mass.value,
    });
  }
  return { planes };
}

export function buildSegmentSvg({ brief, width, height }) {
  const { planes } = segmentMassesFromBrief({ brief, width, height });
  const body = PLANE_ORDER.flatMap((plane) =>
    planes[plane].map((poly) => `<polygon points="${poly.points}" fill="${poly.fill}"/>`),
  ).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${CANVAS_FILL}"/>`,
    `  ${body}`,
    `</svg>`,
  ].join("\n");
}
```

- [ ] Run `( cd tools/art-forge && node --test tests/blockin.test.mjs )` and confirm the new test passes and the five pre-existing tests still pass.
- [ ] Add failing tests for the remaining segment invariants — canvas fill, draw order, and the two throw paths:

```js
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
```

- [ ] Run the suite, confirm the four new tests fail (the first two on ordering/fill assertions if the implementation is wrong, the last two with `Missing expected exception`), then confirm they pass against the implementation above. Fix the implementation, not the tests, if any fails.
- [ ] Add the **guard test** the design names as deliverable #2 — an end-to-end assertion that `renderDepthPng` still emits exactly the four measured levels. `tests/artifact-gate.test.mjs` and `tests/intake-art.test.mjs` already shell out to `magick` unconditionally at module scope, so this follows existing precedent; art-forge is not run by any `.github/workflows/` job, only by `scripts/precheck.sh`:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

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
```

- [ ] Run the suite and confirm the segment end-to-end test fails with `TypeError: renderSegmentPng is not a function`, and that the depth guard **passes already** (it must — nothing has touched the depth path). If the depth guard is red at this point, stop and investigate before writing another line.
- [ ] Implement `renderSegmentPng` in `blockin.mjs`, mirroring `renderDepthPng`'s `magick` invocation, `-blur 0x6`, `.svg` scratch-file cleanup, and its ENOENT error message (with `renderSegmentPng` / "segment SVG" in the text). Do not touch `renderDepthPng`.
- [ ] Run `( cd tools/art-forge && node --test tests/blockin.test.mjs )` and confirm all tests pass. If a `value` hex does not survive rasterisation exactly, do **not** loosen the assertion silently — record the observed value in the test's failure message, investigate `magick`'s colourspace handling, and only then relax to a nearest-match with a written comment.
- [ ] Run the whole art-forge suite: `( cd tools/art-forge && node --test tests/*.test.mjs )` and confirm zero failures.
- [ ] Confirm the frozen spans are untouched: `git diff -U0 tools/art-forge/generate/blockin.mjs` must show **only additions**, no changed or deleted lines inside `PLANE_DEPTH`, `CANVAS_FILL`, `buildDepthSvg`, `depthPlanesFromBrief` or `renderDepthPng`.
- [ ] Commit: `git add tools/art-forge/generate/blockin.mjs tools/art-forge/tests/blockin.test.mjs && git commit -m "feat(art-forge): renderSegmentPng — per-mass value fills, depth path frozen"`
- [ ] **Quality gate — Verify:** re-run `( cd tools/art-forge && node --test tests/*.test.mjs > out/t1-verify.txt 2>&1 ); echo "exit=$?"` and paste the tail of `out/t1-verify.txt` plus the exit code into the task report.
- [ ] **Quality gate — Review:** dispatch a fresh adversarial reviewer over this task's diff only — `git diff HEAD~1 --stat` then the full diff — with the brief: *"Does anything in this diff change what `renderDepthPng` emits, directly or by shared code path? Is the segment guard test capable of actually failing? Is the duplication between buildDepthSvg and buildSegmentSvg deliberate per the plan's Global Constraints?"* Use the `code-reviewer` agent or `superpowers:requesting-code-review`. Self-review does not count.
- [ ] **Quality gate — Refactor:** act on every finding. Kill dead code and over-defensiveness — but do **not** de-duplicate the two SVG builders, and record that as an explicit non-finding if the reviewer raises it.
- [ ] **Quality gate — Re-verify:** re-run the full art-forge suite and confirm still green; commit the refactor as a NEW commit (`git commit -m "refactor(art-forge): review fixes for renderSegmentPng"`), never `--amend`.

---

## Task 2: the `environment.segment` profile block and the `--control` selector

**Files:**
- modify `tools/art-forge/forge.config.json`
- modify `tools/art-forge/tests/forge-config.test.mjs`
- modify `tools/art-forge/generate/env.mjs`
- modify `tools/art-forge/tests/env-graph.test.mjs`

**Interfaces:**

```js
// tools/art-forge/generate/env.mjs — new exports

/** control key -> the forge.config.json profile key holding its block. */
export const CONTROL_BLOCK = Object.freeze({ depth: "controlNet", segment: "segment" });

/** control key -> the blockin.mjs renderer that produces its control PNG. */
export const CONTROL_RENDERER = Object.freeze({ depth: renderDepthPng, segment: renderSegmentPng });

/**
 * Pick the active control. Precedence: --control > profile.control > "depth".
 * Throws by name on an unknown key, and on a block whose `type` does not equal
 * its key (a typo there silently sends the wrong SetUnionControlNetType).
 * @returns {{ control: string, block: object, render: Function }}
 */
export function resolveControl({ forge, control });

/**
 * Resolve the strength for one control. `--strength` wins over the block's
 * value. Throws if the block's strength is null AND no override was given —
 * an unmeasured strength must fail loudly, not silently default.
 */
export function resolveStrength({ control, block, override });

/**
 * Output id for one cell. Depth keeps F-026's exact naming
 * (`<id>-seed<n>-s<x>`) so the replication record's filenames still resolve;
 * any other control inserts its key (`<id>-<control>-seed<n>-s<x>`).
 */
export function controlOutputId({ briefId, control, seed, strength });
```

**Steps:**

- [ ] Read `tools/art-forge/forge.config.json` `profiles.environment` in full and `tools/art-forge/generate/env.mjs` `generateEnv` (lines 492–561) so the control-image path, the upload call and the output id are all in view at once.
- [ ] Add a failing config test to `tools/art-forge/tests/forge-config.test.mjs`:

```js
test("environment profile carries a segment control block whose strength is explicitly UNMEASURED", () => {
  const forge = loadForge({ profile: "environment" });
  assert.equal(forge.profile.segment.type, "segment");
  assert.equal(forge.profile.segment.strength, null,
    "F-026's 0.30-0.40 window was depth-measured and does not transfer — Task 3 measures this");
  assert.equal(forge.profile.segment.startPercent, 0.0);
  assert.equal(forge.profile.segment.endPercent, 1.0);
});

test("the depth controlNet block is FROZEN — F-026's replication record depends on it", () => {
  const forge = loadForge({ profile: "environment" });
  assert.deepEqual(forge.profile.controlNet, {
    type: "depth", strength: 0.3, startPercent: 0.0, endPercent: 1.0,
  });
  assert.equal(forge.profile.control, "depth", "the default control does not change until segment is measured");
});
```

- [ ] Run `( cd tools/art-forge && node --test tests/forge-config.test.mjs )` and confirm failure: `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: undefined !== 'segment'`.
- [ ] Add to `forge.config.json`'s `profiles.environment`, as a sibling of the untouched `controlNet` block:

```json
"control": "depth",
"segment": {
  "type": "segment",
  "strength": null,
  "startPercent": 0.0,
  "endPercent": 1.0,
  "_note": "Segment control over the per-mass `value` colours every brief already carries — added because the depth path renders only FOUR levels (measured 2026-08-08: 0 sky 54.5%, 51 all-bg 5.1%, 140 all-mg 18.4%, 180 all-fg 7.5%), so a river and its far bank are the same pixel and no ControlNet strength can separate them. `segment` is a valid SetUnionControlNetType option on this install (verified 2026-08-08 via GET /object_info/SetUnionControlNetType: auto, openpose, depth, hed/pidi/scribble/ted, canny/lineart/anime_lineart/mlsd, normal, segment, tile, repaint). strength is NULL ON PURPOSE and env.mjs refuses to run without --strength: F-026's 0.30-0.40 window was measured for DEPTH and does not transfer to a label map. Task 3 of the segment-control plan measures it and replaces this null."
}
```

- [ ] Run the config test and confirm it passes.
- [ ] Add failing tests to `tools/art-forge/tests/env-graph.test.mjs` for control selection, the loud null-strength failure, and filename separation:

```js
test("resolveControl defaults to depth and maps it to the frozen controlNet block", () => {
  const r = resolveControl({ forge, control: undefined });
  assert.equal(r.control, "depth");
  assert.equal(r.block.strength, 0.3);
});

test("resolveControl names an unknown control instead of silently generating with the wrong one", () => {
  assert.throws(() => resolveControl({ forge, control: "sgement" }), /sgement.*depth, segment/s);
});

test("an unmeasured strength fails loudly rather than defaulting — a null that reached the graph would queue strength:null", () => {
  const { block } = resolveControl({ forge, control: "segment" });
  assert.throws(
    () => resolveStrength({ control: "segment", block, override: undefined }),
    /segment.*unmeasured.*--strength/s,
  );
  assert.equal(resolveStrength({ control: "segment", block, override: "0.45" }), 0.45);
});

test("depth output ids keep F-026's exact naming; segment ids carry their control so the two never collide", () => {
  assert.equal(
    controlOutputId({ briefId: "A1-ART-02", control: "depth", seed: 12345, strength: 0.3 }),
    "A1-ART-02-seed12345-s0.30",
  );
  assert.equal(
    controlOutputId({ briefId: "A1-ART-02", control: "segment", seed: 12345, strength: 0.3 }),
    "A1-ART-02-segment-seed12345-s0.30",
  );
});

test("the graph sends the control block's own union type, not a hardcoded 'depth'", () => {
  const { block } = resolveControl({ forge, control: "segment" });
  const g = buildEnvGraph({
    brief: { positive: "a crossing town", id: "A1-ART-02" },
    seed: 12345, depthImage: "art-forge/A1-ART-02-segment.png", forge,
    strength: 0.45, controlNet: block,
  });
  assert.equal(g[ENV_NODE.CN_TYPE].inputs.type, "segment");
  assert.equal(g[ENV_NODE.CN_APPLY].inputs.strength, 0.45);
});
```

- [ ] Run `( cd tools/art-forge && node --test tests/env-graph.test.mjs )` and confirm failure: `SyntaxError: The requested module '../generate/env.mjs' does not provide an export named 'resolveControl'`.
- [ ] Implement in `env.mjs`: import `renderSegmentPng` alongside `renderDepthPng`; add `CONTROL_BLOCK`, `CONTROL_RENDERER`, `resolveControl`, `resolveStrength`, `controlOutputId`; give `buildEnvGraph` an optional `controlNet = forge.profile.controlNet` parameter so the union type and percents come from the selected block instead of being read off the profile directly. Every existing call site that omits it keeps today's behaviour.
- [ ] Run the env-graph suite and confirm all new tests pass and all 20 pre-existing tests still pass.
- [ ] Rewire `generateEnv` so the control is selected once and used consistently — this closes three real collisions that would otherwise silently clobber files:

```js
  const { control, block, render } = resolveControl({ forge, control: args.control });
  const strength = resolveStrength({ control, block, override: args.strength });
  const { width, height } = forge.profile.latent;

  // Per-control local path AND per-control uploaded basename. Both matter:
  // uploadControlImage sends path.basename(localPath) with overwrite=true, so
  // a shared "A1-ART-02.png" would let a segment run clobber the depth map
  // already sitting in ComfyUI's input dir (and vice versa).
  const controlLocalPath = path.join(forge.outDir, "control", control, `${briefId}-${control}.png`);
  await render({ brief: rawBrief, width, height, outPath: controlLocalPath });

  const controlImage = args["dry-run"]
    ? `art-forge/${briefId}-${control}.png`
    : await uploadControlImage({ base, localPath: controlLocalPath, subfolder: "art-forge" });

  const outputId = controlOutputId({ briefId, control, seed, strength });
  const graph = buildEnvGraph({ brief, seed, depthImage: controlImage, forge, strength, controlNet: block });
```

- [ ] Update the `--hires` branch's `baseImage` dry-run placeholder to use the same `outputId`, and update `runGraph`'s `label` to include `control=${control}`.
- [ ] Document `--control depth|segment` in `env.mjs`'s header Flags block, stating that the default stays `depth` until a segment strength is measured, and that `--control depth` reproduces F-026's exact behaviour from committed code forever.
- [ ] Verify the wiring without touching the GPU: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --control segment --strength 0.45 --dry-run > out/t2-dryrun.json 2>&1 ); echo "exit=$?"`. Read `out/t2-dryrun.json` and confirm node `21`'s `type` is `"segment"`, node `23`'s `strength` is `0.45`, node `22`'s `image` is `art-forge/A1-ART-02-segment.png`, and node `10`'s `filename_prefix` is `art-forge/env/A1-ART-02-segment-seed12345-s0.45`.
- [ ] Verify the frozen path still works identically: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --dry-run > out/t2-dryrun-depth.json 2>&1 ); echo "exit=$?"`. Confirm node `21`'s type is `"depth"`, strength `0.3`, prefix `art-forge/env/A1-ART-02-seed12345-s0.30` — byte-for-byte what F-026 produced.
- [ ] Confirm the segment control PNG actually rendered locally: `ls -l tools/art-forge/out/control/segment/A1-ART-02-segment.png` and `magick tools/art-forge/out/control/segment/A1-ART-02-segment.png -format %c histogram:info:- | sort -rn | head -12` — the top colours must include `#9AA4A8` and `#7D8288` as separate entries. **This is the cheapest possible proof the whole premise holds and it costs zero GPU seconds.**
- [ ] Run the full art-forge suite and confirm green.
- [ ] Commit: `git add tools/art-forge/forge.config.json tools/art-forge/generate/env.mjs tools/art-forge/tests/forge-config.test.mjs tools/art-forge/tests/env-graph.test.mjs && git commit -m "feat(art-forge): --control selector and the environment.segment block"`
- [ ] **Quality gate — Verify:** `( cd tools/art-forge && node --test tests/*.test.mjs > out/t2-verify.txt 2>&1 ); echo "exit=$?"` — paste the tail and the exit code.
- [ ] **Quality gate — Review:** fresh adversarial reviewer on this task's diff, brief: *"Can any un-flagged invocation now behave differently than before this diff? Do the depth control PNG, the uploaded filename, and the output filename still match F-026's record exactly? Is there any path where `strength: null` reaches the graph?"*
- [ ] **Quality gate — Refactor:** apply findings.
- [ ] **Quality gate — Re-verify:** full suite green + both dry-runs re-checked; commit as a new commit.

---

## Task 3: Millcross under segment control — the proof, and finding the strength

> **This task produces images. It cannot use red-green TDD and must not pretend to.** There is no assertion to write about an image's content: the model is stochastic, the same seed at a different strength is a different picture, and the thing being judged ("is there a river?") has no machine oracle in this repo. **"Verify" here means: run the cells, look at every image, judge each against Millcross's written acceptance bar, and record the verdict with its seed and settings.** No test in this task asserts anything about pixels.
>
> **This task is the gate for the rest of the plan.** If no strength produces an acceptable Millcross, Tasks 4–8 do not proceed. The correct end state is then a committed negative result in `ABP-segment-control.md` and an idea filed for the next mechanism — the design's D2 risk having materialised, exactly as it was written down.

**Files:**
- modify `tools/art-forge/forge.config.json` (the measured strength, and flipping `control`)
- modify `tools/art-forge/tests/forge-config.test.mjs`
- create `docs/worldbuilding/ABP-segment-control.md`

**Interfaces:** no new code interfaces. The measurement contract is:

```
Millcross acceptance bar (from briefs/A1-ART-02.json prompt + A1-geography-cluster1.md §6):
  mustShow     grey river · ford / crossing approach · a mill-WHEEL housing over a race
               · a queue of loaded carts and led animals · single-storey plank/canvas town on both banks
  mustNotShow  lattice pylons or power lines · motor vehicles · windmill sails
               · painted road markings · a town wall

Recorded per cell: control, strength, seed, steps, cfg, wall-clock seconds,
VRAM free before, each mustShow present/absent, each mustNotShow present/absent, PASS/FAIL.
```

**Steps:**

- [ ] Bring the tunnel up and confirm it: `ssh -f -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100` then `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8188/system_stats`. Expect `200`. A closed port is not proof the host is down — re-open the tunnel and retry once before escalating.
- [ ] Confirm `segment` is live on this server, not just documented: `curl -s http://127.0.0.1:8188/object_info/SetUnionControlNetType > tools/art-forge/out/t3-uniontypes.json; echo "exit=$?"` then read the file and confirm the option list contains `segment`. **Do this before burning a single generation.**
- [ ] Record VRAM headroom before starting: `curl -s http://127.0.0.1:8188/system_stats > tools/art-forge/out/t3-vram-before.json; echo "exit=$?"` — read `devices[0].vram_free`. The measured baseline is 3.9 GB free of 24, which was enough for a 218 s base pass.
- [ ] **Look at the control image before generating from it.** Open `tools/art-forge/out/control/segment/A1-ART-02-segment.png` (written in Task 2) and confirm by eye: the river band and the far-bank band above it are visibly different greys; the mill-wheel housing is a distinctly coloured brown column; the two town rows are lighter and distinct from the mill. If they are not, **stop** — the premise fails at the block-in, not at the model, and no strength will help.
- [ ] Run the strength ladder at seed 12345 — three cells, ~218 s each, ~11 minutes total. The ladder goes **above** F-026's depth window on purpose: the 0.30–0.40 ceiling was set because a strong three-tier *luminance* signal collapses schnell into flat vector art, and a label map is not a luminance gradient — but that is a hypothesis, so measure it rather than assume it:

```bash
for s in 0.30 0.45 0.60; do
  ( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --control segment --strength "$s" ) \
    > "tools/art-forge/out/t3-millcross-s$s.log" 2>&1
  echo "strength=$s exit=$?"
done
```

- [ ] Read each log and confirm `exit=0` and a downloaded PNG path for all three. If any cell OOMs, record the VRAM reading at that moment and drop to one cell at a time.
- [ ] **Open all three PNGs side by side and judge each against the acceptance bar above.** For every cell write down each `mustShow` as present/absent and each `mustNotShow` as present/absent. Also note whether the image still reads as *painted* — the flat-vector collapse and the cutout halo are the two failure modes F-026 measured at high depth strength, and they are what the ladder is looking for at the top end.
- [ ] Choose the strength: **the highest cell that satisfies every `mustShow`, violates no `mustNotShow`, and still reads as painted.** Record the reason the cells above and below it were rejected — the rejection reasons are the evidence, not the choice.
- [ ] If no cell passes: extend the ladder to 0.75 and 0.90 and repeat. If still no cell passes, the last-resort diagnostic lever is the `-blur 0x6` rasterisation — a heavy blur bleeds distinct labels into intermediate colours at every boundary, which would defeat a label map. Try one cell with a reduced blur; if it is decisive, the blur value moves into `profiles.environment.segment` as a recorded, measured setting rather than being hardcoded, and it applies to `renderSegmentPng` only. If that still fails, **stop the plan here** and write the negative result up.
- [ ] Write `docs/worldbuilding/ABP-segment-control.md` with: the problem restated from measurement (the four-level depth histogram, the river/far-bank collapse), the segment mechanism, a table of every ladder cell with its full settings and verdict, the chosen strength and why, and an empty six-row verdict table for the towns, with Millcross's row filled in. Follow the shape of `docs/worldbuilding/ABP-controlnet-replication.md`.
- [ ] Replace `"strength": null` in `profiles.environment.segment` with the measured number, and update its `_note` to cite `ABP-segment-control.md` and the ladder. Flip `"control": "depth"` to `"control": "segment"` — this is what makes the design's §10 command (`node generate/env.mjs --brief A1-ART-02 --seed 12345`) literally correct. `--control depth` still reproduces F-026 exactly from committed code.
- [ ] Update the two config tests from Task 2: the segment strength assertion becomes the measured value (with a comment naming the ABP section), and the default-control assertion becomes `"segment"`. Leave the frozen-`controlNet` deepEqual **exactly as written**.
- [ ] Run `( cd tools/art-forge && node --test tests/*.test.mjs )` and confirm green.
- [ ] Confirm the flip did not break the frozen path: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --control depth --dry-run > out/t3-depth-still-works.json 2>&1 ); echo "exit=$?"` — node `21` type `"depth"`, strength `0.3`, prefix `art-forge/env/A1-ART-02-seed12345-s0.30`.
- [ ] Commit: `git add tools/art-forge/forge.config.json tools/art-forge/tests/forge-config.test.mjs docs/worldbuilding/ABP-segment-control.md && git commit -m "feat(art-forge): measured segment strength + Millcross proof"`
- [ ] **Quality gate — Verify:** the evidence for this task is the ABP document plus the three images. Paste the ladder table into the task report and state the chosen strength and the rejection reason for each other cell. Also paste `( cd tools/art-forge && node --test tests/*.test.mjs > out/t3-verify.txt 2>&1 ); echo "exit=$?"`.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"Read ABP-segment-control.md against the actual images in tools/art-forge/out/. Is every claim in the table supported by a cell that was actually run? Does the chosen strength have a stated rejection reason for the cells above and below it? Does any sentence assert something no one looked at?"* Give the reviewer the image paths.
- [ ] **Quality gate — Refactor:** correct any unsupported claim in the ABP. An overclaim here poisons every later task, which consumes this number.
- [ ] **Quality gate — Re-verify:** suite green, both dry-runs re-checked; commit as a new commit.

---

## Task 4: `mustShow` / `mustNotShow` and the value-separation contract

> **Design-premise correction, measured from the files.** The design's §2 says every brief "carries eight semantically distinct `value` colours". Measured across the four existing briefs, they do not. Worst pairwise Chebyshev separations: `A1-ART-03` `ledge-1-base` vs `field-edge-foreground` = **2**; all six Embervale ledges within **4** of each other; `A1-ART-07`'s entire palette within **12**; `A1-ART-02` `town-row-left` vs `town-row-right` = **5**. Under segment control, near-identical values are one label to the encoder — Embervale and Cindervast would reproduce the exact collapse the design diagnoses. **Millcross is unaffected on the axis that matters** (river #9aa4a8 vs far-bank #7d8288 = 18, mill #5c4a34 vs town rows = 51), which is why Task 3 could run on the brief as authored. This task fixes the rest.

**Files:**
- create `tools/art-forge/tests/briefs.test.mjs`
- modify `tools/art-forge/briefs/A1-ART-02.json`, `-03.json`, `-06.json`, `-07.json`

**Interfaces:**

```js
// tools/art-forge/tests/briefs.test.mjs — a data contract over briefs/*.json,
// NOT a generation-path validator. env.mjs's validateBrief is deliberately
// left alone: the acceptance lists are a human-review contract, and coupling
// them to `generateEnv` would block a legitimate exploratory run of a brief
// whose bar has not been written yet.

/** Every brief JSON in briefs/, as { id, file, brief }. */
function allBriefs();

/** Max per-channel distance between two #rrggbb strings. */
function chebyshev(a, b);
```

Brief schema addition, on every brief:

```jsonc
"mustShow":    ["…", "…"],   // non-empty; each item one checkable visual fact
"mustNotShow": ["…", "…"]    // non-empty; each item one observed failure mode
```

**Steps:**

- [ ] Create `tools/art-forge/tests/briefs.test.mjs` with three failing tests. Note that the coverage test walks the directory, so it will automatically demand the same fields from `A1-ART-04` and `A1-ART-05` the moment Task 6 creates them — the gate written here constrains that task:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEGMENT_MIN_SEPARATION, parseHexColour } from "../generate/blockin.mjs";

const BRIEFS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "briefs");

function allBriefs() {
  return readdirSync(BRIEFS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.replace(/\.json$/, ""), file: path.join(BRIEFS_DIR, f) }))
    .map((b) => ({ ...b, brief: JSON.parse(readFileSync(b.file, "utf8")) }));
}

const chebyshev = (a, b, name) =>
  Math.max(...parseHexColour(a, name).map((v, i) => Math.abs(v - parseHexColour(b, name)[i])));

test("every brief carries a non-empty mustShow and mustNotShow — the budget counts entries, it cannot see quality", () => {
  for (const { id, brief } of allBriefs()) {
    assert.ok(Array.isArray(brief.mustShow) && brief.mustShow.length > 0, `${id}: mustShow missing or empty`);
    assert.ok(Array.isArray(brief.mustNotShow) && brief.mustNotShow.length > 0, `${id}: mustNotShow missing or empty`);
    for (const item of [...brief.mustShow, ...brief.mustNotShow]) {
      assert.equal(typeof item, "string", `${id}: acceptance items must be strings`);
      assert.notEqual(item.trim(), "", `${id}: empty acceptance item`);
    }
  }
});

test("all six cluster-1 town briefs exist", () => {
  const ids = new Set(allBriefs().map((b) => b.id));
  for (const n of ["02", "03", "04", "05", "06", "07"]) {
    assert.ok(ids.has(`A1-ART-${n}`), `A1-ART-${n} is missing`);
  }
});

test("no two masses in a brief share a segment label — a label map needs separated colours, not a depth-like ramp", () => {
  for (const { id, brief } of allBriefs()) {
    const masses = brief.masses ?? [];
    for (let i = 0; i < masses.length; i++) {
      for (let j = i + 1; j < masses.length; j++) {
        const d = chebyshev(masses[i].value, masses[j].value, `${id}:${masses[i].name}`);
        assert.ok(
          d >= SEGMENT_MIN_SEPARATION,
          `${id}: "${masses[i].name}" ${masses[i].value} and "${masses[j].name}" ${masses[j].value} ` +
            `differ by only ${d} (need >= ${SEGMENT_MIN_SEPARATION}) — the segment encoder reads them as one label`,
        );
      }
    }
  }
});
```

- [ ] Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )` and confirm three failures, including `A1-ART-03: mustShow missing or empty`, `A1-ART-04 is missing`, and `A1-ART-03: "ledge-1-base" #191512 and "field-edge-foreground" #1a1712 differ by only 2 (need >= 24)`.
- [ ] Justify the floor of 24 in a header comment in `briefs.test.mjs`: it is a **chosen floor, not a measured one**. The depth tiers that *did* separate were 51/140/180 — gaps of 89 and 40. 24 sits well under that while being three to twelve times the 2–8 collisions found in the authored briefs. If Task 7 shows colours still bleeding into one another, raise it and record the new value; do not lower it without evidence.
- [ ] Add `mustShow` / `mustNotShow` to `briefs/A1-ART-02.json` (Millcross), derived from its own prompt and `A1-geography-cluster1.md` §6 (*"no wall and no plan… one tall thing, the mill-wheel housing over the race… First thing a traveller sees: the cart queue"*):

```json
"mustShow": [
  "a grey river crossing the frame with both banks built on",
  "a ford or crossing approach the cart queue is heading toward",
  "a mill-WHEEL housing over a race — a wheel on a building, not a tower",
  "a queue of loaded carts and led animals running out of the foreground",
  "single-storey grey plank, patched canvas and roped tarpaulin buildings"
],
"mustNotShow": [
  "lattice pylons, utility poles or power lines",
  "motor vehicles of any kind",
  "windmill sails",
  "painted road markings or paved roads",
  "a town wall or gate"
]
```

- [ ] Add the lists to `-03` (Embervale), `-06` (Rooktide) and `-07` (Cindervast), each derived from that brief's prompt plus its §6 paragraph. Encode the *observed* failures, not generic ones — Embervale's `mustNotShow` leads with **"one monumental centred stepped pyramid or ziggurat"** (F-026's 4/4 miss), and Cindervast's leads with **"rubble, collapsed walls or cracked stonework"** (F-026's 4/4 miss against a brief that explicitly says the walls stand clean with mortar intact).
- [ ] Re-space the colliding `value`s in `-02`, `-06` and `-07` to clear the 24 floor. Leave `-03`'s masses alone — Task 5 re-authors that brief wholesale and will assign its values then. Changing a `value` is **safe for the frozen depth path**: `depthPlanesFromBrief` never reads `value`, so F-026's replication record is untouched by this edit. Verify that claim by re-running the Task 1 depth guard test after the edits.
- [ ] Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )`. Expect the acceptance and separation tests to pass for `-02`, `-06`, `-07`, and the "all six exist" test to still fail on `A1-ART-04`/`-05` — that failure is **expected and correct** until Task 6.
- [ ] Mark the "all six" test `{ todo: true }` with a comment naming Task 6, so the suite is green between here and there; Task 6's first step removes the `todo`.
- [ ] Run the full art-forge suite and confirm green.
- [ ] **Record the consequence:** Millcross's `value`s changed, so Task 3's accepted image is no longer reproducible from the committed brief. Add a line to `ABP-segment-control.md` stating this, and add Millcross to Task 7's regeneration batch at the same seed and strength so both cells are recorded. A separation gate that exempts the one brief you already like is not a gate.
- [ ] Commit: `git add tools/art-forge/tests/briefs.test.mjs tools/art-forge/briefs/ docs/worldbuilding/ABP-segment-control.md && git commit -m "feat(art-forge): acceptance bars and the segment label-separation contract"`
- [ ] **Quality gate — Verify:** `( cd tools/art-forge && node --test tests/*.test.mjs > out/t4-verify.txt 2>&1 ); echo "exit=$?"` — paste tail and exit code. Confirm the Task 1 depth guard is still green in that output.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"Check every mustShow/mustNotShow item against the brief prose and A1-geography-cluster1.md §6. Is any item invented rather than derived? Is any item unjudgeable by eye? Do the re-spaced values still describe the same materials the prompt names?"*
- [ ] **Quality gate — Refactor:** apply findings; delete any acceptance item that cannot be judged by looking at a picture.
- [ ] **Quality gate — Re-verify:** full suite green; commit as a new commit.

---

## Task 5: Embervale re-authored asymmetric

> **The defect is measured and specific.** `A1-ART-03`'s six ledge x-midpoints are `0.540, 0.540, 0.540, 0.540, 0.530, 0.505` — symmetric and centred to within 0.035, with only the widths varying. F-026 established that a symmetric centred stack of steps renders as **one monumental building**, and all 4/4 replication cells for this subject matched that shape faithfully — which is evidence of *high* control adherence, not low. Re-authoring **invalidates those four measured replication cells**; the design accepts that cost explicitly (§4).

**Files:**
- modify `tools/art-forge/briefs/A1-ART-03.json`

**Interfaces:** no code. The authoring contract, derived from the F-026 authoring law and enforced by Task 4's tests plus the new test below:

```
Embervale mass contract:
  - ledge x-midpoints span >= 0.20 across the six tiers (currently 0.035)
  - no two adjacent tiers share a midpoint within 0.06
  - at least two tiers are BROKEN into 2+ separate masses (a terrace interrupted
    by an adit mouth or a stair is not one rectangle)
  - every mass value clears SEGMENT_MIN_SEPARATION against every other (Task 4)
  - plane assignment unchanged in kind: upper tiers bg, lower tiers mg, fields fg
```

**Steps:**

- [ ] Re-read `briefs/A1-ART-03.json`'s prompt and `A1-geography-cluster1.md` §6 Embervale (*"stacked in six or seven ledges above its own fields, so the silhouette is a stair of slate roofs with smoke standing off each ledge… Adit mouths open directly into the hillside between ledges"*). The silhouette word is **stair**, not pyramid — a stair climbs in one direction.
- [ ] Add a failing test to `tools/art-forge/tests/briefs.test.mjs` encoding the anti-monument law, so the defect cannot silently return:

```js
test("Embervale's ledges are asymmetric — a symmetric centred stack renders as ONE monument (F-026, 4/4 cells)", () => {
  const { brief } = allBriefs().find((b) => b.id === "A1-ART-03");
  const mids = brief.masses
    .filter((m) => m.name.startsWith("ledge-"))
    .map((m) => (m.rect ? (m.rect[0] + m.rect[2]) / 2 : m.points.reduce((s, p) => s + p[0], 0) / m.points.length));
  const span = Math.max(...mids) - Math.min(...mids);
  assert.ok(span >= 0.2, `ledge midpoints span only ${span.toFixed(3)} — the authored defect was 0.035, need >= 0.20`);
  for (let i = 1; i < mids.length; i++) {
    assert.ok(Math.abs(mids[i] - mids[i - 1]) >= 0.06,
      `adjacent ledges ${i - 1}/${i} share a midpoint within ${Math.abs(mids[i] - mids[i - 1]).toFixed(3)}`);
  }
});
```

- [ ] Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )` and confirm failure: `ledge midpoints span only 0.035 — the authored defect was 0.035, need >= 0.20`.
- [ ] Re-author `A1-ART-03.json`'s `masses` as a **stair climbing right to left**: ledge-1 (base, widest, midpoint ≈ 0.62) through ledge-6 (top, narrowest, midpoint ≈ 0.30), each tier stepping its midpoint left by ≈ 0.065. Break ledge-3 and ledge-5 into two masses each with an `adit-mouth` mass between them (§6: *"Adit mouths open directly into the hillside between ledges"*). Keep `fields-near`/`field-edge-foreground` on `fg` — the viewer stands in the fields, so they are the nearest thing in frame.
- [ ] Assign each mass a `value` from the iron-red / banner-black / hearth-orange palette with at least 24 separation between every pair — the six ledges must be six labels, not a ramp. Slate roof faces, black clinker retaining walls, adit mouths, fields and field edge each get their own distinct colour.
- [ ] Rewrite the brief's `_note` to record: what changed, why (the measured 0.035 midpoint span and F-026's authoring law), that this **invalidates the four measured replication cells for this subject**, and that the values were re-spaced for segment control. Leave the `prompt` untouched — §8 of the design says the briefs' prose is not rewritten.
- [ ] Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )` and confirm all Embervale tests pass, including Task 4's separation test.
- [ ] Render and **look at** the new control image without touching the GPU: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-03 --seed 12345 --dry-run > out/t5-dryrun.json 2>&1 ); echo "exit=$?"` then open `tools/art-forge/out/control/segment/A1-ART-03-segment.png`. Confirm by eye that it reads as an offset stair of distinctly-coloured ledges, not a centred pyramid. **If it still looks like a monument, fix the masses now** — this is free, and a GPU cell is 218 seconds.
- [ ] Run the full art-forge suite and confirm green.
- [ ] Commit: `git add tools/art-forge/briefs/A1-ART-03.json tools/art-forge/tests/briefs.test.mjs && git commit -m "fix(art-forge): re-author Embervale asymmetric — a centred stack renders as one monument"`
- [ ] **Quality gate — Verify:** paste the suite output and exit code, plus the measured midpoint span of the new masses.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"Does the new Embervale block-in still describe the town A1 §6 describes — six ledges, slate roofs, black clinker footings, adit mouths, fields below? Or did asymmetry get bought by changing the subject? Are the plane assignments still coherent (upper tiers farther)?"* Give the reviewer the rendered control PNG.
- [ ] **Quality gate — Refactor:** apply findings.
- [ ] **Quality gate — Re-verify:** suite green + control PNG re-rendered and re-inspected; commit as a new commit.

---

## Task 6: Norhollow and Gildmark block-ins, authored from A1 §6

> **Derived, not invented.** Every mass below traces to a quoted line of `docs/worldbuilding/A1-geography-cluster1.md`. Do not add a silhouette element that no source line supports.

**Files:**
- create `tools/art-forge/briefs/A1-ART-04.json`
- create `tools/art-forge/briefs/A1-ART-05.json`

**Interfaces:** the existing brief schema (`id`, `subject`, `prompt`, `width`, `height`, `horizon`, `focal`, `_note`, `masses[]`) plus Task 4's `mustShow`/`mustNotShow`. `masses[]` entries are `{ name, plane: "bg"|"mg"|"fg", shape: "rect"|"poly", rect|points, value }` in normalised 0..1 coordinates.

**Source lines the masses derive from — quote these verbatim in each brief's `_note`:**

*Norhollow, §6 (lines 367–375):* "A palisade town in a wooded hollow on the east rim, and the palisade is the silhouette — **a continuous line of sharpened trunks with the town's roofs sitting below the top of it**, so from the flat you see a wall and some smoke and nothing else." · "Material is timber, everywhere, and **the only stone is the ore-head machinery**." · "First thing a traveller sees: **the tally boards at the gate** — planed boards, waist high." · "**the gate is open all day**". §9 (lines 505–511): "seen from **the open flat at eye level** in flat morning light" · "**ore-head machinery visible on the slope behind**" · "The open gate is the focal point, and beside it stand waist-high planed tally boards".

*Gildmark, §6 (lines 377–386):* "Built on a rock headland with the deep berth on its seaward face, it **stacks warehouses, counting-houses and stairs up the cliff in five terraces**, and the silhouette ends in one clean landmark — the **mirror tower, a slim square shaft with a glazed cap**." · "**every seaward face is tarred black** against the salt." · "First thing a traveller sees: **the bar**. For the last half-day of the coast road there is nothing but **mudflat, wrecked hulls, sandbar and gulls** — and then one rock with a town on it and **deep green water at its foot**." §9 (lines 513–519): "seen from **the water at the end of the coastal road**, low sun" · "mudflat, sandbar and the ribs of wrecked hulls **stretching away into fog**".

**Steps:**

- [ ] Remove the `{ todo: true }` marker from Task 4's "all six cluster-1 town briefs exist" test. Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )` and confirm it fails with `A1-ART-04 is missing`.
- [ ] Create `briefs/A1-ART-04.json` (Norhollow). `prompt` is §9's A1-ART-04 paragraph **verbatim**. `horizon: 0.55` (eye level from the flat), `focal` on the gate. Masses, each traced to a quoted line:
  - `bg` `wooded-hollow-treeline` — the wooded hollow behind, a full-width band just above the palisade top.
  - `bg` `ore-head-machinery` — a small angular poly on the slope behind, right of centre. *"the only stone is the ore-head machinery"*, *"visible on the slope behind"*.
  - `mg` `palisade-run-left` and `mg` `palisade-run-right` — **two masses at different tops**, meeting the gate off-centre-left (≈ 0.40). *"a continuous line of sharpened trunks"*; two masses, not one symmetric rectangle, per the Embervale law.
  - `mg` `gate-open` — the gap with taller posts at ≈ 0.40–0.50. *"the gate is open all day"*, *"The open gate is the focal point"*.
  - `mg` `roof-peaks-behind-palisade` — a low sawtooth poly whose top rises only just above the palisade top. **This is the whole silhouette contract**: *"the town's roofs sitting below the top of it… you see a wall and some smoke and nothing else"*. If this mass rises clearly above the palisade, the brief is wrong.
  - `fg` `tally-boards` — a small waist-high rect beside the gate, low in frame. *"waist-high planed tally boards"*.
  - `fg` `open-flat-foreground` — full-width bottom band; the viewer stands on the flat.
  - Values from the hollow-green / frost-white / weathered-oak palette, every pair ≥ 24 apart.
- [ ] Create `briefs/A1-ART-05.json` (Gildmark). `prompt` is §9's A1-ART-05 paragraph verbatim. `horizon: 0.60`, `focal` on the mirror tower. Masses:
  - `bg` `fog-bank-far` — *"stretching away into fog"*.
  - `bg` `sandbar-far` — *"mudflat, wrecked hulls, sandbar"*.
  - `mg` `rock-headland` — the big mass, **placed right-of-centre** (≈ x 0.44→0.94), rising from the waterline to near the top of frame. *"one rock with a town on it"*.
  - `mg` `terrace-1` … `terrace-5` — five masses stepping **up and to the right** across the headland face, each midpoint offset ≥ 0.04 from its neighbour, widths shrinking upward. *"stacks warehouses, counting-houses and stairs up the cliff in five terraces"*. **Apply the Embervale law here from the start** — five concentric centred tiers plus a crowning tower is precisely the monument shape F-026 measured.
  - `mg` `mirror-tower` — a narrow (width ≈ 0.05) shaft crowning the headland with a distinct cap mass. *"a slim square shaft with a glazed cap"*. Square, not round; capped, not spired.
  - `fg` `mudflat-with-hulls` — a low band to the left of and below the rock. *"the bar"*.
  - `fg` `wrecked-hull-ribs` — a rib poly near-left. *"the ribs of wrecked hulls"*.
  - `fg` `deep-water` — bottom band at the rock's foot; the viewer is on the water. *"deep green water at its foot"*, *"seen from the water"*.
  - Values from the tarnished-gold / wax-seal-crimson / harbour-fog-grey palette, every pair ≥ 24 apart, with the tarred-black seaward faces as their own dark label.
- [ ] Add `mustShow` / `mustNotShow` to both, derived only from the quoted lines. Norhollow's `mustShow` leads with *"a continuous palisade of sharpened trunks reading as the town's entire silhouette"* and its `mustNotShow` with *"buildings rising clearly above the palisade"* and *"a stone curtain wall or masonry battlements"*. Gildmark's `mustShow` leads with *"five distinguishable terraces up a rock headland"* and *"one slim SQUARE tower with a glazed cap"*; its `mustNotShow` with *"a round tower, spire, or a lighthouse lantern gallery"* and *"a flat-ground town with no headland"*.
- [ ] Write each `_note` with the quoted source lines, the plane rationale, and the statement that these are **authored, not measured** — matching the existing briefs' `_note` convention.
- [ ] Run `( cd tools/art-forge && node --test tests/briefs.test.mjs )` and confirm all four tests pass, including the separation floor on both new briefs.
- [ ] Render and **look at** both control images without touching the GPU: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-04 --seed 12345 --dry-run > out/t6-nh.json 2>&1 ); echo "exit=$?"` and the same for `A1-ART-05`. Open `out/control/segment/A1-ART-04-segment.png` and `-05-segment.png`. Confirm: Norhollow's roof peaks sit only just above the palisade top; Gildmark's terraces read as an offset stair, not a centred ziggurat, and the mirror tower is a thin distinct shaft.
- [ ] Run the full art-forge suite and confirm green.
- [ ] Commit: `git add tools/art-forge/briefs/A1-ART-04.json tools/art-forge/briefs/A1-ART-05.json tools/art-forge/tests/briefs.test.mjs && git commit -m "feat(art-forge): Norhollow and Gildmark block-ins from A1 §6"`
- [ ] **Quality gate — Verify:** paste the suite output and exit code, and the two rendered control PNG paths.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"For each mass in A1-ART-04 and A1-ART-05, name the line of A1-geography-cluster1.md it derives from. Flag any mass with no source line. Does Norhollow's roof mass violate 'roofs sitting below the top of it'? Does Gildmark's terrace stack repeat Embervale's centred-monument defect?"* Give the reviewer both control PNGs and the §6/§9 text.
- [ ] **Quality gate — Refactor:** delete or re-derive any mass the reviewer cannot trace to a source line.
- [ ] **Quality gate — Re-verify:** suite green + both control PNGs re-rendered and re-inspected; commit as a new commit.

---

## Task 7: the remaining regenerations and the hires pass

> **This task produces images and cannot use red-green TDD.** "Verify" means: run each town's base pass at the Task 3 strength and seed 12345, judge it against its own `mustShow`/`mustNotShow`, and record the verdict. **Towns are judged independently.** Some will fail. A failing town's image is discarded, its placeholder stands, and its `placeholder-quality` tag stays — that is a correct outcome, not an incomplete one.

**Files:**
- modify `docs/worldbuilding/ABP-segment-control.md` (the six verdicts)
- no code changes

**Interfaces:** none new. The per-town command shape:

```bash
( cd tools/art-forge && node generate/env.mjs --brief <ID> --seed 12345 ) > tools/art-forge/out/t7-<ID>-base.log 2>&1
echo "exit=$?"
```

`--control` is omitted because Task 3 set `profiles.environment.control` to `segment`; `--strength` is omitted because Task 3 wrote the measured value into the config. The commands are therefore exactly the design's §10 line.

**Steps:**

- [ ] Confirm the tunnel is still up: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8188/system_stats` → `200`. Re-open with `ssh -f -N -L 8188:127.0.0.1:8188 Mont@100.66.190.100` if not.
- [ ] Record VRAM headroom: `curl -s http://127.0.0.1:8188/system_stats > tools/art-forge/out/t7-vram-before.json; echo "exit=$?"` — read `devices[0].vram_free` and note it in the ABP.
- [ ] Regenerate **Millcross first** — its `value`s changed in Task 4, so Task 3's accepted image is no longer reproducible from the committed brief and must be re-judged: `( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 ) > tools/art-forge/out/t7-A1-ART-02-base.log 2>&1; echo "exit=$?"`. Read the log, confirm exit 0 and a downloaded PNG, then judge it against Millcross's bar. **Record both cells in the ABP** — the Task 3 cell and this one — and say which image goes forward.
- [ ] Run the remaining five base passes one at a time, in this order: `A1-ART-03` (Embervale), `A1-ART-04` (Norhollow), `A1-ART-05` (Gildmark), `A1-ART-06` (Rooktide), `A1-ART-07` (Cindervast). One at a time, not batched: at 3.9 GB free the box has no headroom for concurrency, and a serial run makes an OOM attributable.
- [ ] After each: read the log, confirm `exit=0`, open the PNG, and fill that town's ABP row — every `mustShow` present/absent, every `mustNotShow` present/absent, PASS or FAIL, with the seed, strength, control, steps, cfg and wall-clock time. **Judge before moving to the next town** — batching the judgements invites a single sweeping verdict instead of six independent ones.
- [ ] Record the lattice-pylon observation explicitly for every town, pass or fail. The design (§7) says segment control **may** suppress it as a side effect and that this task's job is to *detect*, not solve. F-026 saw it in 5 of 16 cells clustered on seed 12345 — the seed being used here. If it still appears, that is a finding for a new idea, not a reason to widen this one.
- [ ] Re-check VRAM before the first hires pass: `curl -s http://127.0.0.1:8188/system_stats > tools/art-forge/out/t7-vram-prehires.json; echo "exit=$?"`. F-026 verified 1920×1248 hires without OOM, but under different conditions — the design (§5) requires re-verification, not assumption.
- [ ] Run the hires pass **only for towns whose base pass PASSED**: `( cd tools/art-forge && node generate/env.mjs --brief <ID> --seed 12345 --hires ) > tools/art-forge/out/t7-<ID>-hires.log 2>&1; echo "exit=$?"`. One town at a time. The placeholders' own manifest note names "no upscaler" as a reason they are below the bar, so shipping a second single-pass image would not clear the bar the note names.
- [ ] Judge each hires output against the same bar — the refine pass runs at denoise 0.40 and **can** introduce content the base pass did not have. A hires image that fails the bar is discarded and its base image goes forward instead; record that.
- [ ] If a hires pass OOMs: record the VRAM reading, do not retry more than once, and let that town ship its base image with the reason recorded. An OOM is a measurement, not a failure of the town.
- [ ] Fill in the ABP's six-row verdict table completely, including a `hires: yes/no/OOM` column and, for each town, which file goes forward (base, hires, or "placeholder stands").
- [ ] Commit the record only — the images land in Task 8: `git add docs/worldbuilding/ABP-segment-control.md && git commit -m "docs(ABP): six-town segment-control verdicts"`
- [ ] **Quality gate — Verify:** paste the completed six-row verdict table and the total count of PASS towns into the task report. State plainly how many towns failed and why.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"Open each of the images named in the verdict table and check the verdict against the town's own mustShow/mustNotShow in its brief. Is any PASS unsupported? Is any FAIL actually a pass? Is every row's seed/strength/control recorded?"* Give the reviewer the image paths and the brief paths.
- [ ] **Quality gate — Refactor:** flip any verdict the reviewer overturns, with the reason written into the ABP row. **A disputed PASS becomes a FAIL** — the asymmetry is deliberate: a wrong FAIL costs one placeholder staying, a wrong PASS silently replaces a correct image with an incorrect one and leaves the budget reading met.
- [ ] **Quality gate — Re-verify:** confirm the ABP table matches the images after any flips; commit as a new commit.

---

## Task 8: manifest updates and the record

> **Per town, never in bulk.** One manifest edit per passing town. A failing town's entry is not touched at all — same file, same `note`, `placeholder-quality` still in `tags`.
>
> **`intake-art.mjs` cannot be used here.** It aborts on `id "…" already exists in art-manifest.json` and on `destination already has a different file` — it is a create-only transaction and all six `art:town-*` entries already exist. The manifest is therefore edited by hand, which means **its artifact gate must be run manually** or the check is silently lost.

**Files:**
- modify `game-client/assets/art/concept/A1-ART-0N.png` (passing towns only)
- modify `game-client/assets/art/art-manifest.json` (passing towns only)
- modify `docs/worldbuilding/ABP-segment-control.md`

**Interfaces:** the per-town manifest edit, applied to `entries["art:town-<name>"]`:

```jsonc
"note":  "FLUX.1-schnell-fp8 + flux-controlnet-union-pro-2.0 under SEGMENT control (strength <S>), base pass <+ hires 4x-UltraSharp 10 steps @ 0.40>, local generation on mont-pc. Replaces the Z-Image Turbo placeholder. Accepted against briefs/A1-ART-0N.json mustShow/mustNotShow on 2026-08-08 — verdict recorded in docs/worldbuilding/ABP-segment-control.md.",
"tags":  [ /* same list, with "placeholder-quality" REMOVED */ ],
"gen": {
  "model": "flux1-schnell-fp8",
  "controlNet": "flux-controlnet-union-pro-2.0",
  "control": "segment",
  "strength": <S>,
  "steps": 8,
  "cfg": 1,
  "seed": 12345,
  "width": 1280,   // 1920 if the hires image was accepted
  "height": 832,   // 1248 if the hires image was accepted
  "hires": false   // true if the hires image was accepted
}
```

**Steps:**

- [ ] List the PASS towns from Task 7's verdict table. Everything below runs **once per PASS town**, and not at all for FAIL towns.
- [ ] For each PASS town, run the artifact gate on the accepted PNG before it enters the repo — this is the check the hand-edit bypasses: `( cd tools/art-forge && node artifact-gate.mjs <accepted.png> ) > tools/art-forge/out/t8-<ID>-gate.log 2>&1; echo "exit=$?"`. A flagged image is **not** intaken: review the corner sheet (`node artifact-gate.mjs <png> --corner-sheet out/<ID>-corners.png`), and if the flag is real, that town becomes a FAIL — go back and update its ABP row.
- [ ] For each PASS town, copy the accepted PNG over its destination: `cp <accepted.png> game-client/assets/art/concept/A1-ART-0N.png` and confirm with `ls -l game-client/assets/art/concept/A1-ART-0N.png`.
- [ ] For each PASS town, edit its `art-manifest.json` entry per the interface above. **Remove `placeholder-quality` from `tags` and leave the other tags and their sort order untouched.** Do not touch `group`, `title`, `file`, `description` or `source`.
- [ ] Run the manifest gate: `node scripts/check_asset_manifest.mjs > /tmp/manifest-gate.txt 2>&1; echo "exit=$?"`. Expect exit 0. Read the file and confirm no `art-manifest` failures — rule (N) validates the optional `description`/`tags`/`source`/`gen` fields when present, so a malformed `gen` fails here.
- [ ] Confirm the budget line is unchanged: `node scripts/report_season1.mjs > /tmp/season1.txt 2>&1; echo "exit=$?"` and read the `art-town` row. It must still read **6 / 6 met** — `scripts/lib/season1.mjs`'s `townArt` counts manifest keys with prefix `art:town-`, and no entry was added or removed. **This is the point of §3 of the design**: the budget could not tell the difference, which is why the acceptance bar exists outside it.
- [ ] Verify the tag drop landed only where intended: `grep -c "placeholder-quality" game-client/assets/art/art-manifest.json` — the count must equal the number of FAIL towns plus any non-town entries that carry the tag. Confirm each remaining occurrence against the verdict table by reading the surrounding entry.
- [ ] Finish `docs/worldbuilding/ABP-segment-control.md`: the segment-vs-depth comparison (the four-level depth histogram against the segment map's label count for the same brief), the full strength ladder from Task 3 with the chosen value and the rejection reasons, the six verdicts with seed and settings, the lattice-pylon observations, the hires/VRAM outcome, and a closing section naming what is still open — the manual bar being the weakest link (design §9.3), and whether I-061's biome art inherits segment control (design §9.4, explicitly not this plan's call).
- [ ] If any town FAILED, add an explicit "partially done" statement to the ABP naming which towns still carry `placeholder-quality` and what their observed failure was. **Do not phrase a partial pass as a shortfall** — the design (§3, §7) states it is the correct outcome.
- [ ] Commit per town plus the record. One commit per passing town keeps the history honest about which image was accepted on what evidence:

```bash
git add game-client/assets/art/concept/A1-ART-02.png game-client/assets/art/art-manifest.json
git commit -m "feat(art): Millcross under segment control — placeholder-quality dropped"
```

  …repeated for each PASS town, then:

```bash
git add docs/worldbuilding/ABP-segment-control.md
git commit -m "docs(ABP): segment control record — strength, comparison, six verdicts"
```

- [ ] **Quality gate — Verify:** paste the `check_asset_manifest.mjs` exit code, the `report_season1.mjs` `art-town` row, the `grep -c placeholder-quality` count with its expected value, and `( cd tools/art-forge && node --test tests/*.test.mjs > out/t8-verify.txt 2>&1 ); echo "exit=$?"`.
- [ ] **Quality gate — Review:** fresh adversarial reviewer, brief: *"For every `art:town-*` entry, does its `placeholder-quality` tag state match its ABP verdict? Does every `gen` block match the settings that actually produced the file on disk? Was any FAIL town's entry modified? Does the ABP claim anything the verdict table does not support?"*
- [ ] **Quality gate — Refactor:** apply findings. A mismatch between a tag and a verdict is a blocker, not a nit.
- [ ] **Quality gate — Re-verify:** re-run the manifest gate, the season-1 report and the art-forge suite; commit as a new commit.

---

## Verification

Run all of these from the repo root, in order. Each line states what it must print.

**1. The art-forge suite — Gate 1 runs exactly this** (`scripts/precheck.sh:152`):

```bash
( cd tools/art-forge && node --test tests/*.test.mjs > out/verify-suite.txt 2>&1 ); echo "exit=$?"
```

Must print `exit=0`. `out/verify-suite.txt` must end with `# fail 0` and its `# pass` count must exceed the pre-plan baseline by at least 14 (7 segment/guard tests in T1, 5 control tests in T2, 4 brief-contract tests in T4/T5). It must include the guard test line `GUARD: renderDepthPng still emits PLANE_DEPTH — the four measured levels 0/51/140/180, unchanged by segment control` as `ok`.

**2. The frozen depth path is byte-identical:**

```bash
git diff main -- tools/art-forge/generate/blockin.mjs > /tmp/blockin.diff; echo "exit=$?"
grep -cE '^-' /tmp/blockin.diff
```

The second command must print `1` — the single `---` diff header line and nothing else. **Any other removed line means something inside `PLANE_DEPTH`, `CANVAS_FILL`, `massToPoints`, `depthPlanesFromBrief`, `buildDepthSvg` or `renderDepthPng` was mutated**, which invalidates F-026's 16-cell replication record.

```bash
python3 -c "import json;p=json.load(open('tools/art-forge/forge.config.json'))['profiles']['environment']['controlNet'];print(p)"
```

Must print exactly `{'type': 'depth', 'strength': 0.3, 'startPercent': 0.0, 'endPercent': 1.0}`.

**3. The depth recipe still runs from committed code:**

```bash
( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --control depth --dry-run > out/verify-depth.json 2>&1 ); echo "exit=$?"
```

Must print `exit=0`, and `out/verify-depth.json` must contain `"type": "depth"`, `"strength": 0.3`, and `"filename_prefix": "art-forge/env/A1-ART-02-seed12345-s0.30"` — F-026's exact naming.

**4. Segment is the default and carries the measured strength:**

```bash
( cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345 --dry-run > out/verify-segment.json 2>&1 ); echo "exit=$?"
```

Must print `exit=0`, and `out/verify-segment.json` must contain `"type": "segment"`, the strength Task 3 measured, and `"filename_prefix": "art-forge/env/A1-ART-02-segment-seed12345-s<S>"`. The strength must **not** be `null` — a null here means Task 3 did not complete.

**5. All six briefs exist and satisfy both data contracts:**

```bash
ls tools/art-forge/briefs/
python3 - <<'EOF'
import json, glob, itertools, os
ok = True
for f in sorted(glob.glob('tools/art-forge/briefs/*.json')):
    b = json.load(open(f)); n = os.path.basename(f)
    assert b.get('mustShow') and b.get('mustNotShow'), f"{n}: acceptance lists missing"
    h = lambda v: tuple(int(v.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    for x, y in itertools.combinations(b['masses'], 2):
        d = max(abs(p - q) for p, q in zip(h(x['value']), h(y['value'])))
        if d < 24:
            ok = False; print(f"{n}: {x['name']}/{y['name']} separation {d} < 24")
print("SEPARATION OK" if ok else "SEPARATION FAILED")
EOF
```

`ls` must show six files: `A1-ART-02.json` through `A1-ART-07.json`. The script must print `SEPARATION OK` and raise no assertion.

**6. Embervale is no longer a centred stack:**

```bash
python3 -c "
import json; b=json.load(open('tools/art-forge/briefs/A1-ART-03.json'))
m=[(x['rect'][0]+x['rect'][2])/2 if 'rect' in x else sum(p[0] for p in x['points'])/len(x['points']) for x in b['masses'] if x['name'].startswith('ledge-')]
print('midpoints', [round(v,3) for v in m], 'span', round(max(m)-min(m),3))"
```

The printed `span` must be **≥ 0.20**. The authored defect was `0.035` with midpoints `0.540 0.540 0.540 0.540 0.530 0.505`.

**7. The manifest gate and the budget line:**

```bash
node scripts/check_asset_manifest.mjs > /tmp/manifest-gate.txt 2>&1; echo "exit=$?"
node scripts/report_season1.mjs > /tmp/season1.txt 2>&1; echo "exit=$?"
grep "art-town" /tmp/season1.txt
```

Both must print `exit=0`. The `art-town` row must read **6 / 6 met** — unchanged, because no entry was added or removed. This line reading "met" is *not* evidence the art is good; that is the entire reason the acceptance bar exists.

**8. The tag dropped per town, and only for passing towns:**

```bash
python3 -c "
import json; e=json.load(open('game-client/assets/art/art-manifest.json'))['entries']
for k,v in sorted(e.items()):
    if k.startswith('art:town-'):
        print(k, 'PLACEHOLDER' if 'placeholder-quality' in v.get('tags',[]) else 'accepted', v.get('gen',{}).get('control','-'))"
```

Every row must match the verdict table in `docs/worldbuilding/ABP-segment-control.md` exactly: an `accepted` row must have `control` = `segment`, and a `PLACEHOLDER` row must have its original `gen` block with no `control` key.

**9. The record exists and is complete:**

```bash
test -f docs/worldbuilding/ABP-segment-control.md; echo "exit=$?"
grep -c "A1-ART-0" docs/worldbuilding/ABP-segment-control.md
```

The first must print `exit=0`. The document must contain: the depth-vs-segment histogram comparison, the full Task 3 strength ladder with the chosen value and the rejection reason for each other cell, and **six** town verdict rows each carrying its seed, control, strength, steps, cfg and PASS/FAIL.

**Acceptance for the plan as a whole:** the art-forge suite green including the depth-unchanged guard; a Millcross render showing a river, a ford approach and a water-wheel with no pylon, vehicle or windmill sail; and every town's verdict — pass or fail — recorded in `ABP-segment-control.md` with its seed and settings. **Some towns failing is an acceptable, complete outcome.** Six replacements the budget scores as met, with no recorded verdicts, is not.agentId: aa0373262c5cfd871 (use SendMessage with to: 'aa0373262c5cfd871', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 171532
tool_uses: 32
duration_ms: 707917</usage>