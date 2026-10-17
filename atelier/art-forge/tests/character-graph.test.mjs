import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadForge,
  requireCell,
  resolveSampler,
  NODE,
} from "../generate/charsheet.mjs";
import { buildI2iGraph, silhouetteName, generateCell } from "../generate/i2i.mjs";
import { cellSeed } from "../generate/batch-matrix.mjs";
import { generateCharsheet } from "../generate/charsheet.mjs";

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

/**
 * Final-review Finding 4: generateCell (below) has this exact guard, but
 * generateCharsheet (the txt2img entry point, `node generate/charsheet.mjs
 * --race ... --job ...` -> `generateCharsheet(parseArgs())`) had NO test
 * exercising its own `loadForge({ profile: "character" })` default. Mutating
 * generateCell's default to "environment" already failed a test; mutating
 * generateCharsheet's default the same way failed nothing — the same
 * silent-wrong-style class this branch built the guard for, just on the
 * sibling entry point. This test drives generateCharsheet with NO forge
 * argument and asserts the built graph carries the character profile's
 * values: steps/cfg (24/3 for character vs 8/1 for environment) and the
 * character profile's unet loader model (the environment profile has no
 * `models.unet` at all, so a wrong default would leave it undefined).
 */
test("generateCharsheet with no forge argument resolves the character profile end to end", async () => {
  const graph = await generateCharsheet({
    race: "human",
    job: "swordsman",
    seed: 1,
    "dry-run": true,
  });
  assert.ok(graph, "dry-run must return the built graph, not null, to be testable");
  const ksampler = graph[NODE.KSAMPLER].inputs;
  assert.equal(ksampler.steps, 24);
  assert.equal(ksampler.cfg, 3);
  assert.equal(graph[NODE.UNET].inputs.unet_name, "z_image_turbo_bf16.safetensors");
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

/**
 * Code-review follow-up (Important 1 + Important 2): the four tests above
 * all call loadForge({ profile: "character" }) themselves and invoke the
 * graph builder directly — none of them route through generateCell, which
 * is where the profile default is ACTUALLY chosen at the real CLI entry
 * point. A wrong default (e.g. loadForge({ profile: "environment" })) or a
 * broken denoise fallback (generateCell's
 * parseDenoiseOverride(args.denoise, forge.profile.sampler.denoise)) would
 * both leave every test above green, since they never exercise that code.
 *
 * This test drives generateCell with NO forge argument at all — the exact
 * shape of a real CLI invocation (`node generate/i2i.mjs --race ... --job
 * ...`, which calls `generateCell(parseArgs())`) — and inspects the graph
 * `runGraph` returns on --dry-run (as of this diff, --dry-run returns the
 * built graph instead of null, specifically so this is unit-testable
 * without a live ComfyUI box). It closes both findings: a wrong default
 * profile changes the KSampler's steps/cfg/denoise (environment is
 * 1.0/8/1, character is 0.82/24/3), and a broken denoise fallback changes
 * ONLY denoise while leaving steps/cfg alone.
 */
test("generateCell with no forge argument resolves the character profile's frozen recipe end to end", async () => {
  const graph = await generateCell({
    race: "human",
    job: "swordsman",
    seed: 1,
    "dry-run": true,
  });
  assert.ok(graph, "dry-run must return the built graph, not null, to be testable");
  const ksampler = graph[NODE.KSAMPLER].inputs;
  assert.equal(ksampler.denoise, 0.82);
  assert.equal(ksampler.steps, 24);
  assert.equal(ksampler.cfg, 3);
});
