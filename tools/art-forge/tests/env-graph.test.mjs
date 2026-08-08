import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";
import {
  ENV_NODE,
  HIRES_NODE,
  buildEnvGraph,
  buildEnvHiresGraph,
  buildEnvNegative,
  buildEnvPositive,
  controlOutputId,
  formatStrength,
  resolveControl,
  resolveStrength,
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
  assert.ok(positive.includes(forge.styleLaws.styleClause[0]), "positive must carry the styleClause");
  assert.notEqual(negative, "", "negative prompt must not be empty");
  assert.ok(!negative.includes("no fur"), "no fur is character-specific and must not leak into environment negatives");
  assert.ok(
    negative.includes("no modern vehicles"),
    "negative must carry the anti-modern-contamination guard from forge.config.json profiles.environment.styleGuard",
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
