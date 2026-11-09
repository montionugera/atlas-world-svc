// F-208: POC-03 Playfulness — The Missing Delivery (04:15–06:15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("game-client/assets/manifest.json registers mob:lantern_vermin and mob:soot_muncher with shared rig clips", () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "game-client/assets/manifest.json"), "utf8"));
  const entries = manifest.entries;
  assert.ok(entries, "manifest entries object exists");

  const requiredRigs = ["mob:lantern_vermin", "mob:soot_muncher"];
  for (const rigKey of requiredRigs) {
    const entry = entries[rigKey];
    assert.ok(entry, `manifest contains ${rigKey}`);
    assert.equal(entry.kind, "character", `${rigKey} kind is character`);
    assert.ok(entry.scene.startsWith("res://assets/characters/"), `${rigKey} scene points to character assets`);

    const relPath = entry.scene.replace("res://", "game-client/");
    const absPath = resolve(ROOT, relPath);
    assert.ok(existsSync(absPath), `${rigKey} scene file exists at ${relPath}`);

    const anims = entry.anims;
    assert.ok(anims, `${rigKey} anims object exists`);
    assert.ok(anims.idle, `${rigKey} has idle clip`);
    assert.ok(anims.walk, `${rigKey} has walk clip`);
    assert.ok(anims.run, `${rigKey} has run clip`);
    assert.ok(anims.attack, `${rigKey} has attack clip`);
    assert.ok(anims.hit, `${rigKey} has hit clip`);
    assert.ok(anims.death, `${rigKey} has death clip`);
  }
});

test("MaroBellPocController.cs declares Soot Muncher encounter, parcel recovery, and reset methods", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellPocController.cs"), "utf8");

  assert.ok(code.includes("SootMuncherWorldPos = new(12.0f, 0f, 6.0f)"), "SootMuncherWorldPos constant");
  assert.ok(code.includes("ParcelWorldPos = new(12.5f, 0f, 4.0f)"), "ParcelWorldPos constant");
  assert.ok(code.includes("EntityView? SootMuncherView"), "SootMuncherView property");
  assert.ok(code.includes("Node3D? ParcelNode"), "ParcelNode property");
  assert.ok(code.includes("public float SootMuncherHp"), "SootMuncherHp property");
  assert.ok(code.includes("public bool SootMuncherDefeated"), "SootMuncherDefeated property");
  assert.ok(code.includes("public bool ParcelRecovered"), "ParcelRecovered property");
  assert.ok(code.includes("public bool ParcelDeliveredToPip"), "ParcelDeliveredToPip property");

  assert.ok(code.includes("AttackSootMuncher"), "AttackSootMuncher method");
  assert.ok(code.includes("RecoverParcel"), "RecoverParcel method");
  assert.ok(code.includes("ReturnParcelToPip"), "ReturnParcelToPip method");
  assert.ok(code.includes("ResetVerminEncounter"), "ResetVerminEncounter method");
  assert.ok(code.includes("ActiveBeat = \"POC-03\""), "ActiveBeat POC-03 transition");
});

test("MaroBellVerify.cs integrates VerifyPoc03PlayfulnessSootMuncherEncounter probe assertions", () => {
  const code = readFileSync(resolve(ROOT, "game-client/src/World/MaroBellVerify.cs"), "utf8");

  assert.ok(code.includes("VerifyPoc03PlayfulnessSootMuncherEncounter(doc)"), "VerifyPoc03PlayfulnessSootMuncherEncounter called in Run()");
  assert.ok(code.includes("AttackSootMuncher"), "AttackSootMuncher verified");
  assert.ok(code.includes("RecoverParcel"), "RecoverParcel verified");
  assert.ok(code.includes("ReturnParcelToPip"), "ReturnParcelToPip verified");
  assert.ok(code.includes("ResetVerminEncounter"), "ResetVerminEncounter verified");
});

test("server-rs meta engine declares resolve_poc_vermin_combat, recover_poc_parcel, and reset_poc_vermin_encounter RPCs", () => {
  const code = readFileSync(resolve(ROOT, "server-rs/src/meta/engine.rs"), "utf8");

  assert.ok(code.includes("\"resolve_poc_vermin_combat\""), "resolve_poc_vermin_combat RPC registered");
  assert.ok(code.includes("\"recover_poc_parcel\""), "recover_poc_parcel RPC registered");
  assert.ok(code.includes("\"reset_poc_vermin_encounter\""), "reset_poc_vermin_encounter RPC registered");
  assert.ok(code.includes("rpc_resolve_poc_vermin_combat"), "rpc_resolve_poc_vermin_combat method");
  assert.ok(code.includes("rpc_recover_poc_parcel"), "rpc_recover_poc_parcel method");
  assert.ok(code.includes("rpc_reset_poc_vermin_encounter"), "rpc_reset_poc_vermin_encounter method");
  assert.ok(code.includes("poc_maro_10m_vermin_combat_and_parcel_recovery"), "unit test present");
});
