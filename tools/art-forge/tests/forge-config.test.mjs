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

test("environment profile pins the checkpoint verified against the live ComfyUI server", () => {
  const forge = loadForge({ profile: "environment" });
  assert.equal(forge.profile.models.checkpoint, "flux1-schnell-fp8.safetensors");
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
