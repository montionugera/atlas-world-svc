# Environment Art Recipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo a working environment concept-art pipeline — a named-profile config, a depth-map producer, a schnell+ControlNet runner, a replicated measurement, and a storybook that can display the results at scale.

**Architecture:** `forge.config.json` becomes v2 with a `profiles` map (`character`, `environment`) and no implicit default — callers name a profile. `loadForge({ profile })` resolves it once and exposes it as `forge.profile`; every consumer reads `forge.profile.*` instead of `forge.config.*`. A new `blockin.mjs` produces depth control images, and `env.mjs` builds the schnell + ControlNet graph that consumes them.

**Tech Stack:** Node ESM (`.mjs`, `"type": "module"`), `node --test` + `node:assert/strict`, ComfyUI HTTP API, vanilla-JS single-page storybook.

## Global Constraints

- **Character recipe values are frozen: `denoise 0.82`, `steps 24`, `cfg 3`.** Empirically validated by the F-024 campaign. Any task that moves them fails review.
- **No implicit profile default.** `loadForge()` with no profile must throw, not fall back.
- **Single-path APIs.** One options object per function; no positional overloads, no boolean flags that branch behavior.
- **`fg` depth fill is `#b4b4b4`, never `#e8e8e8`** — near-white foreground renders as a glossy boat gunwale.
- **ControlNet strength is `0.30`** (usable window 0.30–0.40). At 0.8–1.0 schnell collapses into flat vector art.
- Test runner is `node --test tests/*.test.mjs` from `tools/art-forge/`.
- Commit style: conventional subjects (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), kept short. Never `git commit --amend`.

---

## Task 1: Wire art-forge tests into Gate 1

Do this **first**. `scripts/precheck.sh` runs ten sections and none of them runs `tools/art-forge/tests` — the existing `intake-art` and `artifact-gate` suites are already ungated. Every test later tasks write is decorative until this lands.

**Files:**
- Modify: `scripts/precheck.sh` (section list, currently lines 139–148)

**Interfaces:**
- Consumes: nothing
- Produces: a Gate 1 section named `art-forge: node --test suite` that later tasks rely on to run their tests

- [ ] **Step 1: Confirm the suite currently passes standalone**

```bash
cd tools/art-forge && npm test
```
Expected: PASS — `intake-art.test.mjs` and `artifact-gate.test.mjs` both green. If it fails, stop: that is a pre-existing break to report, not something this task fixes.

- [ ] **Step 2: Add the runner function**

Follow the shape of the existing `*_tests` functions in `precheck.sh`. Add near the other section functions:

```bash
art_forge_tests() {
  ( cd "$REPO_ROOT/tools/art-forge" && node --test tests/*.test.mjs )
}
```

Use whatever variable `precheck.sh` already uses for the repo root — read the file and match it rather than introducing `REPO_ROOT` if a different name is in use.

- [ ] **Step 3: Register the section**

After the `run_section "client: react-client suite"` line:

```bash
run_section "art-forge: node --test suite"   art_forge_tests
```

- [ ] **Step 4: Verify the gate now reports eleven sections**

```bash
bash scripts/precheck.sh 2>&1 | tail -20
```
Expected: `GATE 1 SUMMARY` lists `art-forge: node --test suite  PASS`, and `RESULT: GATE 1 PASS`.

- [ ] **Step 5: Prove it can fail**

Temporarily add `assert.equal(1, 2)` to `tools/art-forge/tests/intake-art.test.mjs`, re-run `bash scripts/precheck.sh`, confirm Gate 1 goes **red** on the new section, then revert the edit. A gate never observed failing is not known to work.

- [ ] **Step 6: Commit**

```bash
git add scripts/precheck.sh
git commit -m "test: run art-forge suite in Gate 1"
```

---

## Task 2: forge.config.json v2 — named profiles

**Files:**
- Modify: `tools/art-forge/forge.config.json`
- Modify: `tools/art-forge/generate/charsheet.mjs` (`loadForge`, ~line 53)
- Create: `tools/art-forge/tests/forge-config.test.mjs`

**Interfaces:**
- Consumes: Task 1's Gate 1 section
- Produces:
  - `loadForge({ forgeDir?, profile })` → `{ config, profile, styleLaws, raceIdentity, jobCostume, outDir }` where `profile` is the resolved `config.profiles[name]` object. Throws on a missing or unknown profile name.
  - `config.profiles.character` / `config.profiles.environment`

- [ ] **Step 1: Write the failing test**

Create `tools/art-forge/tests/forge-config.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";

test("character profile keeps the F-024 validated sampler values", () => {
  const forge = loadForge({ profile: "character" });
  assert.equal(forge.profile.sampler.denoise, 0.82);
  assert.equal(forge.profile.sampler.steps, 24);
  assert.equal(forge.profile.sampler.cfg, 3);
  assert.equal(forge.profile.sampler.mode, "img2img");
});

test("environment profile carries the measured ControlNet recipe", () => {
  const forge = loadForge({ profile: "environment" });
  assert.equal(forge.profile.sampler.denoise, 1.0);
  assert.equal(forge.profile.sampler.steps, 8);
  assert.equal(forge.profile.sampler.cfg, 1);
  assert.equal(forge.profile.controlNet.strength, 0.3);
  assert.equal(forge.profile.controlNet.type, "depth");
  assert.equal(forge.profile.hires.steps, 10);
  assert.equal(forge.profile.hires.denoise, 0.4);
});

test("character-only keys live on the character profile, not shared", () => {
  const forge = loadForge({ profile: "character" });
  assert.ok(Array.isArray(forge.profile.muscleGradient.raceAxis));
  assert.equal(forge.profile.silhouettes.prefix, "sil-");
  assert.equal(loadForge({ profile: "environment" }).profile.silhouettes, undefined);
});

test("there is no implicit default profile", () => {
  assert.throws(() => loadForge({}), /profile/);
  assert.throws(() => loadForge({ profile: "nope" }), /nope/);
});

test("comfy stays shared at top level — it describes the machine, not the recipe", () => {
  const forge = loadForge({ profile: "character" });
  assert.equal(typeof forge.config.comfy.host, "string");
  assert.equal(forge.config.version, 2);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd tools/art-forge && node --test tests/forge-config.test.mjs
```
Expected: FAIL — `loadForge` currently takes a positional `forgeDir` string and returns no `profile`.

- [ ] **Step 3: Restructure `forge.config.json`**

Keep `version`, bump to `2`. Keep `comfy` at top level unchanged. Move everything else under `profiles`. Copy the existing `_note` strings **verbatim** — they are the F-024 sweep record.

```json
{
  "version": 2,
  "comfy": { "host": "100.66.190.100", "port": 8188, "gpu": 0, "launchScript": "C:\\Users\\Mont\\run-comfy-gpu0.cmd", "warning": "GPU 1 : 8189 is the owner's own instance — do not touch it." },
  "profiles": {
    "character": {
      "models": { "unet": "z_image_turbo_bf16.safetensors", "clip": "qwen_3_4b.safetensors", "clipType": "lumina2", "vae": "ae.safetensors" },
      "sampler": { "denoise": 0.82, "mode": "img2img", "steps": 24, "cfg": 3, "samplerName": "res_multistep", "scheduler": "simple", "shift": 3, "_note": "<<copy the existing _note verbatim>>" },
      "silhouettes": { "dir": "F:\\comfy-ui\\input", "prefix": "sil-", "note": "<<copy verbatim>>" },
      "muscleGradient": { "raceAxis": ["elf","beastkin","immortal","human","demon","dragon","dwarf","ogre"], "jobAxis": ["mage","healer","summoner","engineer","assassin","archer","spearman","swordsman"], "scoreRange": [6.0, 8.5] }
    },
    "environment": {
      "models": { "checkpoint": "flux1-schnell.safetensors", "controlNet": "flux-controlnet-union-pro-2.0.safetensors" },
      "sampler": { "denoise": 1.0, "mode": "txt2img", "steps": 8, "cfg": 1, "samplerName": "euler", "scheduler": "simple" },
      "latent": { "width": 1280, "height": 832 },
      "controlNet": { "type": "depth", "strength": 0.3, "startPercent": 0.0, "endPercent": 1.0 },
      "hires": { "upscaler": "4x-UltraSharp", "steps": 10, "denoise": 0.4 },
      "_note": "Measured in docs/worldbuilding/ABP-controlnet-rescue.md. strength 0.30 is NOT a typo: the usable window is 0.30-0.40 and the conventional 0.8-1.0 collapses schnell into flat vector art (-88% detail). Steps and strength interact — 8 steps at strength >= 0.50 produced a cutout halo. Do not reach for end_percent to fix flatness; reach for lower strength. EVIDENCE IS THIN: two subjects (Gildmark, Norhollow), one seed (12345); steps=16 and strengths 0.40-0.60 were never swept."
    }
  }
}
```

Verify the exact checkpoint filename against the ComfyUI box before committing (`GET /object_info/CheckpointLoaderSimple` lists installed checkpoints). If it differs, use the real name — do not guess.

- [ ] **Step 4: Rewrite `loadForge` to a single options object**

In `charsheet.mjs`, replace the current `loadForge(forgeDir = FORGE_DIR)`:

```js
/** Load forge.config.json + prompts/*.json as one frozen bundle for ONE named profile. */
export function loadForge({ forgeDir = FORGE_DIR, profile } = {}) {
  const config = readJson(path.join(forgeDir, "forge.config.json"));
  if (!profile) {
    throw new Error(
      `loadForge requires an explicit profile — one of ${Object.keys(config.profiles).join(", ")}. ` +
        `There is deliberately no default: inheriting the wrong recipe silently produces wrong-style art.`,
    );
  }
  const resolved = config.profiles?.[profile];
  if (!resolved) {
    throw new Error(
      `unknown profile "${profile}" — expected one of ${Object.keys(config.profiles ?? {}).join(", ")}`,
    );
  }
  return {
    config,
    profile: resolved,
    styleLaws: readJson(path.join(forgeDir, "prompts", "style-laws.json")),
    raceIdentity: readJson(path.join(forgeDir, "prompts", "race-identity.json")),
    jobCostume: readJson(path.join(forgeDir, "prompts", "job-costume.json")),
    outDir: path.join(forgeDir, "out"),
  };
}
```

- [ ] **Step 5: Run the test**

```bash
cd tools/art-forge && node --test tests/forge-config.test.mjs
```
Expected: PASS, all five tests.

- [ ] **Step 6: Commit**

```bash
git add tools/art-forge/forge.config.json tools/art-forge/generate/charsheet.mjs tools/art-forge/tests/forge-config.test.mjs
git commit -m "feat(art-forge): named recipe profiles in forge.config.json v2"
```

---

## Task 3: Migrate character consumers to `forge.profile`

Task 2 left every existing caller reading `forge.config.sampler` / `.silhouettes` / `.muscleGradient`, which no longer exist. The suite is red until this lands — that is intentional and is the safety net.

**Files:**
- Modify: `tools/art-forge/generate/charsheet.mjs` (`requireCell` ~86, `resolveSampler` ~212, `muscleScore` ~233, `buildBaseGraph` ~323, `MODELS` ~295)
- Modify: `tools/art-forge/generate/i2i.mjs` (`silhouetteName` ~55, `buildI2iGraph` ~69, `generateCell` ~108)
- Modify: `tools/art-forge/generate/batch-matrix.mjs` (`cellSeed` ~63, `runMatrix` ~72)

**Interfaces:**
- Consumes: `loadForge({ profile })` and `forge.profile` from Task 2
- Produces: `buildBaseGraph({ ..., models })` — now takes models as a parameter instead of closing over the module const

- [ ] **Step 1: Run the suite to see the breakage**

```bash
cd tools/art-forge && npm test
```
Expected: FAIL. Record which assertions break — that list is your migration checklist.

- [ ] **Step 2: Replace every `forge.config.<recipeKey>` read**

Mechanical substitution across the three files:

| Old | New |
| --- | --- |
| `forge.config.muscleGradient` | `forge.profile.muscleGradient` |
| `forge.config.sampler` | `forge.profile.sampler` |
| `forge.config.silhouettes` | `forge.profile.silhouettes` |

`forge.config.comfy` stays as-is — it is still top-level.

- [ ] **Step 3: Make the two default-arg call sites name their profile**

`i2i.mjs` and `batch-matrix.mjs` both default to `loadForge()`. These are character tools, so they name the character profile explicitly:

```js
export async function generateCell(args, forge = loadForge({ profile: "character" })) {
```

```js
export async function runMatrix(args, forge = loadForge({ profile: "character" })) {
```

The default lives at the call site of a character-specific tool, which is explicit. It does **not** live in the config.

- [ ] **Step 4: Move `MODELS` into the profile**

Delete the frozen module const at `charsheet.mjs:295` and thread models through `buildBaseGraph`:

```js
export function buildBaseGraph({
  positive, negative, seed, denoise, filenamePrefix,
  latentNodes, latentSource, steps, cfg, samplerName, scheduler, shift,
  models,
}) {
```

Inside, replace `MODELS.unet` → `models.unet`, `MODELS.clip` → `models.clip`, `MODELS.clipType` → `models.clipType`, `MODELS.vae` → `models.vae`. Update `buildI2iGraph` to pass `models: forge.profile.models`.

If any test imports `MODELS` by name, update that import to read `forge.profile.models` instead.

- [ ] **Step 5: Run the full suite**

```bash
cd tools/art-forge && npm test
```
Expected: PASS — including Task 2's five tests and the pre-existing `intake-art` / `artifact-gate` suites.

- [ ] **Step 6: Run Gate 1**

```bash
bash scripts/precheck.sh 2>&1 | tail -20
```
Expected: `GATE 1 PASS` with `art-forge: node --test suite  PASS`.

- [ ] **Step 7: Commit**

```bash
git add tools/art-forge/generate/
git commit -m "refactor(art-forge): read recipe values from the named profile"
```

---

## Task 4: DR-002 appendix B — record the non-commercial ruling

**Files:**
- Modify: `docs/worldbuilding/DR-002-flux-dev-licence-risk.md` (append only)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by code — this is the traceability record

- [ ] **Step 1: Append the appendix**

Decision records append; do not edit the existing body or appendix A. Add at the end:

```markdown
---

## Appendix B — 2026-08-02: the premise is withdrawn

**Owner ruling: this is not a commercial project.**

The body above and appendix A both reason from *"This project is a game intended to ship"* — that
premise is now withdrawn by the owner. A non-commercial model licence does not bind a project that
is never commercially released.

**What this cancels.** Every mitigation appendix A proposed is dropped as unnecessary work:
the tiered licence policy for generated art, `gen.license` tagging at intake, the
`licence-restricted` tag, and closing the locally-generated-art exemption in
`scripts/check_asset_manifest.mjs`. The measured-best recipe (schnell + FLUX.1-dev-derived
ControlNet at strength 0.30) is adopted without restriction — see
`docs/superpowers/specs/2026-08-02-environment-art-recipe-design.md`.

**What would reverse this.** Any move toward monetization — sales, advertising, in-app purchases,
paid distribution. At that point appendix A's three options become live again, and every asset
generated under the ControlNet recipe needs review. Nothing in the repo currently tracks which
assets those are, because appendix A's tagging was cancelled; re-deriving the list would mean
re-reading the `gen` blocks and the ABP records.

**Unchanged:** `note` provenance remains mandatory at intake. That was never a licence
mechanism — it is authorship archaeology, and it is what makes the reversal above tractable.
```

- [ ] **Step 2: Verify the render**

```bash
bash ~/.claude/scripts/render-spec-md.sh docs/worldbuilding/DR-002-flux-dev-licence-risk.md
```
Expected: HTML regenerates and opens; appendix B renders with its headings intact.

- [ ] **Step 3: Commit**

```bash
git add docs/worldbuilding/DR-002-flux-dev-licence-risk.md
git commit -m "docs(DR-002): appendix B — non-commercial project, restriction withdrawn"
```

---

## Task 5: `blockin.mjs` — the depth control producer

The ABP's depth generator is *"derived from the EXISTING block-in spec — same masses, same polygons, same draw order as `blockin.mjs`"*. **`blockin.mjs` is not in the repository** — `git ls-files` finds nothing. It was scratchpad-only, the exact failure F-024 existed to fix. Without a committed producer there are no depth images and Tasks 6–7 cannot run.

**Files:**
- Create: `tools/art-forge/generate/blockin.mjs`
- Create: `tools/art-forge/tests/blockin.test.mjs`
- Create: `tools/art-forge/briefs/` (one JSON per subject)

**Interfaces:**
- Consumes: `forge.profile.latent` (`width` 1280, `height` 832) from Task 2
- Produces:
  - `PLANE_DEPTH` — `{ fg: "#b4b4b4", mg: "#8c8c8c", bg: "#333333" }`
  - `buildDepthSvg({ brief, width, height })` → SVG string
  - `renderDepthPng({ brief, width, height, outPath })` → `Promise<string>` resolving to `outPath`

- [ ] **Step 1: Recover the block-in spec before writing code**

Read `docs/worldbuilding/ABP-anchor-model-choice.md` and `ABP-controlnet-rescue.md` for the block-in
description — masses, polygons, draw order. Do **not** invent a composition language. If the
polygon schema is not recoverable from the ABPs, stop and report that: this task then needs a
design decision, not an implementation guess.

- [ ] **Step 2: Write the failing test**

Create `tools/art-forge/tests/blockin.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd tools/art-forge && node --test tests/blockin.test.mjs
```
Expected: FAIL — `Cannot find module '../generate/blockin.mjs'`.

- [ ] **Step 4: Implement `blockin.mjs`**

```js
/**
 * Block-in / depth control producer.
 *
 * Emits a flat three-plane depth ramp as SVG, rasterised to PNG for
 * ControlNet. Fill values are measured, not chosen — see
 * docs/worldbuilding/ABP-controlnet-rescue.md.
 */
export const PLANE_DEPTH = Object.freeze({
  fg: "#b4b4b4",
  mg: "#8c8c8c",
  bg: "#333333",
});

const PLANE_ORDER = ["bg", "mg", "fg"];

/** Build the depth SVG for one brief. Planes draw back to front. */
export function buildDepthSvg({ brief, width, height }) {
  const body = PLANE_ORDER.flatMap((plane) =>
    (brief.planes?.[plane] ?? []).map(
      (poly) => `<polygon points="${poly.points}" fill="${PLANE_DEPTH[plane]}"/>`,
    ),
  ).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${PLANE_DEPTH.bg}"/>`,
    `  ${body}`,
    `</svg>`,
  ].join("\n");
}
```

Add `renderDepthPng` using whatever rasteriser the repo already depends on. Check first —
`asset-forge` may already have one. If nothing exists, shell out to ImageMagick (`magick`), which
the silhouette pipeline already uses per `forge.config.json`'s silhouette note.

- [ ] **Step 5: Run the test**

```bash
cd tools/art-forge && node --test tests/blockin.test.mjs
```
Expected: PASS, all three.

- [ ] **Step 6: Author the four replication briefs**

Create `tools/art-forge/briefs/A1-ART-{02,03,06,07}.json` for Millcross, Embervale, Rooktide and
Cindervast, using the brief text in `docs/worldbuilding/A1-geography-cluster1.md` §9 as the prompt
and the plane polygons you derived in Step 1.

- [ ] **Step 7: Commit**

```bash
git add tools/art-forge/generate/blockin.mjs tools/art-forge/tests/blockin.test.mjs tools/art-forge/briefs/
git commit -m "feat(art-forge): commit the block-in depth producer"
```

---

## Task 6: `env.mjs` — the environment runner

**Files:**
- Create: `tools/art-forge/generate/env.mjs`
- Create: `tools/art-forge/tests/env-graph.test.mjs`

**Interfaces:**
- Consumes: `loadForge({ profile: "environment" })`, `runGraph` from `charsheet.mjs:533`, `renderDepthPng` from Task 5
- Produces: `buildEnvGraph({ brief, seed, depthImage, forge })` → ComfyUI API-format graph object

- [ ] **Step 1: Write the failing test**

The graph shape is fully specified by the ABP's recorded workflow JSON. Assert node types and the
wiring that matters, not every field.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";
import { buildEnvGraph } from "../generate/env.mjs";

const forge = loadForge({ profile: "environment" });
const graph = buildEnvGraph({
  brief: { positive: "a harbour town" },
  seed: 12345,
  depthImage: "cntest/control-depth-A1-ART-02.png",
  forge,
});

test("latent is empty — there is no img2img anchor in this graph", () => {
  const latent = Object.values(graph).find((n) => n.class_type === "EmptySD3LatentImage");
  assert.ok(latent, "expected an EmptySD3LatentImage node");
  assert.equal(latent.inputs.width, 1280);
  assert.equal(latent.inputs.height, 832);
  assert.equal(
    Object.values(graph).some((n) => n.class_type === "VAEEncode"),
    false,
    "a VAEEncode would mean an img2img anchor crept back in",
  );
});

test("controlnet applies at strength 0.30, not the conventional 0.8", () => {
  const apply = Object.values(graph).find((n) => n.class_type === "ControlNetApplyAdvanced");
  assert.equal(apply.inputs.strength, 0.3);
  assert.ok(apply.inputs.vae, "the vae input is schema-optional but functionally required");
});

test("sampler runs at denoise 1.0, steps 8, cfg 1", () => {
  const ks = Object.values(graph).find((n) => n.class_type === "KSampler");
  assert.equal(ks.inputs.denoise, 1.0);
  assert.equal(ks.inputs.steps, 8);
  assert.equal(ks.inputs.cfg, 1);
});

test("sampler takes conditioning from the controlnet, not raw text encode", () => {
  const applyId = Object.entries(graph)
    .find(([, n]) => n.class_type === "ControlNetApplyAdvanced")[0];
  const ks = Object.values(graph).find((n) => n.class_type === "KSampler");
  assert.deepEqual(ks.inputs.positive, [applyId, 0]);
  assert.deepEqual(ks.inputs.negative, [applyId, 1]);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd tools/art-forge && node --test tests/env-graph.test.mjs
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildEnvGraph`**

Port the ABP's recorded JSON. Node ids follow its numbering so the graph stays diffable against the
record. Every tunable reads from `forge.profile` — restate nothing.

```js
export const ENV_NODE = Object.freeze({
  CKPT: "1", POS: "4", NEG: "5", LATENT: "7", KSAMPLER: "8",
  DECODE: "9", SAVE: "10", CN_LOAD: "20", CN_TYPE: "21",
  CN_IMAGE: "22", CN_APPLY: "23",
});

export function buildEnvGraph({ brief, seed, depthImage, forge }) {
  const { models, sampler, latent, controlNet } = forge.profile;
  return {
    [ENV_NODE.CKPT]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: models.checkpoint },
    },
    [ENV_NODE.POS]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: brief.positive },
    },
    [ENV_NODE.NEG]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: [ENV_NODE.CKPT, 1], text: "" },
    },
    [ENV_NODE.CN_LOAD]: {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: models.controlNet },
    },
    [ENV_NODE.CN_TYPE]: {
      class_type: "SetUnionControlNetType",
      inputs: { control_net: [ENV_NODE.CN_LOAD, 0], type: controlNet.type },
    },
    [ENV_NODE.CN_IMAGE]: {
      class_type: "LoadImage",
      inputs: { image: depthImage },
    },
    [ENV_NODE.CN_APPLY]: {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: [ENV_NODE.POS, 0],
        negative: [ENV_NODE.NEG, 0],
        control_net: [ENV_NODE.CN_TYPE, 0],
        image: [ENV_NODE.CN_IMAGE, 0],
        strength: controlNet.strength,
        start_percent: controlNet.startPercent,
        end_percent: controlNet.endPercent,
        vae: [ENV_NODE.CKPT, 2],
      },
    },
    [ENV_NODE.LATENT]: {
      class_type: "EmptySD3LatentImage",
      inputs: { width: latent.width, height: latent.height, batch_size: 1 },
    },
    [ENV_NODE.KSAMPLER]: {
      class_type: "KSampler",
      inputs: {
        model: [ENV_NODE.CKPT, 0],
        positive: [ENV_NODE.CN_APPLY, 0],
        negative: [ENV_NODE.CN_APPLY, 1],
        latent_image: [ENV_NODE.LATENT, 0],
        seed,
        steps: sampler.steps,
        cfg: sampler.cfg,
        sampler_name: sampler.samplerName,
        scheduler: sampler.scheduler,
        denoise: sampler.denoise,
      },
    },
    [ENV_NODE.DECODE]: {
      class_type: "VAEDecode",
      inputs: { samples: [ENV_NODE.KSAMPLER, 0], vae: [ENV_NODE.CKPT, 2] },
    },
    [ENV_NODE.SAVE]: {
      class_type: "SaveImage",
      inputs: { images: [ENV_NODE.DECODE, 0], filename_prefix: `art-forge/env/${brief.id ?? "subject"}` },
    },
  };
}
```

The hires pass is a second graph; add it only after the base graph produces a correct image.

- [ ] **Step 4: Run the test**

```bash
cd tools/art-forge && node --test tests/env-graph.test.mjs
```
Expected: PASS, all four.

- [ ] **Step 5: Validate node types against the live server**

```bash
curl -s "http://100.66.190.100:8188/object_info/ControlNetApplyAdvanced" | head -c 400
curl -s "http://100.66.190.100:8188/object_info/SetUnionControlNetType" | head -c 400
```
Expected: both return schemas. A 404 means the node is not installed and the graph will fail at
queue time — report it rather than working around it. **Do not touch port 8189.**

- [ ] **Step 6: Generate one real image end to end**

```bash
cd tools/art-forge && node generate/env.mjs --brief A1-ART-02 --seed 12345
```
Expected: a PNG in `out/`. Open it. It must read as painted concept art, not flat vector poster art —
flatness means strength is wrong, and the recipe says lower it, not raise it.

- [ ] **Step 7: Commit**

```bash
git add tools/art-forge/generate/env.mjs tools/art-forge/tests/env-graph.test.mjs
git commit -m "feat(art-forge): environment runner — schnell + depth controlnet"
```

---

## Task 7: The replication run

Not a TDD task — a measurement. Its deliverable is a committed record with a verdict.

**Files:**
- Create: `docs/worldbuilding/ABP-controlnet-replication.md`
- Modify: `tools/art-forge/forge.config.json` (the environment `_note`, evidence line only)

**Interfaces:**
- Consumes: Tasks 5 and 6
- Produces: a hold-or-fail verdict that determines whether the environment profile is adopted

- [ ] **Step 1: Generate the matrix**

Four subjects — `A1-ART-02` Millcross, `A1-ART-03` Embervale, `A1-ART-06` Rooktide, `A1-ART-07`
Cindervast — at two seeds (12345 plus one new), at strengths 0.30 and 0.40. That is 16 images.

**Four, not the ABP's "five":** `A1-ART-01` is the world map, which commit `ae74b5f` deliberately
made an authored vector rather than a diffusion image.

- [ ] **Step 2: Build contact sheets**

```bash
cd tools/art-forge && bash generate/contact-sheet.sh
bash compare.sh
```

- [ ] **Step 3: Write the record**

Match the format of the existing ABP files. It must state a verdict in one line — *the recipe holds
across four subjects and two seeds*, or *it does not, and here is where it broke*. A summary that
avoids a verdict is a failed task.

- [ ] **Step 4: Update the evidence line in the environment `_note`**

Replace `EVIDENCE IS THIN: two subjects ... never swept.` with what the replication actually showed.
If the recipe did **not** hold, the profile stays but the note records the failure — the config must
never imply more confidence than the evidence supports.

- [ ] **Step 5: Commit**

```bash
git add docs/worldbuilding/ABP-controlnet-replication.md tools/art-forge/forge.config.json
git commit -m "docs: controlnet recipe replication across four subjects, two seeds"
```

---

## Task 8: Storybook — tabs and filters over the existing group buckets

`tools/asset-storybook/index.html` is a single 103 KB file. It already buckets art-manifest entries
by `group` in `art-groups.json` registry order, renders one section per group, keys sidebar items
`art:<groupId>`, tracks per-group health dots, and sub-groups classes by race. What it lacks is
scale: everything renders as one long page.

**Files:**
- Modify: `tools/asset-storybook/index.html`

**Interfaces:**
- Consumes: existing `bucketArtEntries`, `buildArtCard`, `buildArtClassesBody`, `bumpHealth`
- Produces: a tab bar and a filter input over the existing buckets

**Constraint that must not break:** `scripts/check_asset_manifest.mjs` mirrors the storybook's
render-type resolution *exactly and deliberately*, so *"the gate and the storybook can never
disagree on what a render-type requires."* Behavior must stay identical.

- [ ] **Step 1: Capture the baseline**

```bash
node scripts/check_asset_manifest.mjs && echo "BASELINE GREEN"
```
Open the storybook in Chrome and note every group section that renders, and the health-dot counts.
That list is your regression baseline — there is no unit test for this file.

- [ ] **Step 2: Add the tab bar**

One tab per registered group, driven by the same `art-groups.json` registry order the sections
already use. Do not introduce a second source of group order — read the existing registry.
Default to the first tab; show all groups when a filter is active.

- [ ] **Step 3: Add the filter input**

Free-text over `title` and `tags`, plus the group tabs from Step 2. Filtering hides cards; it must
not re-bucket, re-fetch, or alter health-dot totals — the aggregate health is the sum of every
group's, and a filtered view that changed it would misreport asset health.

- [ ] **Step 4: Verify in a browser, not from source**

Open the storybook. Confirm: every group from Step 1 is still reachable; the health dots read the
same totals; filtering to a term narrows cards and clearing restores them.

- [ ] **Step 5: Re-run the parity gate**

```bash
node scripts/check_asset_manifest.mjs && echo "STILL GREEN"
node --test scripts/tests/check_asset_manifest.test.mjs
```
Expected: both PASS. A failure here means render-type resolution drifted — fix it before proceeding.

- [ ] **Step 6: Commit**

```bash
git add tools/asset-storybook/index.html
git commit -m "feat(storybook): group tabs and filter over art entries"
```

---

## Task 9: Storybook — split the monolith

Do this **after** Task 8, never in the same pass. Adding behavior and moving code simultaneously
makes a regression impossible to bisect.

**Files:**
- Modify: `tools/asset-storybook/index.html`
- Create: `tools/asset-storybook/js/*.mjs` (one module per seam)
- Modify: `tools/asset-storybook/Dockerfile` (if it copies only `index.html`)

- [ ] **Step 1: Split along seams the code already has**

`bucketArtEntries`, `buildArtCard`, `buildArtClassesBody`, the health-dot aggregator, and the
Task 8 tab/filter layer. Move code **verbatim** — no renames, no signature changes, no
"while I'm here" improvements. Mechanical only.

- [ ] **Step 2: Check the Dockerfile still serves everything**

```bash
grep -n "COPY" tools/asset-storybook/Dockerfile
```
If it copies `index.html` alone, the new `js/` directory must be added or the container serves a
broken page while local dev works.

- [ ] **Step 3: Verify in a browser and re-run the parity gate**

```bash
node scripts/check_asset_manifest.mjs
node --test scripts/tests/check_asset_manifest.test.mjs
```
Plus the same visual checks as Task 8 Step 4. The page must be indistinguishable from before.

- [ ] **Step 4: Build and run the container**

```bash
docker build -t asset-storybook:local tools/asset-storybook && docker run --rm -p 8080:80 asset-storybook:local
```
Open `http://localhost:8080`. Confirm it matches local dev.

- [ ] **Step 5: Commit**

```bash
git add tools/asset-storybook/
git commit -m "refactor(storybook): split index.html along existing seams"
```

---

## Self-Review

**Spec coverage.** §4.1 config profiles → Tasks 2–3. §4.1 DR-002 appendix B → Task 4. §4.2 runner →
Task 6, with the depth producer the spec surfaced as a gap → Task 5. §4.3 replication → Task 7.
§4.4 storybook → Tasks 8–9. §5's Gate 1 correction → Task 1. All covered.

**Type consistency.** `loadForge({ profile })` returns `forge.profile` in Task 2 and every later
task reads `forge.profile.*`. `buildBaseGraph` gains `models` in Task 3 and Task 6's `buildEnvGraph`
reads `forge.profile.models`. `PLANE_DEPTH` / `buildDepthSvg` are defined in Task 5 and consumed by
Task 6's `depthImage` argument.

**Known soft spot.** Task 5 Step 1 depends on the block-in polygon schema being recoverable from the
ABP records. If it is not, that task converts from implementation to design and needs a decision
before proceeding — this is called out in the step itself rather than papered over.
