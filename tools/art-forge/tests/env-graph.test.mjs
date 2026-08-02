import { test } from "node:test";
import assert from "node:assert/strict";
import { loadForge } from "../generate/charsheet.mjs";
import { ENV_NODE, buildEnvGraph, buildEnvNegative, buildEnvPositive } from "../generate/env.mjs";

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
