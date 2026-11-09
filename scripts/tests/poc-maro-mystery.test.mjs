// F-209: POC-04 Emotional Mystery — Bram's Old Lantern & First Trace (06:15–07:45).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("maro-bell.json contains npc-spot-bram and old-lantern hero prop with correct coordinates", () => {
  const doc = JSON.parse(readFileSync(resolve(ROOT, "content/maps/maro-bell.json"), "utf8"));
  const structures = doc.structures;

  const bramSpot = structures.find((s) => s.id === "npc-spot-bram");
  assert.ok(bramSpot, "npc-spot-bram structure exists");
  assert.equal(bramSpot.x, -3.5, "bram x position is -3.5m");
  assert.equal(bramSpot.z, -24, "bram z position is -24m");

  const oldLantern = structures.find((s) => s.id === "old-lantern");
  assert.ok(oldLantern, "old-lantern structure exists");
  assert.equal(oldLantern.x, 3.5, "old-lantern x position is 3.5m");
  assert.equal(oldLantern.z, -38, "old-lantern z position is -38m");
  assert.ok(oldLantern.size && oldLantern.size.y >= 2.0, "old-lantern has height >= 2m");
});

test("MaroBellPocController.cs declares Bram NPC, Old Lantern hero prop, and inspect lifecycle", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("BramWorldPos = new(-3.5f, 0f, -24.0f)"), "BramWorldPos constant");
  assert.ok(code.includes("OldLanternWorldPos = new(3.5f, 0f, -38.0f)"), "OldLanternWorldPos constant");
  assert.ok(code.includes("EntityView? BramView"), "BramView property");
  assert.ok(code.includes("Node3D? OldLanternNode"), "OldLanternNode property");
  assert.ok(code.includes("OmniLight3D? OldLanternLight"), "OldLanternLight property");
  assert.ok(code.includes("MeshInstance3D? OldLanternGlowMesh"), "OldLanternGlowMesh property");

  assert.ok(code.includes("public bool BramSpoken"), "BramSpoken property");
  assert.ok(code.includes("public bool TraceGlimpsed"), "TraceGlimpsed property");

  assert.ok(code.includes("InteractWithBram"), "InteractWithBram method");
  assert.ok(code.includes("InspectOldLantern"), "InspectOldLantern method");
  assert.ok(code.includes("ActiveBeat = \"POC-04\""), "transitions active beat to POC-04");

  // Last Cala Knight canon guardrail: female, unnumbered, zero forbidden reveals
  assert.ok(!code.includes("Ninth"), "must not include forbidden 'Ninth' reveal");
  assert.ok(!code.includes("9th"), "must not include forbidden '9th' reveal");
  assert.ok(!code.includes("Cala Knight"), "must not include explicit 'Cala Knight' reveal in player-facing dialogue");
});

test("MaroBellVerify.cs integrates VerifyPoc04EmotionalMysteryBramOldLantern probe assertions", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellVerify.cs"), "utf8");

  assert.ok(code.includes("VerifyPoc04EmotionalMysteryBramOldLantern(doc)"), "VerifyPoc04EmotionalMysteryBramOldLantern called in Run()");
  assert.ok(code.includes("InteractWithBram"), "InteractWithBram verified");
  assert.ok(code.includes("InspectOldLantern"), "InspectOldLantern verified");
  assert.ok(code.includes("TraceGlimpsed"), "TraceGlimpsed verified");
  assert.ok(code.includes("POC-04"), "POC-04 beat transition verified");
});

test("server-rs meta engine registers inspect_poc_old_lantern RPC with isolated persistence", () => {
  const code = readFileSync(resolve(ROOT, "server-rs/src/meta/engine.rs"), "utf8");

  assert.ok(code.includes("\"inspect_poc_old_lantern\""), "inspect_poc_old_lantern RPC registered");
  assert.ok(code.includes("rpc_inspect_poc_old_lantern"), "rpc_inspect_poc_old_lantern implementation");
  assert.ok(code.includes("trace_glimpsed"), "trace_glimpsed updated in state");
  assert.ok(code.includes("poc_maro_10m_bram_and_old_lantern_inspect_authoritative_and_idempotent"), "unit test present");
});
