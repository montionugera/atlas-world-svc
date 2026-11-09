// F-210: POC-05 Disturbance — A Bell Out of Time & The Impossible Flame (07:45–10:00).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("maro-bell.json contains npc-spot-edda near the Great Bell staircase with correct coordinates", () => {
  const doc = JSON.parse(readFileSync(resolve(ROOT, "content/maps/maro-bell.json"), "utf8"));
  const structures = doc.structures;

  const eddaSpot = structures.find((s) => s.id === "npc-spot-edda");
  assert.ok(eddaSpot, "npc-spot-edda structure exists");
  assert.equal(eddaSpot.x, -3, "edda x position is -3m");
  assert.equal(eddaSpot.z, -57, "edda z position is -57m");
});

test("MaroBellPocController.cs declares Edda NPC, Time-Wound lantern event, and Whispering Glade hook", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("EddaWorldPos = new(-3.0f, 0f, -57.0f)"), "EddaWorldPos constant");
  assert.ok(code.includes("TimeWoundLanternWorldPos = new(2.5f, 0f, -54.0f)"), "TimeWoundLanternWorldPos constant");
  assert.ok(code.includes("EntityView? EddaView"), "EddaView property");
  assert.ok(code.includes("Node3D? TimeWoundLanternNode"), "TimeWoundLanternNode property");
  assert.ok(code.includes("OmniLight3D? TimeWoundLanternLight"), "TimeWoundLanternLight property");
  assert.ok(code.includes("MeshInstance3D? TimeWoundLanternGlowMesh"), "TimeWoundLanternGlowMesh property");

  assert.ok(code.includes("public bool EddaSpoken"), "EddaSpoken property");
  assert.ok(code.includes("public bool TimeWoundTriggered"), "TimeWoundTriggered property");
  assert.ok(code.includes("public bool TimeWoundStabilized"), "TimeWoundStabilized property");
  assert.ok(code.includes("public bool GladeHookUnlocked"), "GladeHookUnlocked property");

  assert.ok(code.includes("InteractWithEdda"), "InteractWithEdda method");
  assert.ok(code.includes("TriggerTimeWoundEvent"), "TriggerTimeWoundEvent method");
  assert.ok(code.includes("StabilizeTimeWoundLantern"), "StabilizeTimeWoundLantern method");
  assert.ok(code.includes("ActiveBeat = \"POC-05\""), "transitions active beat to POC-05");
});

test("MaroBellVerify.cs integrates VerifyPoc05DisturbanceEddaTimeWound probe assertions", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellVerify.cs"), "utf8");

  assert.ok(code.includes("VerifyPoc05DisturbanceEddaTimeWound(doc)"), "VerifyPoc05DisturbanceEddaTimeWound called in Run()");
  assert.ok(code.includes("InteractWithEdda"), "InteractWithEdda verified");
  assert.ok(code.includes("TriggerTimeWoundEvent"), "TriggerTimeWoundEvent verified");
  assert.ok(code.includes("StabilizeTimeWoundLantern"), "StabilizeTimeWoundLantern verified");
  assert.ok(code.includes("GladeHookUnlocked"), "GladeHookUnlocked verified");
  assert.ok(code.includes("POC-05"), "POC-05 beat transition verified");
});

test("server-rs meta engine registers trigger_poc_time_wound RPC with isolated persistence", () => {
  const code = readFileSync(resolve(ROOT, "server-rs/src/meta/engine.rs"), "utf8");

  assert.ok(code.includes("\"trigger_poc_time_wound\""), "trigger_poc_time_wound RPC registered");
  assert.ok(code.includes("rpc_trigger_poc_time_wound"), "rpc_trigger_poc_time_wound implementation");
  assert.ok(code.includes("time_wound_triggered"), "time_wound_triggered updated in state");
  assert.ok(code.includes("glade_hook_unlocked"), "glade_hook_unlocked updated in state");
  assert.ok(code.includes("poc_maro_10m_edda_and_time_wound_event_authoritative_and_idempotent"), "unit test present");
});
