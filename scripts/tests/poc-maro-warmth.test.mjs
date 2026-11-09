// F-207: POC-02 Warmth — A Small Kindness (02:30–04:15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("maro-bell.json contains npc-spot-amber and workshop lantern-06 with correct coordinates", () => {
  const doc = JSON.parse(readFileSync(resolve(ROOT, "content/maps/maro-bell.json"), "utf8"));
  const structures = doc.structures;

  const amberSpot = structures.find((s) => s.id === "npc-spot-amber");
  assert.ok(amberSpot, "npc-spot-amber structure exists");
  assert.equal(amberSpot.x, 1, "amber x position is 1m");
  assert.equal(amberSpot.z, 28, "amber z position is 28m");

  const lantern06 = structures.find((s) => s.id === "lantern-06");
  assert.ok(lantern06, "lantern-06 structure exists");
  assert.equal(lantern06.x, -0.8, "lantern-06 x position is -0.8m");
  assert.equal(lantern06.z, 23.7, "lantern-06 z position is 23.7m");
  assert.ok(lantern06.size && lantern06.size.y >= 2.0, "lantern-06 has post height >= 2m");
});

test("MaroBellPocController.cs declares Amber NPC, workshop lantern 3D lighting, and errand lifecycle", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("AmberWorldPos = new(1.0f, 0f, 28.0f)"), "AmberWorldPos constant");
  assert.ok(code.includes("Lantern06WorldPos = new(-0.8f, 0f, 23.7f)"), "Lantern06WorldPos constant");
  assert.ok(code.includes("EntityView? AmberView"), "AmberView property");
  assert.ok(code.includes("Node3D? WorkshopLanternNode"), "WorkshopLanternNode property");
  assert.ok(code.includes("OmniLight3D? WorkshopLanternLight"), "WorkshopLanternLight property");
  assert.ok(code.includes("MeshInstance3D? WorkshopLanternGlowMesh"), "WorkshopLanternGlowMesh property");

  assert.ok(code.includes("public bool AmberErrandAccepted"), "AmberErrandAccepted property");
  assert.ok(code.includes("public bool AmberErrandCompleted"), "AmberErrandCompleted property");
  assert.ok(code.includes("public List<string> LanternsLit"), "LanternsLit property");
  assert.ok(code.includes("public int LanternOilCount"), "LanternOilCount property");

  assert.ok(code.includes("StartAmberErrand"), "StartAmberErrand method");
  assert.ok(code.includes("LightVillageLantern"), "LightVillageLantern method");
  assert.ok(code.includes("CompleteAmberErrand"), "CompleteAmberErrand method");
  assert.ok(code.includes("ActiveBeat = \"POC-02\""), "transitions active beat to POC-02");
});

test("MaroBellVerify.cs integrates VerifyPoc02WarmthAmberLanternErrand probe assertions", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellVerify.cs"), "utf8");

  assert.ok(code.includes("VerifyPoc02WarmthAmberLanternErrand(doc)"), "VerifyPoc02WarmthAmberLanternErrand called in Run()");
  assert.ok(code.includes("InteractWithAmber"), "InteractWithAmber verified");
  assert.ok(code.includes("OmniLight3D"), "OmniLight3D lighting verified");
  assert.ok(code.includes("CompleteAmberErrand"), "CompleteAmberErrand verified");
  assert.ok(code.includes("POC-02"), "beat transition verified");
});

test("server-rs meta engine registers accept_poc_amber_errand and complete_poc_amber_errand RPCs", () => {
  const code = readFileSync(resolve(ROOT, "server-rs/src/meta/engine.rs"), "utf8");

  assert.ok(code.includes("\"accept_poc_amber_errand\""), "accept_poc_amber_errand RPC registered");
  assert.ok(code.includes("\"complete_poc_amber_errand\""), "complete_poc_amber_errand RPC registered");
  assert.ok(code.includes("rpc_accept_poc_amber_errand"), "rpc_accept_poc_amber_errand implementation");
  assert.ok(code.includes("rpc_complete_poc_amber_errand"), "rpc_complete_poc_amber_errand implementation");
  assert.ok(code.includes("poc_maro_10m_amber_errand_authoritative_and_idempotent"), "unit test present");
});
