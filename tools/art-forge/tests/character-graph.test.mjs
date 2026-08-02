import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadForge,
  requireCell,
  resolveSampler,
  NODE,
} from "../generate/charsheet.mjs";
import { buildI2iGraph, silhouetteName } from "../generate/i2i.mjs";
import { cellSeed } from "../generate/batch-matrix.mjs";

/**
 * Regression guard for Task 3 (F-026): every one of these functions used to
 * read `forge.config.<key>`, which stopped existing when Task 2 restructured
 * forge.config.json into named profiles. The migration to `forge.profile.<key>`
 * fails SILENTLY if it regresses — you still get a graph and an image, just
 * built from the wrong (or a stale/default) recipe. These tests build the
 * REAL img2img graph through the REAL exported functions and read the
 * resulting KSampler/loader node inputs, so a future change that points a
 * consumer at the wrong profile, or drops a value on the way through, fails
 * a test instead of silently shipping off-style art.
 */

function buildCharacterGraph() {
  const forge = loadForge({ profile: "character" });
  const { race, job } = requireCell({ race: "human", job: "swordsman" }, forge);
  const sampler = resolveSampler({}, forge);
  const graph = buildI2iGraph({
    race,
    job,
    seed: 1,
    forge,
    sampler,
    denoise: forge.profile.sampler.denoise,
  });
  return { forge, graph };
}

test("character img2img graph's KSampler carries the F-024 frozen recipe (denoise 0.82, steps 24, cfg 3)", () => {
  const { graph } = buildCharacterGraph();
  const ksampler = graph[NODE.KSAMPLER].inputs;
  // Asserted against literal values, not forge.profile.sampler.* — this must
  // fail if the frozen recipe drifts OR if a consumer silently reads the
  // wrong profile (e.g. "environment", whose denoise/steps/cfg are 1.0/8/1).
  assert.equal(ksampler.denoise, 0.82);
  assert.equal(ksampler.steps, 24);
  assert.equal(ksampler.cfg, 3);
});

test("character img2img graph's loader nodes carry profiles.character.models", () => {
  const { forge, graph } = buildCharacterGraph();
  // Literal values: what the MODELS const used to hardcode, now expected to
  // arrive via forge.profile.models instead.
  assert.equal(graph[NODE.UNET].inputs.unet_name, "z_image_turbo_bf16.safetensors");
  assert.equal(graph[NODE.CLIP].inputs.clip_name, "qwen_3_4b.safetensors");
  assert.equal(graph[NODE.CLIP].inputs.type, "lumina2");
  assert.equal(graph[NODE.VAE].inputs.vae_name, "ae.safetensors");
  // And confirm they are the SAME values loadForge resolved for this
  // profile — i.e. the wiring, not a coincidence of two hardcoded literals.
  assert.equal(graph[NODE.UNET].inputs.unet_name, forge.profile.models.unet);
  assert.equal(graph[NODE.CLIP].inputs.clip_name, forge.profile.models.clip);
  assert.equal(graph[NODE.CLIP].inputs.type, forge.profile.models.clipType);
  assert.equal(graph[NODE.VAE].inputs.vae_name, forge.profile.models.vae);
});

test("silhouetteName reads the character profile's silhouettes.prefix", () => {
  const forge = loadForge({ profile: "character" });
  assert.equal(silhouetteName("swordsman", forge), "sil-swordsman.png");
});

test("cellSeed reads the character profile's muscleGradient axes", () => {
  const forge = loadForge({ profile: "character" });
  const { raceAxis, jobAxis } = forge.profile.muscleGradient;
  const base = 100;
  const race = raceAxis[2];
  const job = jobAxis[3];
  const seed = cellSeed(base, race, job, forge);
  assert.equal(
    seed,
    base + raceAxis.indexOf(race) * jobAxis.length + jobAxis.indexOf(job),
  );
});
