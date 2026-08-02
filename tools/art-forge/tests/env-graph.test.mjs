import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";
import {
  ENV_NODE,
  buildEnvGraph,
  buildEnvNegative,
  buildEnvPositive,
  formatStrength,
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
