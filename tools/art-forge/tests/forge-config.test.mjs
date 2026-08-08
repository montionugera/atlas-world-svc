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

test("environment profile pins the controlNet verified against the live ComfyUI server", () => {
  const forge = loadForge({ profile: "environment" });
  assert.equal(forge.profile.models.controlNet, "flux-controlnet-union-pro-2.0.safetensors");
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
