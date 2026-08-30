import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";
import { renderDepthPng, renderSegmentPng } from "../generate/blockin.mjs";
import {
  CONTROL_RENDERER,
  ENV_NODE,
  HIRES_NODE,
  buildEnvAnchorGraph,
  buildEnvGraph,
  buildEnvHiresGraph,
  buildEnvNegative,
  buildEnvPositive,
  controlOutputId,
  formatStrength,
  generateEnv,
  resolveControl,
  resolveModel,
  resolveStrength,
  townCriteriaForbiddenTokens,
  validateBrief,
} from "../generate/env.mjs";

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

test("composed prompt carries the style clause and a non-empty negative — a bare brief prompt reproduced the A1-ART-02 modern-contamination failure (pickup trucks, an SUV, a contemporary skyline) on the first real generation", () => {
  const positive = buildEnvPositive("a harbour town", forge);
  const negative = buildEnvNegative(forge);
  const composed = buildEnvGraph({
    brief: { positive, negative },
    seed: 12345,
    depthImage: "cntest/control-depth-A1-ART-02.png",
    forge,
  });
  assert.equal(composed[ENV_NODE.POS].inputs.text, positive);
  assert.equal(composed[ENV_NODE.NEG].inputs.text, negative);
  assert.ok(positive.includes(forge.profile.styleGuard.medium), "positive must lead with the medium clause");
  assert.notEqual(negative, "", "negative prompt must not be empty");
  assert.ok(!negative.includes("fur"), "fur is character-specific and must not leak into environment negatives");
  assert.ok(
    negative.includes("power lines"),
    "the negative CONDITIONING node must still carry the modern-contamination vocabulary from forge.config.json profiles.environment.styleGuard.forbiddenTokens",
  );
  // F-039: that vocabulary is data for the negative node and for
  // prompt-lint's R2 rule. It must never be spliced into the POSITIVE
  // string again — writing "no power lines" there delivers `power lines`.
  assert.ok(!positive.includes("power lines"), "forbidden tokens must not appear in the positive prompt");
  assert.ok(positive.includes(forge.profile.styleGuard.era), "positive must carry the era assertion");
  // Register ruling 2026-08-30 (anchor verdict rail 5, option a): the house
  // styleLaws vocabulary is character data and must not reach env prompts —
  // the cel register measurably beat the medium clause 2/3 cells in-prompt.
  for (const banned of ["anime", "cel-shaded", "ink linework", "genshin"]) {
    assert.ok(!positive.toLowerCase().includes(banned), `character vocabulary "${banned}" must not reach the env positive`);
  }
  assert.ok(
    !positive.includes(forge.styleLaws.styleClause[0]),
    "the character styleClause is not environment register — env positives compose from styleGuard only",
  );
});

test("mustCompose: the composed positive carries every clause the styleGuard lists — the A8 medium clause shipped unguarded once (3944eba)", () => {
  const positive = buildEnvPositive("a harbour town", forge);
  for (const key of forge.profile.styleGuard.mustCompose ?? []) {
    const clause = forge.profile.styleGuard[key];
    assert.ok(typeof clause === "string" && clause.length > 0, `styleGuard.${key} must be a non-empty clause`);
    assert.ok(positive.includes(clause), `composed positive omits styleGuard.${key}`);
  }
});

test("mustCompose: a styleGuard listing a clause it does not carry fails at composition, not after the render queue", () => {
  const broken = structuredClone(forge);
  delete broken.profile.styleGuard.medium;
  assert.throws(
    () => buildEnvPositive("a harbour town", broken),
    /mustCompose lists "medium" but styleGuard\.medium is missing or empty/,
  );
});

test("output filename carries the seed and strength — a 2-seed x 2-strength sweep must not overwrite itself", () => {
  const g1 = buildEnvGraph({
    brief: { positive: "a harbour town", id: "A1-ART-02" },
    seed: 12345,
    depthImage: "cntest/control-depth-A1-ART-02.png",
    forge,
    strength: 0.3,
  });
  const g2 = buildEnvGraph({
    brief: { positive: "a harbour town", id: "A1-ART-02" },
    seed: 12345,
    depthImage: "cntest/control-depth-A1-ART-02.png",
    forge,
    strength: 0.4,
  });
  const g3 = buildEnvGraph({
    brief: { positive: "a harbour town", id: "A1-ART-02" },
    seed: 741852,
    depthImage: "cntest/control-depth-A1-ART-02.png",
    forge,
    strength: 0.3,
  });
  const prefix = (g) => g[ENV_NODE.SAVE].inputs.filename_prefix;
  const prefixes = new Set([prefix(g1), prefix(g2), prefix(g3)]);
  assert.equal(prefixes.size, 3, "all three cells of a seed x strength sweep must produce distinct filenames");
  assert.equal(prefix(g1), "art-forge/env/A1-ART-02-seed12345-s0.30");
  assert.equal(prefix(g2), "art-forge/env/A1-ART-02-seed12345-s0.40");
});

test("buildEnvGraph defaults strength to forge.profile.controlNet.strength when no override is given", () => {
  const apply = Object.values(graph).find((n) => n.class_type === "ControlNetApplyAdvanced");
  assert.equal(apply.inputs.strength, forge.profile.controlNet.strength);
});

test("formatStrength renders two decimal places, matching the ABP replication driver's naming (seed12345-s0.30)", () => {
  assert.equal(formatStrength(0.3), "0.30");
  assert.equal(formatStrength(0.4), "0.40");
  assert.equal(formatStrength(1), "1.00");
});

test("validateBrief rejects an empty/missing prompt — an undefined prompt would join the literal string 'undefined' into the positive prompt", () => {
  assert.throws(
    () => validateBrief({ masses: [{}] }, "A1-ART-99", "/fake/A1-ART-99.json"),
    /A1-ART-99.*\/fake\/A1-ART-99\.json.*prompt/s,
  );
  assert.throws(
    () => validateBrief({ prompt: "  ", masses: [{}] }, "A1-ART-99", "/fake/A1-ART-99.json"),
    /prompt/,
  );
});

test("validateBrief rejects an empty/missing masses — depthPlanesFromBrief would otherwise produce only the black canvas rect, no depth signal", () => {
  assert.throws(
    () => validateBrief({ prompt: "a town" }, "A1-ART-99", "/fake/A1-ART-99.json"),
    /A1-ART-99.*\/fake\/A1-ART-99\.json.*masses/s,
  );
  assert.throws(
    () => validateBrief({ prompt: "a town", masses: [] }, "A1-ART-99", "/fake/A1-ART-99.json"),
    /masses/,
  );
});

test("validateBrief accepts a well-formed brief and returns it unchanged", () => {
  const brief = { prompt: "a town", masses: [{ name: "x" }] };
  assert.equal(validateBrief(brief, "A1-ART-99", "/fake/A1-ART-99.json"), brief);
});

/* --------------------------- control selection --------------------------- */

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

test("resolveControl wires each control key to its OWN renderer — a depth/segment mixup would render the wrong control image while every other assertion (type/strength/block) stays green", () => {
  assert.equal(
    CONTROL_RENDERER.depth,
    renderDepthPng,
    "CONTROL_RENDERER.depth must be renderDepthPng, not renderSegmentPng or anything else",
  );
  assert.equal(
    CONTROL_RENDERER.segment,
    renderSegmentPng,
    "CONTROL_RENDERER.segment must be renderSegmentPng — if this were renderDepthPng, a " +
      "--control segment run would silently stage a DEPTH png under the segment filename, " +
      "defeating the whole feature while every other assertion here stays green",
  );
  assert.equal(resolveControl({ forge, control: "depth" }).render, renderDepthPng);
  assert.equal(resolveControl({ forge, control: "segment" }).render, renderSegmentPng);
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

test("generateEnv (dry-run, end to end) embeds the control-qualified filename in the queued graph — buildEnvGraph alone can't catch this: generateEnv builds brief.id itself before calling it, and a bug there (e.g. leaving brief.id bare) would let a segment run's SaveImage.filename_prefix collide with depth's on the ComfyUI server", async () => {
  const graph = await generateEnv(
    { brief: "A1-ART-02", seed: 12345, control: "segment", strength: "0.45", "dry-run": true },
    forge,
  );
  assert.equal(
    graph[ENV_NODE.SAVE].inputs.filename_prefix,
    "art-forge/env/A1-ART-02-segment-seed12345-s0.45",
    "a segment run's embedded output filename must carry -segment- so it never collides with a depth run's",
  );
});

test("generateEnv (dry-run, end to end) keeps depth's embedded filename bare — F-026 byte-for-byte", async () => {
  const graph = await generateEnv(
    { brief: "A1-ART-02", seed: 12345, "dry-run": true },
    forge,
  );
  assert.equal(
    graph[ENV_NODE.SAVE].inputs.filename_prefix,
    "art-forge/env/A1-ART-02-seed12345-s0.30",
  );
});

/* ------------------------ dev model (--model dev) ------------------------ */

test("resolveModel defaults to schnell and rejects unknown models by name", () => {
  assert.equal(resolveModel({ forge, model: undefined }).model, "schnell");
  assert.equal(resolveModel({ forge, model: "dev" }).model, "dev");
  assert.throws(() => resolveModel({ forge, model: "schnelll" }), /schnelll.*schnell, dev/s);
});

test("dev graph swaps to the dev checkpoint, adds FluxGuidance 5.0 and ConditioningZeroOut, and uses the measured dev sampler", () => {
  const g = buildEnvGraph({
    brief: { positive: "a crossing town", id: "A1-ART-02-dev" },
    seed: 12345,
    depthImage: "cntest/control-depth-A1-ART-02.png",
    forge,
    model: "dev",
  });
  assert.equal(g[ENV_NODE.CKPT].inputs.ckpt_name, "flux1-dev-fp8.safetensors");
  const guid = Object.values(g).find((n) => n.class_type === "FluxGuidance");
  assert.equal(guid.inputs.guidance, 5.0, "guidance 5.0 is the measured standard (ABP-flux-dev-and-anchor)");
  const zero = Object.values(g).find((n) => n.class_type === "ConditioningZeroOut");
  assert.ok(zero, "dev follows the authoritative template's ZeroOut negative");
  const apply = Object.values(g).find((n) => n.class_type === "ControlNetApplyAdvanced");
  assert.deepEqual(apply.inputs.positive, [Object.entries(g).find(([, n]) => n.class_type === "FluxGuidance")[0], 0]);
  assert.deepEqual(apply.inputs.negative, [Object.entries(g).find(([, n]) => n.class_type === "ConditioningZeroOut")[0], 0]);
  const ks = Object.values(g).find((n) => n.class_type === "KSampler");
  assert.equal(ks.inputs.steps, 20);
  assert.equal(ks.inputs.cfg, 1);
  assert.equal(ks.inputs.denoise, 1.0);
});

test("schnell graph stays untouched by the dev path — no FluxGuidance, frozen checkpoint", () => {
  const classes = Object.values(graph).map((n) => n.class_type);
  assert.equal(classes.includes("FluxGuidance"), false);
  assert.equal(classes.includes("ConditioningZeroOut"), false);
  assert.equal(graph[ENV_NODE.CKPT].inputs.ckpt_name, "flux1-schnell-fp8.safetensors");
});

test("dev freehand output ids carry -dev- so a dev roll never overwrites a schnell roll", () => {
  assert.equal(
    controlOutputId({ briefId: "A1-ART-02", control: "none", seed: 12345, strength: null, model: "dev" }),
    "A1-ART-02-none-dev-seed12345",
  );
  assert.equal(
    controlOutputId({ briefId: "A1-ART-02", control: "depth", seed: 12345, strength: 0.3, model: "dev" }),
    "A1-ART-02-dev-seed12345-s0.30",
  );
});

test("anchor graph is a dev img2img: grained block-in -> VAEEncode -> KSampler denoise 0.75 over 27 steps", () => {
  const g = buildEnvAnchorGraph({
    brief: { positive: "a crossing town", id: "A1-ART-02-dev" },
    seed: 12345,
    anchorImage: "art-forge/A1-ART-02-depth-grained.png",
    forge,
  });
  const load = Object.values(g).find((n) => n.class_type === "LoadImage");
  assert.equal(load.inputs.image, "art-forge/A1-ART-02-depth-grained.png");
  const ks = Object.values(g).find((n) => n.class_type === "KSampler");
  assert.deepEqual(ks.inputs.latent_image, [Object.entries(g).find(([, n]) => n.class_type === "VAEEncode")[0], 0]);
  assert.equal(ks.inputs.steps, 27);
  assert.equal(ks.inputs.denoise, 0.75);
  const guid = Object.values(g).find((n) => n.class_type === "FluxGuidance");
  assert.equal(guid.inputs.guidance, 5.0);
  const save = Object.values(g).find((n) => n.class_type === "SaveImage");
  assert.equal(save.inputs.filename_prefix, "art-forge/env/A1-ART-02-dev-anchor-seed12345");
});

/* ---------------------- freehand (--control none) ---------------------- */

test("town criteria vocabulary merges into the lint — a cliché token in a town brief throws R2", () => {
  const tokens = townCriteriaForbiddenTokens();
  assert.ok(tokens.includes("storybook"), "the reviewer's anti-cliché vocabulary is loaded");
  assert.ok(tokens.includes("tidy rows"), "the reviewer's forbidden phrases are loaded");
  assert.throws(
    () => buildEnvPositive("a storybook village of neat houses", forge, { extraForbiddenTokens: tokens }),
    /R2-forbidden-token/,
  );
});

test("resolveControl accepts none with no config block and no renderer — freehand needs neither", () => {
  const r = resolveControl({ forge, control: "none" });
  assert.equal(r.control, "none");
  assert.equal(r.block, null);
  assert.equal(r.render, null);
});

test("freehand graph drops every ControlNet node and conditions straight from the text encodes", () => {
  const g = buildEnvGraph({
    brief: { positive: "a crossing town", id: "A1-ART-02-none" },
    seed: 12345,
    depthImage: null,
    forge,
    strength: null,
    controlNet: null,
  });
  const classes = Object.values(g).map((n) => n.class_type);
  assert.equal(classes.includes("ControlNetLoader"), false, "no control net to load");
  assert.equal(classes.includes("SetUnionControlNetType"), false);
  assert.equal(classes.includes("LoadImage"), false, "no control image to load");
  assert.equal(classes.includes("ControlNetApplyAdvanced"), false);
  const ks = Object.values(g).find((n) => n.class_type === "KSampler");
  assert.deepEqual(ks.inputs.positive, [ENV_NODE.POS, 0], "sampler conditions from raw text encode");
  assert.deepEqual(ks.inputs.negative, [ENV_NODE.NEG, 0]);
});

test("none output ids carry no strength suffix — there is no strength to sweep", () => {
  assert.equal(
    controlOutputId({ briefId: "A1-ART-02", control: "none", seed: 12345, strength: null }),
    "A1-ART-02-none-seed12345",
  );
});

test("resolveStrength is a no-op for none — a freehand run has no strength to measure", () => {
  assert.equal(resolveStrength({ control: "none", block: null, override: undefined }), null);
});

test("generateEnv (dry-run, end to end) stages no control image for freehand and names the output -none-", async () => {
  const graph = await generateEnv(
    { brief: "A1-ART-02", seed: 12345, control: "none", "dry-run": true },
    forge,
  );
  const classes = Object.values(graph).map((n) => n.class_type);
  assert.equal(classes.includes("LoadImage"), false, "freehand must not load a control image");
  assert.equal(
    graph[ENV_NODE.SAVE].inputs.filename_prefix,
    "art-forge/env/A1-ART-02-none-seed12345",
  );
});

/* --------------------------- hires graph --------------------------- */

const hiresGraph = buildEnvHiresGraph({
  brief: { positive: "a harbour town", negative: "no cars", id: "A1-ART-02" },
  seed: 12345,
  baseImage: "art-forge/A1-ART-02-seed12345-s0.30.png",
  forge,
});

test("hires graph shape: UpscaleModelLoader -> ImageUpscaleWithModel -> ImageScale -> VAEEncode -> KSampler -> VAEDecode -> SaveImage", () => {
  const classTypes = Object.fromEntries(
    Object.entries(hiresGraph).map(([id, n]) => [id, n.class_type]),
  );
  assert.equal(classTypes[HIRES_NODE.UPSCALE_LOAD], "UpscaleModelLoader");
  assert.equal(classTypes[HIRES_NODE.UPSCALE_MODEL], "ImageUpscaleWithModel");
  assert.equal(classTypes[HIRES_NODE.SCALE], "ImageScale");
  assert.equal(classTypes[HIRES_NODE.ENCODE], "VAEEncode");
  assert.equal(classTypes[HIRES_NODE.KSAMPLER], "KSampler");
  assert.equal(classTypes[HIRES_NODE.DECODE], "VAEDecode");
  assert.equal(classTypes[HIRES_NODE.SAVE], "SaveImage");

  const upscale = hiresGraph[HIRES_NODE.UPSCALE_MODEL];
  assert.deepEqual(upscale.inputs.upscale_model, [HIRES_NODE.UPSCALE_LOAD, 0]);
  assert.deepEqual(upscale.inputs.image, [HIRES_NODE.LOAD_BASE, 0]);

  const scale = hiresGraph[HIRES_NODE.SCALE];
  assert.deepEqual(scale.inputs.image, [HIRES_NODE.UPSCALE_MODEL, 0]);

  const encode = hiresGraph[HIRES_NODE.ENCODE];
  assert.deepEqual(encode.inputs.pixels, [HIRES_NODE.SCALE, 0]);

  const ks = hiresGraph[HIRES_NODE.KSAMPLER];
  assert.deepEqual(ks.inputs.latent_image, [HIRES_NODE.ENCODE, 0]);

  const decode = hiresGraph[HIRES_NODE.DECODE];
  assert.deepEqual(decode.inputs.samples, [HIRES_NODE.KSAMPLER, 0]);

  const save = hiresGraph[HIRES_NODE.SAVE];
  assert.deepEqual(save.inputs.images, [HIRES_NODE.DECODE, 0]);
});

test("hires graph loads the re-uploaded base image, not the depth control image", () => {
  const load = hiresGraph[HIRES_NODE.LOAD_BASE];
  assert.equal(load.class_type, "LoadImage");
  assert.equal(load.inputs.image, "art-forge/A1-ART-02-seed12345-s0.30.png");
});

test("hires values come from forge.config.json profiles.environment.hires — steps 10, denoise 0.40, upscaler filename with extension", () => {
  assert.equal(forge.profile.hires.steps, 10);
  assert.equal(forge.profile.hires.denoise, 0.4);
  assert.equal(forge.profile.hires.upscaler, "4x-UltraSharp.pth");

  const upscaleLoad = hiresGraph[HIRES_NODE.UPSCALE_LOAD];
  assert.equal(upscaleLoad.inputs.model_name, forge.profile.hires.upscaler);
  assert.equal(upscaleLoad.inputs.model_name, "4x-UltraSharp.pth");

  const ks = hiresGraph[HIRES_NODE.KSAMPLER];
  assert.equal(ks.inputs.steps, forge.profile.hires.steps);
  assert.equal(ks.inputs.denoise, forge.profile.hires.denoise);
  assert.equal(ks.inputs.steps, 10);
  assert.equal(ks.inputs.denoise, 0.4);
});

test("hires target resolution comes from config — 1.5x base (1920x1248), not a naive 4x (5120x3328)", () => {
  const scale = hiresGraph[HIRES_NODE.SCALE];
  assert.equal(scale.inputs.width, forge.profile.hires.width);
  assert.equal(scale.inputs.height, forge.profile.hires.height);
  assert.equal(scale.inputs.width, 1920);
  assert.equal(scale.inputs.height, 1248);
  assert.equal(scale.inputs.upscale_method, "lanczos");
  assert.equal(scale.inputs.crop, "disabled");
});

test("hires sampler reuses the base sampler's cfg/sampler_name/scheduler — only steps/denoise change", () => {
  const ks = hiresGraph[HIRES_NODE.KSAMPLER];
  assert.equal(ks.inputs.cfg, forge.profile.sampler.cfg);
  assert.equal(ks.inputs.sampler_name, forge.profile.sampler.samplerName);
  assert.equal(ks.inputs.scheduler, forge.profile.sampler.scheduler);
  assert.equal(ks.inputs.seed, 12345);
});

test("hires sampler conditions from plain CLIPTextEncode, not a ControlNetApplyAdvanced node — the hires graph carries no ControlNet nodes at all", () => {
  assert.equal(
    Object.values(hiresGraph).some((n) => n.class_type === "ControlNetApplyAdvanced"),
    false,
    "the hires pass must not re-apply ControlNet — see buildEnvHiresGraph's doc-comment",
  );
  const ks = hiresGraph[HIRES_NODE.KSAMPLER];
  assert.deepEqual(ks.inputs.positive, [HIRES_NODE.POS, 0]);
  assert.deepEqual(ks.inputs.negative, [HIRES_NODE.NEG, 0]);
  assert.equal(hiresGraph[HIRES_NODE.POS].inputs.text, "a harbour town");
  assert.equal(hiresGraph[HIRES_NODE.NEG].inputs.text, "no cars");
});

test("hires output filename is distinct from the base pass filename for the same seed", () => {
  const save = hiresGraph[HIRES_NODE.SAVE];
  assert.equal(save.inputs.filename_prefix, "art-forge/env/A1-ART-02-seed12345-hires");
});
